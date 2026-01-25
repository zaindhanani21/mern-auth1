import "dotenv/config";
import { sendTransferEmail, sendSecurityEmail, sendAddMoneyEmail } from "./mailHelper.js";
import express from "express";
import User from "./models/User.js";

import crypto from "crypto"; // Native Node.js module
import nodemailer from "nodemailer";

// Utility to create a URL-safe Base64 string (Required for JWT)
const base64UrlEncode = (obj) => {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

// Function to generate a Token without using 'jsonwebtoken' library
const generateNativeToken = (payload) => {
  const secret = process.env.JWT_SECRET || "szabist_secret_key_2026";
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
  const encodedPayload = base64UrlEncode(payload);

  // Create Signature using native HMAC-SHA256
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${encodedPayload}`)
    .digest("base64url");

  return `${header}.${encodedPayload}.${signature}`;
};
// Function to verify token without 'jsonwebtoken' library
const verifyNativeToken = (token) => {
  const secret = process.env.JWT_SECRET || "szabist_secret_key_2026";

  try {
    const [header, payload, signature] = token.split(".");

    // 1. Re-create the signature using the same secret
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    // 2. Compare. If they match, the token is authentic!
    if (signature === validSignature) {
      // Decode the payload from base64 back to JSON
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
      return decoded;
    }
    return null;
  } catch (err) {
    return null;
  }
};

const router = express.Router();

// 1. OTP Generation Function
const generateSimpleOtp = () => {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
};

// 2. NODEMAILER CONFIGURATION
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// --- SIGNIN ROUTE ---
router.post("/signin", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ message: "Please provide your email/phone and password." });
    }

    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { mobileNumber: identifier.trim() },
      ],
    }).select("+password firstName email mobileNumber isAdmin");

    if (!user || user.password !== password) {
      return res
        .status(400)
        .json({ message: "Invalid credentials. Please check your details." });
    }

    const otpCode = generateSimpleOtp();
    user.otp = otpCode;
    user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Wallexa Verification Code (2FA)",
      html: `<div style="font-family: Arial; padding: 20px;">
                    <h2>Security Verification</h2>
                    <p>Your 6-digit verification code is: <strong>${otpCode}</strong></p>
                   </div>`,
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).send({
      message: "OTP sent to your registered email address.",
      requiresOTP: true,
      userId: user._id,
      emailHint: user.email.replace(/(.{2})(.*)(?=@)/, "$1***"),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error during signin." });
  }
});

// --- SIGNUP ROUTE (Updated with Validation Error Handling) ---
// --- SIGNUP ROUTE (Corrected & Cleaned) ---
router.post("/signup", async (req, res) => {
  try {
    const {
      firstName,
      midName,
      lastName,
      email,
      mobileNumber,
      dateOfBirth,
      nationality,
      cnicNum,
      password,
    } = req.body;

    // 🟢 1. DYNAMIC AGE CALCULATION
    const birthDate = new Date(dateOfBirth);
    const today = new Date(); // Saturday, Jan 24, 2026
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();

    // Adjust age if birthday hasn't occurred yet this year/month
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age--;
    }

    if (age < 18) {
      return res.status(400).json({ 
        message: "Registration failed: You must be at least 18 years old to join Wallexa." 
      });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { mobileNumber: mobileNumber },
        { cnicNum: cnicNum },
      ],
    });

    if (existingUser) {
      let conflict = "User";
      if (existingUser.email === email.toLowerCase()) conflict = "Email";
      else if (existingUser.mobileNumber === mobileNumber) conflict = "Mobile Number";
      else if (existingUser.cnicNum === cnicNum) conflict = "CNIC";

      return res.status(400).json({ message: `${conflict} is already in use.` });
    }

    // 3. Create the user
    const newUser = new User({
      firstName,
      midName,
      lastName,
      email: email.toLowerCase(),
      mobileNumber,
      dateOfBirth,
      nationality,
      cnicNum,
      password,
      isVerified: false,
    });

    const otpCode = generateSimpleOtp();
    newUser.otp = otpCode;
    newUser.otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    await newUser.save();

    // 4. Send Email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: newUser.email,
      subject: "Wallexa Account Verification",
      html: `<p>Welcome! Your verification code is: <strong>${otpCode}</strong></p>`,
    };

    try {
      await transporter.sendMail(mailOptions);
      res.status(201).json({
        message: "Verification code sent.",
        userId: newUser._id,
        email: newUser.email,
        signupVerificationRequired: true,
      });
    } catch (mailError) {
      await User.findByIdAndDelete(newUser._id);
      return res.status(500).json({ message: "Failed to send verification email." });
    }

  } catch (err) {
    if (err.name === "ValidationError") {
      const firstErrorField = Object.keys(err.errors)[0];
      return res.status(400).json({ message: err.errors[firstErrorField].message });
    }
    res.status(500).json({ message: "Server error during signup." });
  }
});
// --- FORGOT PASSWORD (Sanitized version) ---
router.post("/forgot-password", async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res
        .status(400)
        .json({ message: "Please provide your email or mobile number." });
    }

    const sanitizedIdentifier = identifier.trim();
    const emailIdentifier = sanitizedIdentifier.toLowerCase();

    const user = await User.findOne({
      $or: [{ email: emailIdentifier }, { mobileNumber: sanitizedIdentifier }],
    });

    if (!user) {
      return res
        .status(404)
        .json({ message: "Account not found with these details." });
    }

    const otpCode = generateSimpleOtp();
    user.otp = otpCode;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Wallexa Password Reset OTP",
      html: `<div style="font-family: Arial; padding: 20px;">
                    <h3>Password Reset Request</h3>
                    <p>Hello ${user.firstName},</p>
                    <p>Your OTP for resetting your password is: <strong style="font-size: 20px; color: #0984e3;">${otpCode}</strong></p>
                    <p style="font-size: 12px; color: #636e72;">If you did not request this, please ignore this email.</p>
                   </div>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`🔑 Reset OTP for ${user.email}: ${otpCode}`);

    res.status(200).json({
      resetInitiated: true,
      userId: user._id,
      message: "OTP has been sent to your email.",
    });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ message: "Error initiating password reset." });
  }
});
// --- RESET PASSWORD (Confirm) ---
router.post("/reset-password", async (req, res) => {
  try {
    const { userId, otpCode, newPassword } = req.body;
    const user = await User.findById(userId);

    if (!user || user.otp !== otpCode || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    user.password = newPassword; // 🟢 Plain text as requested
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error resetting password." });
  }
});

// --- UPDATED OTP VERIFICATION (Login 2FA) ---
router.post("/verify-otp", async (req, res) => {
  const { userId, otpCode } = req.body;
  try {
    const user = await User.findById(userId);

    if (!user || user.otp !== otpCode || user.otpExpires < Date.now()) {
      return res.status(401).json({ message: "Invalid or expired code." });
    }

    // 🟢 NEW: Generate the Native Token
    const token = generateNativeToken({
      id: user._id,
      email: user.email,
    });

    // Clear OTP after successful use
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.status(200).json({
      message: "Login successful!",
      token: token, // 🟢 THE NEW TOKEN
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        balance: user.balance,
        isFrozen: user.isFrozen,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error." });
  }
});
// --- SIGNUP VERIFICATION ---
router.post("/verify-signup", async (req, res) => {
  const { userId, otpCode } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user || user.otp !== otpCode || user.otpExpires < Date.now()) {
      return res.status(401).json({ message: "Invalid or expired code." });
    }
    user.otp = null;
    user.otpExpires = null;
    user.isVerified = true;
    await user.save();
    res
      .status(200)
      .json({ message: "Registration successful!", verified: true });
  } catch (error) {
    res.status(500).json({ message: "Verification error." });
  }
});

export const protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = verifyNativeToken(token);

      // 🟢 CHANGE: Find the actual user in the database using the ID from the token
      // This ensures req.user is a real MongoDB document
      req.user = await User.findById(decoded.id || decoded._id).select(
        "-password",
      );

      if (!req.user) {
        return res
          .status(401)
          .json({ message: "Not authorized, user not found" });
      }

      next();
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    res.status(401).json({ message: "Not authorized, no token" });
  }
};

