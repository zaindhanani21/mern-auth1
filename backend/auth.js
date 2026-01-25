import express from "express";
import User from "./models/User.js";
import Wallet from "./models/Wallet.js";
import PendingUser from "./models/PendingUser.js"; // 🟢 NEW
import mongoose from "mongoose";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// --- UTILS ---
const generateNativeToken = (payload) => {
  const secret = process.env.JWT_SECRET || "szabist_secret_key_2026";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${encodedPayload}`).digest("base64url");
  return `${header}.${encodedPayload}.${signature}`;
};

const verifyNativeToken = (token) => {
  if (!token) return null;
  const secret = process.env.JWT_SECRET || "szabist_secret_key_2026";
  try {
    const [header, payload, signature] = token.split(".");
    const validSignature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    if (signature === validSignature) {
      return JSON.parse(Buffer.from(payload, "base64url").toString());
    }
  } catch { return null; }
  return null;
};

// Middleware
export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  const decoded = verifyNativeToken(token);
  if (!decoded) return res.status(401).json({ message: "Not authorized" });

  req.user = await User.findById(decoded.id);
  if (!req.user) return res.status(401).json({ message: "User not found" });
  next();
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// --- UPDATED AUTH ROUTES ---

// 1. SIGN UP (Phase 1: Save to PendingUser -> Send OTP)
router.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, email, mobileNumber, dateOfBirth, nationality, cnicNum, password } = req.body;

    // check EXISTING USERS (Real)
    const existingUser = await User.findOne({
      $or: [{ email }, { mobileNumber }]
    });
    if (existingUser) {
      return res.status(400).json({ message: "Email or Mobile already registered." });
    }

    // Clean up any old pending requests for this email to avoid duplicates
    await PendingUser.deleteMany({ email });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to Pending Collection
    const pendingUser = new PendingUser({
      ...req.body,
      otp
    });
    await pendingUser.save();

    // Send Email
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Wallexa Verification Code",
        text: `Your verification code is ${otp}. It expires in 10 minutes.`
      });
    } catch (e) {
      console.error("Mail Error:", e);
      // We do NOT rollback here, user can retry or check spam.
    }

    res.status(201).json({
      message: "OTP sent to email.",
      userId: pendingUser._id, // This is the PENDING ID
      signupVerificationRequired: true,
      email
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Signup failed." });
  }
});

// 2. VERIFY SIGNUP (Phase 2: Move Pending -> Real User + Wallet)
router.post("/verify-signup", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId, otpCode } = req.body; // userId here is actually PendingUser ID

    // Find pending user WITHOUT session first to avoid issues
    const pending = await PendingUser.findById(userId);
    if (!pending) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid verification request. Please sign up again." });
    }

    if (pending.otp !== otpCode) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid OTP code. Please try again." });
    }

    // Double check conflict before commit (WITHOUT session to avoid locks)
    const conflict = await User.findOne({
      $or: [{ email: pending.email }, { mobileNumber: pending.mobileNumber }]
    });

    if (conflict) {
      await session.abortTransaction();
      session.endSession();
      // Clean up the pending user since they already exist
      await PendingUser.findByIdAndDelete(userId);
      return res.status(400).json({ message: "User already verified/exists. Please login instead." });
    }

    // Create REAL User (password is plain text from PendingUser, pre-save hook will hash it)
    const newUser = new User({
      firstName: pending.firstName,
      midName: pending.midName,
      lastName: pending.lastName,
      email: pending.email,
      mobileNumber: pending.mobileNumber,
      dateOfBirth: pending.dateOfBirth,
      nationality: pending.nationality,
      password: pending.password, // Pre-save hook will hash this!
      cnicEncrypted: User.encryptCNIC(pending.cnicNum),
      cnicHash: User.hashCNIC(pending.cnicNum),
      isEmailVerified: true
    });
    await newUser.save({ session });

    // Create Wallet
    const newWallet = new Wallet({
      userId: newUser._id,
      walletId: uuidv4(),
      currency: 'PKR',
      status: 'ACTIVE'
    });
    await newWallet.save({ session });

    // Delete Pending Record
    await PendingUser.findByIdAndDelete(userId).session(session);

    await session.commitTransaction();
    session.endSession();

    // Generate Token
    const token = generateNativeToken({ id: newUser._id });

    res.json({
      message: "Registration Successful!",
      token,
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        email: newUser.email,
        mobileNumber: newUser.mobileNumber
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Verification Error:", error);

    // Handle duplicate key error specifically
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(400).json({
        message: `This ${field} is already registered. Please login instead.`
      });
    }

    res.status(500).json({ message: "Verification failed. Please try again." });
  }
});

// 3. LOGIN (Existing Flow - No changes needed except separating verify-otp)
router.post("/signin", async (req, res) => {
  const { identifier, password } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email: identifier }, { mobileNumber: identifier }]
    }).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Login OTP",
        text: `Your Login OTP is ${otp}`
      });
    } catch (e) { console.error("Login Mail Error", e); }

    res.json({
      message: "OTP sent",
      requiresOTP: true,
      userId: user._id, // Real User ID
      email: user.email
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// 4. VERIFY LOGIN OTP
router.post("/verify-otp", async (req, res) => {
  const { userId, otpCode } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user || user.otp !== otpCode || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.otp = null;
    user.otpExpires = null;
    await user.save();

    const token = generateNativeToken({ id: user._id });

    res.json({
      message: "Login Success",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        email: user.email
      }
    });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// 5. FORGOT PASSWORD (Initiate)
router.post("/forgot-password", async (req, res) => {
  const { identifier } = req.body;
  try {
    const user = await User.findOne({
      $or: [{ email: identifier }, { mobileNumber: identifier }]
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset - Wallexa",
      text: `Your reset OTP is ${otp}`
    });

    res.json({ message: "OTP sent", userId: user._id, resetInitiated: true });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// 6. RESET PASSWORD (Finalize)
router.post("/reset-password", async (req, res) => {
  const { userId, otpCode, newPassword } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user || user.otp !== otpCode || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.password = newPassword;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// Freeze/Unfreeze OTP Request
router.post("/send-freeze-otp", protect, async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    req.user.otp = otp;
    req.user.otpExpires = Date.now() + 5 * 60 * 1000;
    await req.user.save();

    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: req.user.email,
      subject: "Security Alert: Wallet Status Change",
      text: `OTP to freeze/unfreeze wallet: ${otp}`
    });
    res.json({ message: "OTP sent" });
  } catch (error) { res.status(500).json({ message: "Error sending OTP" }); }
});

export default router;