// 🟢 1. Route to send OTP specifically for Freeze/Unfreeze
router.post("/send-freeze-otp", protect, async (req, res) => {
  try {
    // 🟢 Use the ID from the protect middleware to find the user in DB
    const userId = req.user?._id || req.user?.id || req.user;
    const user = await User.findById(userId);

    // 🟢 Safety Check: Prevent "null" errors if session is invalid
    if (!user) {
      console.error("❌ USER NOT FOUND IN DB for ID:", userId);
      return res.status(404).json({ message: "User session not found. Please re-login." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 🟢 Step 1: Save the OTP and 10-minute expiry to the user object
    user.freezeOtp = otp;
    user.freezeOtpExpires = Date.now() + 10 * 60 * 1000; 

    // 🟢 Step 2: Ensure the save completes before sending the email
    await user.save();

    console.log(`✅ OTP [${otp}] saved for user: ${user.email}`);

    // 🟢 Step 3: Send the email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Security Alert: Wallet Status Change",
      text: `Your OTP to change your wallet status (Freeze/Unfreeze) is: ${otp}. This code expires in 10 minutes.`,
    });

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error) {
    console.error("OTP Send Error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🟢 2. Route to verify OTP and Toggle Freeze State
router.post("/verify-freeze-otp", protect, async (req, res) => {
  try {
    const { otp } = req.body;
    const userId = req.user?._id || req.user?.id;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🟢 Logic: Check if OTP matches and hasn't expired
    const isMatch = String(user.freezeOtp) === String(otp);
    const isNotExpired = user.freezeOtpExpires > Date.now();

    if (isMatch && isNotExpired) {
      user.isFrozen = !user.isFrozen; 

      // Clear security fields
      user.freezeOtp = undefined;
      user.freezeOtpExpires = undefined;
      await user.save();

      const statusText = user.isFrozen ? "FROZEN" : "UNFROZEN";
      
      try {
        // 📧 FIXED: Pass ONLY the statusText so it doesn't look like a transaction
        await sendSecurityEmail(
            user.email, 
            `Wallexa Security: Account ${statusText}`, 
            statusText
        );
        console.log(`✅ ${statusText} notification sent to ${user.email}`);
      } catch (mailErr) {
        console.error("❌ Security Mailer Error:", mailErr.message);
      }
      
      return res.status(200).json({
        message: user.isFrozen ? "Account Frozen ❄️" : "Account Unfrozen 🔥",
        isFrozen: user.isFrozen,
      });
    } else {
      return res.status(400).json({
        message: !isNotExpired ? "OTP has expired" : "Invalid OTP code",
      });
    }
  } catch (error) {
    console.error(error);
    // ✅ FIXED: Ensure return is used in the catch block
    return res.status(500).json({ message: "Verification failed" });
  }
});

export default router;