import express from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { sendEmail } from "../emailService.js";
import crypto from "crypto";
import { protect } from "../auth.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import ExternalBank from "../models/ExternalBank.js";
import SplitRequest from "../models/SplitRequest.js";
import UbpsBill from "../models/UbpsBill.js";
import OneLinkBank from "../models/OneLinkBank.js";
import {
  sendMoneyReceivedEmail,
  sendMoneySentEmail,
  sendFundsAddedEmail,
  sendSecurityAlertEmail,
  sendSecurityOtpEmail,
  sendPinChangedEmail,
  sendSplitRequestEmail, // âœ… NEW LINE
} from "../mailHelper.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});
const router = express.Router();

// Helper to Create Notification
const notifyUser = async (userId, title, message, type, io) => {
  try {
    await Notification.create({ userId, title, message, type });
    if (io) {
      io.to(userId.toString()).emit("notification", { title, message, type });
    }
  } catch (e) {
    console.error("Notification Error:", e);
  }
};

// Helper to verify Transaction PIN & manage lockouts globally
const verifyTransactionPin = async (userId, pin) => {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) throw new Error("Wallet not found.");
  if (wallet.status === "FROZEN") throw new Error("Your wallet is Frozen.");

  // Agar force PIN change warning active ho
  if (wallet.mustResetPin) {
    throw new Error(
      "Security Alert: You must reset your Transaction PIN from your Profile tab before you can authorize any transactions.",
    );
  }

  if (!wallet.transactionPin) throw new Error("Transaction PIN not set.");
  if (!pin) throw new Error("Transaction PIN is required.");

  const isMatch = await bcrypt.compare(pin, wallet.transactionPin);
  if (!isMatch) {
    const newAttempts = wallet.failedPinAttempts + 1;
    if (newAttempts >= 3) {
      // Accounts ko freeze karein aur mustResetPin active karein (No cooldown timer)
      await Wallet.updateOne(
        { userId },
        {
          $set: {
            failedPinAttempts: newAttempts,
            status: "FROZEN",
            pinBlockUntil: null,
            mustResetPin: true,
          },
        },
      );

      // Security Alert Email send karein
      try {
        const user = await User.findById(userId);
        if (user && user.email) {
          await sendSecurityAlertEmail(
            user.email,
            "Too many incorrect PIN attempts. Your wallet has been Frozen. You will be required to change your transaction PIN before your next transaction.",
          );
        }
      } catch (emailErr) {
        console.error("Failed to send lockout email:", emailErr);
      }

      throw new Error(
        "Too many incorrect PIN attempts. Your wallet has been Frozen. You must unfreeze it and reset your PIN from your Profile.",
      );
    } else {
      await Wallet.updateOne(
        { userId },
        {
          $set: { failedPinAttempts: newAttempts },
        },
      );
      const attemptsLeft = 3 - newAttempts;
      throw new Error(
        `Incorrect Transaction PIN. ${attemptsLeft} attempt(s) remaining.`,
      );
    }
  }

  // Reset attempts back to 0 on successful entry
  if (wallet.failedPinAttempts > 0) {
    await Wallet.updateOne({ userId }, { $set: { failedPinAttempts: 0 } });
  }
};

// ðŸŸ¢ Helper to check Velocity Limit and Freeze Wallet if violated
const checkVelocityLimit = async (userId, userEmail, wallet, io) => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  // Check all outgoing/funding transactions of this user in the last 2 minutes
  const recentTxCount = await Transaction.countDocuments({
    $or: [
      { senderWallet: wallet._id },
      { receiverWallet: wallet._id, type: "ADD_MONEY" },
    ],
    createdAt: { $gte: twoMinutesAgo },
    status: "COMPLETED",
  });

  if (recentTxCount >= 3) {
    // Freeze Wallet permanently (bypass session/rollback to persist lock)
    await Wallet.updateOne({ _id: wallet._id }, { status: "FROZEN" });

    // In-memory status update for current request
    wallet.status = "FROZEN";

    // Create Security Notification
    await Notification.create({
      userId,
      title: "ðŸš¨ Wallet Locked",
      message:
        "Multiple transactions detected in a short time. Wallet locked for safety.",
      type: "SECURITY",
    });

    if (io) {
      io.to(userId.toString()).emit("notification", {
        title: "ðŸš¨ Wallet Locked",
        message: "Multiple transactions detected. Wallet locked for safety.",
        type: "SECURITY",
      });
    }

    // Send Email Alert
    await sendSecurityAlertEmail(
      userEmail,
      "Too many transactions (Velocity Limit Exceeded: 3 or more transactions in 2 minutes)",
    );

    throw new Error(
      "Suspicious activity: Velocity limit exceeded. Your wallet has been frozen.",
    );
  }
};

// ðŸŸ¢ Helper to verify OTP for Large Transactions (Returns true if success, false if blocked/needs OTP)
const verifyLargeTransactionOtp = async (req, res, amount, otp, actionName) => {
  if (Number(amount) >= 10000) {
    if (!otp) {
      // Generate OTP
      const generatedOtp = Math.floor(
        100000 + Math.random() * 900000,
      ).toString();
      req.user.otp = generatedOtp;
      req.user.otpExpires = Date.now() + 10 * 60 * 1000; // ðŸŸ¢ 10 mins
      req.user.otpAttempts = 0; // Reset attempts
      await req.user.save();

      // Send OTP Email
      await sendSecurityOtpEmail(req.user.email, Number(amount), generatedOtp);

      // Create security notification
      await Notification.create({
        userId: req.user._id,
        title: "ðŸ”’ OTP Verification Required",
        message: `A large transaction (${actionName}) of PKR ${amount} requires verification.`,
        type: "SECURITY",
      });

      res.json({
        requiresOtp: true,
        message: "Large transaction requires verification OTP.",
      });
      return false; // Stop API execution
    } else {
      // Verify OTP
      if (req.user.otp !== otp || req.user.otpExpires < Date.now()) {
        req.user.otpAttempts = (req.user.otpAttempts || 0) + 1;

        if (req.user.otpAttempts >= 3) {
          // Freeze Wallet permanently (bypass session to persist lock on abort)
          await Wallet.updateOne(
            { userId: req.user._id },
            { status: "FROZEN" },
          );

          req.user.otp = null;
          req.user.otpExpires = null;
          req.user.otpAttempts = 0;
          await req.user.save();

          // Send Alert Email
          await sendSecurityAlertEmail(
            req.user.email,
            `Too many failed OTP attempts during ${actionName} verification.`,
          );

          res
            .status(400)
            .json({
              message:
                "Too many failed OTP attempts. Your wallet has been frozen.",
            });
          return false; // Stop API execution
        }

        await req.user.save();
        res
          .status(400)
          .json({
            message: `Invalid OTP. Attempts remaining: ${3 - req.user.otpAttempts}`,
          });
        return false; // Stop API execution
      }

      // Correct OTP -> Reset OTP details on User
      req.user.otp = null;
      req.user.otpExpires = null;
      req.user.otpAttempts = 0;
      await req.user.save();
    }
  }
  return true; // Continue API execution
};

// 1. GET BALANCE & HISTORY
// 1. GET BALANCE (Dashboard API - Super Fast!)
router.get("/dashboard", protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    res.json({
      balance: wallet.balance,
      isFrozen: wallet.status === "FROZEN",
      isPinSet: wallet.isPinSet,
      mustResetPin: wallet.mustResetPin,
      failedPinAttempts: wallet.failedPinAttempts, // ðŸ‘ˆ failed attempts counter add kiya
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 1b. GET TRANSACTION HISTORY (Lazy Loaded - Fetched on demand)
router.get("/history", protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    // ðŸŸ¢ Deep Population: Is se batch query ke zarye instantly data load hota hai
    const history = await Transaction.find({
      $or: [{ senderWallet: wallet._id }, { receiverWallet: wallet._id }],
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "senderWallet",
        select: "walletId userId",
        populate: { path: "userId", select: "firstName lastName mobileNumber" },
      })
      .populate({
        path: "receiverWallet",
        select: "walletId userId",
        populate: { path: "userId", select: "firstName lastName mobileNumber" },
      });

    // ðŸŸ¢ In-Memory Loop: CPU memory mein microsecond mein response ready karta hai
    const enrichedHistory = history.map((tx) => {
      const isSender = tx.senderWallet?._id.equals(wallet._id);
      let otherPartyName = "Bank/System";
      let otherPartyMobile = "";

      if (tx.type === "SEND" || tx.type === "RECEIVE" || tx.type === "SPLIT_PAYMENT") {
        const otherWallet = isSender ? tx.receiverWallet : tx.senderWallet;
        if (otherWallet && otherWallet.userId) {
          otherPartyName = `${otherWallet.userId.firstName} ${otherWallet.userId.lastName}`;
          otherPartyMobile = otherWallet.userId.mobileNumber;
        }
 
        } else if (tx.type === "BILL_PAYMENT") {
          const cnMatch = tx.description?.match(/\|CN:(.+)$/);
          otherPartyMobile = cnMatch ? cnMatch[1] : "";
          otherPartyName = tx.description?.split(" Bill")[0]?.replace("Paid ", "") || "Utility";
        } else if (tx.type === "EXTERNAL_TRANSFER") {
          const desc = tx.description || "";
          let parsedBank = "Bank Partner";
          let parsedAccount = "";
          let parsedHolder = "";
  
          if (desc.includes(" â€” Holder: ")) {
            const parts = desc.replace("Sent to ", "").split(" â€” ");
            parsedBank = parts[0] || "Bank Partner";
            parsedAccount = parts[1] ? parts[1].replace("A/C: ", "") : "";
            parsedHolder = parts[2] ? parts[2].replace("Holder: ", "") : "";
          } else if (desc.includes(" A/C: ")) {
            const parts = desc.replace("Sent to ", "").split(" A/C: ");
            parsedBank = parts[0] || "Bank Partner";
            parsedAccount = parts[1] || "";
            parsedHolder = parsedBank; // Fallback
          } else {
            parsedBank = desc;
          }
  
          otherPartyName = parsedHolder;
          otherPartyMobile = parsedAccount;
          tx.bankNameVal = parsedBank;
        }

      return {
        _id: tx._id,
        amount: tx.amount,
        type: tx.type,
        description: tx.description,
        createdAt: tx.createdAt,
        isSender,
        otherPartyName,
        otherPartyMobile,
        bankName: tx.type === "EXTERNAL_TRANSFER" ? tx.bankNameVal : null,
      };
    });

    res.json({
      history: enrichedHistory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. ADD MONEY (Stripe Integration)
// 2. ADD MONEY (Stripe Integration)
// Route A: Initiate Stripe Checkout Session
router.post("/stripe-initiate", protect, async (req, res) => {
  try {
    const { amount } = req.body;

    // 1. Validate Amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Please enter a valid amount." });
    }

    // 2. Wallet & Status Validation
    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }
    if (wallet.status === "FROZEN") {
      return res.status(400).json({ message: "Wallet is Frozen." });
    }

    // 3. Velocity Limit Check
    await checkVelocityLimit(req.user._id, req.user.email, wallet, req.io);

    // 4. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "pkr",
            product_data: {
              name: "Wallexa Wallet Deposit",
              description: `Deposit for User: ${req.user.email}`,
            },
            unit_amount: Math.round(amount * 100), // Stripe expects amount in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://mern-auth1-qnmh.onrender.com/api/wallet/stripe-callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://mern-auth1-flame.vercel.app/`,
      metadata: {
        userId: req.user._id.toString(),
        amount: amount.toString(),
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Stripe Initiate Error:", error);
    res
      .status(500)
      .json({ message: error.message || "Internal server error." });
  }
});

// Route B: Stripe Redirect Callback
router.get("/stripe-callback", async (req, res) => {
  console.log("=== STRIPE CALLBACK HIT ===");
  const { session_id } = req.query;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!session_id) {
      await session.abortTransaction();
      session.endSession();
      return res.redirect(
      "https://mern-auth1-flame.vercel.app/?status=failed&message=Missing+session+id",
    );
    }

    // Retrieve session from Stripe
    const stripeSession = await stripe.checkout.sessions.retrieve(session_id);

    if (stripeSession.payment_status !== "paid") {
      await session.abortTransaction();
      session.endSession();
      return res.redirect(
      "https://mern-auth1-flame.vercel.app/?status=failed&message=Payment+not+completed",
    );
    }

    const userId = stripeSession.metadata.userId;
    const amount = Number(stripeSession.metadata.amount);

    if (!userId || isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.redirect(
      "https://mern-auth1-flame.vercel.app/?status=failed&message=Invalid+payment+metadata",
    );
    }

    // Replay attack check: Check duplicate session_id
    const existingTx = await Transaction.findOne({
      description: { $regex: session_id },
    }).session(session);
    if (existingTx) {
      await session.abortTransaction();
      session.endSession();
      return res.redirect(
      "https://mern-auth1-flame.vercel.app/?status=success&message=Funds+already+credited",
    );
    }

    // User & Wallet records fetch
    const user = await User.findById(userId).session(session);
    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.status === "FROZEN") throw new Error("Wallet is Frozen");

    // Update Wallet Balance
    wallet.balance += amount;
    await wallet.save({ session });

    // Create Transaction record
    const tx = new Transaction({
      receiverWallet: wallet._id,
      amount,
      type: "ADD_MONEY",
      description: `Deposit via Stripe (Session: ${session_id.slice(-8)})`,
    });
    await tx.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Real-time notification
    notifyUser(
      userId,
      "Funds Added âœ…",
      `PKR ${amount} has been added to your Wallexa wallet successfully!`,
      "TRANSACTION",
      req.io,
    );

    // Confirmation Email
    if (user && user.email) {
      sendFundsAddedEmail(user.email, amount);
    }

    // Redirect back to frontend
       // Line 463
       // Redirect back to frontend with details
    return res.redirect(`https://mern-auth1-flame.vercel.app/?status=success&amount=${amount}&txId=${tx._id}`);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Stripe Verification Error:", error);
    return res.redirect(
      `https://mern-auth1-flame.vercel.app/?status=failed&message=${encodeURIComponent(error.message)}`,
    );
  }
});

// 3. SEND MONEY (Peer-to-Peer)
router.post("/send-money", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { recipientMobile, amount, otp, transactionPin } = req.body;
    if (amount <= 0) throw new Error("Invalid amount");

    // Verify Transaction PIN
    await verifyTransactionPin(req.user._id, transactionPin);

    const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (senderWallet.status === "FROZEN")
      throw new Error("Your wallet is Frozen");
    if (senderWallet.balance < amount) throw new Error("Insufficient Balance");

    // Check velocity limit before sending money
    await checkVelocityLimit(
      req.user._id,
      req.user.email,
      senderWallet,
      req.io,
    );

    // Verify Large Transaction OTP
    const isVerified = await verifyLargeTransactionOtp(
      req,
      res,
      amount,
      otp,
      "Transfer",
    );
    if (!isVerified) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    // Find Recipient User first
    const recipientUser = await User.findOne({ mobileNumber: recipientMobile });
    if (!recipientUser) throw new Error("Recipient not found");
    if (recipientUser._id.equals(req.user._id))
      throw new Error("Cannot send to self");

    // Find Recipient Wallet
    const receiverWallet = await Wallet.findOne({
      userId: recipientUser._id,
    }).session(session);
    if (!receiverWallet) throw new Error("Recipient wallet not inactive");

    // Atomic Update
    senderWallet.balance -= Number(amount);
    receiverWallet.balance += Number(amount);

    await senderWallet.save({ session });
    await receiverWallet.save({ session });

    const tx = new Transaction({
      senderWallet: senderWallet._id,
      receiverWallet: receiverWallet._id,
      amount,
      type: "SEND", // Logic can distinguish SEND vs RECEIVE based on perspective
      description: req.body.isQrPayment ? `QR Payment to ${recipientMobile}` : `Transfer to ${recipientMobile}`,
    });
    await tx.save({ session });

    await session.commitTransaction();

    // Real-time Notifications
    notifyUser(
      req.user._id,
      "Money Sent",
      `Sent PKR ${amount} to ${recipientUser.firstName}`,
      "TRANSACTION",
      req.io,
    );
    notifyUser(
      recipientUser._id,
      "Money Received",
      `Received PKR ${amount} from ${req.user.firstName}`,
      "TRANSACTION",
      req.io,
    );

    // Send Emails
    sendMoneySentEmail(
      req.user.email,
      `${recipientUser.firstName} ${recipientUser.lastName}`,
      amount,
    );
    sendMoneyReceivedEmail(
      recipientUser.email,
      `${req.user.firstName} ${req.user.lastName}`,
      amount,
    );

    res.json({ message: "Transfer Successful", transaction: tx });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// 4. FREEZE / UNFREEZE (Verify OTP first)
router.post("/verify-freeze-otp", protect, async (req, res) => {
  const { otp } = req.body;
  try {
    if (req.user.otp !== otp || req.user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });

    // Toggle Status
    const newStatus = wallet.status === "ACTIVE" ? "FROZEN" : "ACTIVE";
    wallet.status = newStatus;

    // Agar manually account active (unfreeze) kiya hai toh failed attempts aur cooldown clear karein
    if (newStatus === "ACTIVE") {
      wallet.failedPinAttempts = 0;
      wallet.pinBlockUntil = null;
    }

    req.user.otp = null; // Clear OTP
    await req.user.save();
    await wallet.save();

    const msg =
      newStatus === "FROZEN" ? "Wallet Frozen â„ï¸" : "Wallet Unfrozen ðŸ”¥";
    notifyUser(req.user._id, "Security Alert", msg, "SECURITY", req.io);
        // âœ… NEW CODE: Send Email on Freeze/Unfreeze
    try {
      if (newStatus === "FROZEN") {
        sendSecurityAlertEmail(req.user.email, "Your wallet has been manually FROZEN. No transactions can be made until you unfreeze it.");
      } else {
        sendSecurityAlertEmail(req.user.email, "Your wallet has been successfully UNFROZEN and is now active.");
      }
    } catch (emailErr) {
      console.error("Mail Error:", emailErr);
    }

    res.json({ message: msg, isFrozen: newStatus === "FROZEN" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 5. GET NOTIFICATIONS
router.get("/notifications", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50); // Last 50 notifications

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 6. MARK NOTIFICATION AS READ
router.post("/mark-notification-read", protect, async (req, res) => {
  try {
    const { notificationId } = req.body;

    if (notificationId === "all") {
      // Mark all as read
      await Notification.updateMany(
        { userId: req.user._id, isRead: false },
        { isRead: true },
      );
      return res.json({ message: "All notifications marked as read" });
    }

    if (notificationId === "social") {
      // Mark all social comments & reactions notifications as read
      await Notification.updateMany(
        {
          userId: req.user._id,
          isRead: false,
          type: { $in: ["SOCIAL_COMMENT", "SOCIAL_REACT"] },
        },
        { isRead: true },
      );
      return res.json({ message: "Social notifications marked as read" });
    }

    // Mark single notification as read
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId: req.user._id },
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification marked as read", notification });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 7. PAY BILL
router.post("/pay-bill", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { provider, consumerNumber, amount, type, transactionPin } = req.body;
    if (amount <= 0) throw new Error("Invalid amount");

    // Verify Transaction PIN
    await verifyTransactionPin(req.user._id, transactionPin);

    const wallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.status === "FROZEN") throw new Error("Your wallet is Frozen");
    if (wallet.balance < amount) throw new Error("Insufficient Balance");
    // Check velocity limit before paying the bill
    await checkVelocityLimit(req.user._id, req.user.email, wallet, req.io);

    // Deduct from wallet
    wallet.balance -= Number(amount);
    await wallet.save({ session });

    const tx = new Transaction({
      senderWallet: wallet._id,
      receiverWallet: wallet._id, // System
      amount,
      type: "BILL_PAYMENT",
      description: `Paid ${provider} (${type}) for A/C ${consumerNumber}`,
    });
    await tx.save({ session });

    await session.commitTransaction();

    // Notify
    notifyUser(
      req.user._id,
      "Bill Paid",
      `Successfully paid PKR ${amount} for ${provider} bill.`,
      "TRANSACTION",
      req.io,
    );

    res.json({
      message: "Bill Payment Successful",
      newBalance: wallet.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// 8. REQUEST BILL SPLIT
router.post("/request-split", protect, async (req, res) => {
  try {
    // ðŸ”’ Check if user is currently blocked
    if (req.user.splitBlockUntil && req.user.splitBlockUntil > Date.now()) {
      const remainingMs = req.user.splitBlockUntil - Date.now();
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

      let timeMessage = "";
      if (hours > 0) {
        timeMessage = `${hours} ${hours === 1 ? "hour" : "hours"} and ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
      } else {
        timeMessage = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
      }

      throw new Error(
        `Request timeout. Please try again after ${timeMessage}.`,
      );
    }

    // ðŸ”’ Spam Control: Count requests in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentRequestCount = await SplitRequest.countDocuments({
      initiator: req.user._id,
      createdAt: { $gte: fiveMinutesAgo },
    });

    if (recentRequestCount >= 3) {
      // Block user for 2 hours
      req.user.splitBlockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await req.user.save();

      throw new Error(
        "Request timeout. Split request limit exceeded, blocked for 2 hours.",
      );
    }
    const { description, totalAmount, friends } = req.body;
    if (totalAmount <= 0) throw new Error("Invalid total amount");
    if (!friends || friends.length === 0)
      throw new Error("No friends selected for splitting.");

    let participants = [];
    let totalParticipantsAmount = 0; // ðŸ›¡ï¸ Sum track karne ke liye
    for (let f of friends) {
      const user = await User.findOne({ mobileNumber: f.mobileNumber });
      if (!user)
        throw new Error(`User with mobile ${f.mobileNumber} not found.`);
      if (user._id.equals(req.user._id)) continue; // skip self

      // ðŸ›¡ï¸ Check: Kisi bhi participant ki amount 0 ya negative nahi honi chahiye
      if (!f.amount || Number(f.amount) <= 0) {
        throw new Error(`Amount for ${user.firstName} must be greater than 0.`);
      }

      totalParticipantsAmount += Number(f.amount);
      participants.push({
        userId: user._id,
        amount: f.amount,
        status: "PENDING",
      });
    }

    // ðŸ›¡ï¸ Check: Sab participants ka sum total bill amount se zyada na ho
    if (totalParticipantsAmount > totalAmount) {
      throw new Error(
        `The total split amount for participants (PKR ${totalParticipantsAmount}) cannot exceed the total bill amount (PKR ${totalAmount}).`,
      );
    }

    if (participants.length === 0) throw new Error("No valid friends added.");

    const splitRequest = new SplitRequest({
      initiator: req.user._id,
      description,
      totalAmount,
      participants,
    });
    await splitRequest.save();

    // Notify participants
    for (let p of participants) {
      notifyUser(
        p.userId,
        "Bill Split Request",
        `${req.user.firstName} requested PKR ${p.amount} for ${description}`,
        "SPLIT_REQUEST",
        req.io,
      );
    }

        // âœ… NEW CODE: Send Emails to all participants
    try {
      for (const p of participants) {
        if (p.mobileNumber !== req.user.mobileNumber) {
          const participantUser = await User.findOne({ mobileNumber: p.mobileNumber });
          if (participantUser && participantUser.email) {
            sendSplitRequestEmail(
              participantUser.email,
              `${req.user.firstName} ${req.user.lastName}`,
              Number(p.amount),
              description
            );
          }
        }
      }
    } catch (emailErr) {
      console.error("Split Request Mail Error:", emailErr);
    }

    res.json({ message: "Split Request Sent", splitRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// 9. GET SPLIT REQUESTS
router.get("/get-splits", protect, async (req, res) => {
  try {
    // Find requests where the user is a participant OR the initiator
    const requests = await SplitRequest.find({
      $or: [
        { "participants.userId": req.user._id },
        { initiator: req.user._id },
      ],
    })
      .populate("initiator", "firstName lastName mobileNumber")
      .populate("participants.userId", "firstName lastName mobileNumber")
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 10. ACCEPT SPLIT REQUEST
router.post("/accept-split", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { splitId, otp, transactionPin } = req.body;

    // Verify Transaction PIN
    await verifyTransactionPin(req.user._id, transactionPin);

    const split = await SplitRequest.findById(splitId).session(session);
    if (!split) throw new Error("Split request not found");

    const participantIndex = split.participants.findIndex((p) =>
      p.userId.equals(req.user._id),
    );
    if (participantIndex === -1)
      throw new Error("You are not part of this split request");

    const participant = split.participants[participantIndex];
    if (participant.status === "ACCEPTED")
      throw new Error("You have already paid this split");

    const amount = participant.amount;

    const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (senderWallet.status === "FROZEN")
      throw new Error("Your wallet is Frozen");
    if (senderWallet.balance < amount) throw new Error("Insufficient Balance");

    // Check velocity limit before accepting/paying split
    await checkVelocityLimit(
      req.user._id,
      req.user.email,
      senderWallet,
      req.io,
    );

    // Verify Large Transaction OTP
    const isVerified = await verifyLargeTransactionOtp(
      req,
      res,
      amount,
      otp,
      "Split Bill Payment",
    );
    if (!isVerified) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    const receiverWallet = await Wallet.findOne({
      userId: split.initiator,
    }).session(session);

    // Deduct/Add
    senderWallet.balance -= Number(amount);
    receiverWallet.balance += Number(amount);

    await senderWallet.save({ session });
    await receiverWallet.save({ session });

    // Update participant status
    split.participants[participantIndex].status = "ACCEPTED";

    // Check if all paid
    const allPaid = split.participants.every((p) => p.status === "ACCEPTED");
    if (allPaid) {
      split.status = "COMPLETED";
    } else {
      split.status = "PARTIALLY_PAID";
    }
    await split.save({ session });

    // Record Transaction
    const tx = new Transaction({
      senderWallet: senderWallet._id,
      receiverWallet: receiverWallet._id,
      amount,
      type: "SPLIT_PAYMENT",
      description: `Split Paid: ${split.description}`,
    });
    await tx.save({ session });

    await session.commitTransaction();

    // Notify Initiator
    // Notify Initiator
    notifyUser(
      split.initiator,
      "Split Paid",
      `${req.user.firstName} paid their share (PKR ${amount}) for ${split.description}`,
      "TRANSACTION",
      req.io,
    );

    // Notify Acceptor (Self)
    notifyUser(
      req.user._id,
      "Split Approved",
      `You paid PKR ${amount} for ${split.description}`,
      "TRANSACTION",
      req.io,
    );
        // âœ… NEW CODE: Send Emails for Split Payment
    try {
      // 1. Jisne Pay kiya (Payer) usko email bhejo
      sendMoneySentEmail(
        req.user.email,
        `${initiatorUser.firstName} ${initiatorUser.lastName} (Split Bill)`,
        Number(amount)
      );

      // 2. Jisne Request bheji thi (Requester) usko email bhejo
      sendMoneyReceivedEmail(
        initiatorUser.email,
        `${req.user.firstName} ${req.user.lastName} (Split Bill)`,
        Number(amount)
      );
    } catch (emailErr) {
      console.error("Split Mail Error:", emailErr);
    }

    // ðŸ”„ Real-time sync for other participants
    for (const p of split.participants) {
      if (!p.userId.equals(req.user._id)) {
        notifyUser(
          p.userId,
          "Split Updated",
          `${req.user.firstName} paid their share for ${split.description}`,
          "SPLIT_REQUEST",
          req.io,
        );
      }
    }

    res.json({ message: "Split Paid Successfully", transaction: tx });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// 11. REJECT SPLIT REQUEST
router.post("/reject-split", protect, async (req, res) => {
  try {
    const { splitId } = req.body;
    const split = await SplitRequest.findById(splitId).populate(
      "initiator",
      "firstName lastName",
    );
    if (!split) throw new Error("Split request not found");

    const participantIndex = split.participants.findIndex((p) =>
      p.userId.equals(req.user._id),
    );
    if (participantIndex === -1)
      throw new Error("You are not part of this split request");

    if (split.participants[participantIndex].status !== "PENDING")
      throw new Error("You have already responded to this request");

    split.participants[participantIndex].status = "REJECTED";
    await split.save();

    // Notify Initiator
    notifyUser(
      split.initiator._id,
      "Split Rejected",
      `${req.user.firstName} rejected the split request for ${split.description}`,
      "SPLIT_REJECTED",
      req.io,
    );

    // Notify Rejector (Self)
    notifyUser(
      req.user._id,
      "Split Rejected",
      `You rejected the split request from ${split.initiator.firstName}`,
      "SPLIT_REJECTED",
      req.io,
    );

    // ðŸ”„ Real-time sync for other participants
    for (const p of split.participants) {
      if (!p.userId.equals(req.user._id)) {
        notifyUser(
          p.userId,
          "Split Updated",
          `${req.user.firstName} rejected the split request for ${split.description}`,
          "SPLIT_REQUEST",
          req.io,
        );
      }
    }

    res.json({ message: "Split Rejected successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
// ============================================================
// 12. SEND EXTERNAL BANK MONEY (1LINK IBFT SWITCH)
// ============================================================

// 11. VALIDATE EXTERNAL BANK ACCOUNT (Secure IBAN + Account Number)
router.post("/validate-external-account", protect, async (req, res) => {
  try {
    const { bankName, accountNumber, mode } = req.body;

    // Security Check: Strictly alphanumeric check (no script tags or quotes), length 6 to 24
    if (!accountNumber || !/^[a-zA-Z0-9]{6,24}$/.test(accountNumber.trim())) {
      return res
        .status(400)
        .json({
          message:
            "Invalid Account/IBAN format. Use only numbers and letters (6-24 chars).",
        });
    }
    if (!bankName) {
      return res.status(400).json({ message: "Please select a bank" });
    }

    if (mode === "local") {
      // Local mode mein dynamic check (Account Number OR IBAN)
      const account = await OneLinkBank.findOne({
        bankName: bankName,
        $or: [
          { accountNumber: accountNumber.trim() },
          { iban: accountNumber.trim().toUpperCase() },
        ],
      });

      if (!account) {
        return res
          .status(404)
          .json({
            message: `Account/IBAN ${accountNumber} not registered in ${bankName}`,
          });
      }

      return res.json({
        valid: true,
        accountHolderName: account.accountHolder,
      });
    } else {
      // Stripe Mode: Validate routing/account sandbox format
      if (accountNumber.trim().length < 9 || accountNumber.trim().length > 12) {
        return res
          .status(400)
          .json({
            message:
              "Stripe Sandbox account number must be between 9 to 12 digits",
          });
      }

      return res.json({
        valid: true,
        accountHolderName: `${req.user.firstName} ${req.user.lastName} (Stripe Sandbox)`,
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: error.message || "Internal server error." });
  }
});

// 12. SEND IBFT MONEY TO BANK ACCOUNT
router.post("/send-external-money", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { bankName, accountNumber, amount, otp, mode, transactionPin } =
      req.body;

    // Verify Transaction PIN
    await verifyTransactionPin(req.user._id, transactionPin);
    let token = null;

    // Security Check: Strictly alphanumeric check, length 6 to 24
    if (!accountNumber || !/^[a-zA-Z0-9]{6,24}$/.test(accountNumber.trim())) {
      throw new Error(
        "Invalid Account/IBAN format. Use only numbers and letters (6-24 chars).",
      );
    }
    if (!amount || Number(amount) <= 0) {
      throw new Error("Please enter a valid transfer amount");
    }
    if (!bankName) {
      throw new Error("Please select a bank");
    }

    // Check Wallexa Wallet Balance
    const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (!senderWallet) throw new Error("Wallet not found");
    if (senderWallet.status === "FROZEN")
      throw new Error("Your wallet is Frozen. Please unfreeze first.");
    if (senderWallet.balance < Number(amount))
      throw new Error("Insufficient Wallet Balance");

    // Check velocity limit before sending bank transfer
    await checkVelocityLimit(
      req.user._id,
      req.user.email,
      senderWallet,
      req.io,
    );

    // Verify Large Transaction OTP
    const isVerified = await verifyLargeTransactionOtp(
      req,
      res,
      amount,
      otp,
      "Bank Transfer",
    );
    if (!isVerified) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    let recipientAccount = null;

    // Mode Check: Agar mode 'stripe' ho toh Stripe API call karein, warna local DB transfer
    if (mode === "stripe") {
      try {
        token = await stripe.tokens.create({
          bank_account: {
            country: "US",
            currency: "usd",
            account_holder_name: `${req.user.firstName} ${req.user.lastName}`,
            account_holder_type: "individual",
            routing_number: "110000000",
            account_number: accountNumber.trim(),
          },
        });
      } catch (stripeError) {
        throw new Error(
          `Bank Payout Declined by Stripe: ${stripeError.message}`,
        );
      }
    } else {
      // Local mode: Find target recipient account in simulated MongoDB 1Link DB (Search by Account Number OR IBAN)
      recipientAccount = await OneLinkBank.findOne({
        bankName: bankName,
        $or: [
          { accountNumber: accountNumber.trim() },
          { iban: accountNumber.trim().toUpperCase() },
        ],
      }).session(session);

      if (!recipientAccount) {
        throw new Error(
          `Bank account/IBAN ${accountNumber} not registered in our simulated database`,
        );
      }
    }

    // Deduct from Sender's Wallexa Wallet
    senderWallet.balance -= Number(amount);
    await senderWallet.save({ session });

    // Credit to Target bank account in database (if local mode)
    if (recipientAccount) {
      recipientAccount.balance += Number(amount);
      await recipientAccount.save({ session });
    }

    // Save Transaction History
    const tx = new Transaction({
      senderWallet: senderWallet._id,
      receiverWallet: null,
      amount: Number(amount),
      type: "EXTERNAL_TRANSFER",
      status: "COMPLETED",
      description: `Sent to ${bankName} â€” A/C: â€¢â€¢â€¢â€¢${accountNumber.trim().slice(-4)} â€” Holder: ${recipientAccount ? recipientAccount.accountHolder : (token ? "Stripe Sandbox User" : "Bank Partner")}`,
    });
    await tx.save({ session });

    await session.commitTransaction();

    // Real-time Socket Notification
    notifyUser(
      req.user._id,
      "Transfer Successful ðŸ¦",
      `PKR ${amount} sent to ${bankName} account ending in ${accountNumber.trim().slice(-4)}`,
      "TRANSACTION",
      req.io,
    );

    // Send Email Confirmation
    try {
      sendMoneySentEmail(
        req.user.email,
        `${bankName} (A/C: â€¢â€¢â€¢â€¢${accountNumber.trim().slice(-4)})`,
        Number(amount),
      );
    } catch (mailErr) {
      console.error("Mail Error:", mailErr);
    }

    res.json({
      message: "Bank Transfer Successful!",
      newBalance: senderWallet.balance,
      stripeToken: token ? token.id : null,
      transaction: tx,
      recipientName: recipientAccount ? recipientAccount.accountHolder : (token ? "Stripe Sandbox User" : "Bank Partner"),
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// ============================================================
// UTILITY BILLING â€” 1LINK UBPS SIMULATED REGISTRY
// ============================================================

// 11. FETCH BILLS FROM DATABASE
router.get("/fetch-bills", protect, async (req, res) => {
  try {
    const { billType, consumerNumber } = req.query;

    if (!billType || !consumerNumber) {
      return res
        .status(400)
        .json({ message: "Bill type and consumer number are required." });
    }

    // Validate: Consumer number must be numeric digits between 11 and 13
    if (!/^\d{11,13}$/.test(consumerNumber)) {
      return res
        .status(400)
        .json({
          message: "Invalid consumer number. Must be between 11 to 13 digits.",
        });
    }

    // Find the bill in our local MongoDB registry
    const bill = await UbpsBill.findOne({ consumerNumber, billType });

    if (!bill) {
      return res.status(404).json({
        message:
          "No utility record found for this consumer number and category in the central 1Link switch.",
      });
    }

    // Return the detailed Karachi bill metadata
    // Return the detailed Karachi bill metadata
    res.json({
      consumerNumber: bill.consumerNumber,
      contractNumber: bill.contractNumber,
      billType: bill.billType,
      provider: bill.provider,
      ownerName: bill.ownerName,
      invoices: [
        {
          invoiceId: bill._id.toString(),
          billMonth: bill.billMonth,
          amount: bill.amountDue,
          lateFee: bill.lateFee,
          amountAfterDueDate: bill.amountAfterDueDate,
          dueDate: bill.dueDate
            ? new Date(bill.dueDate).toLocaleDateString("en-PK", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "N/A",
          rawDueDate: bill.dueDate ? bill.dueDate.toISOString() : null, // ðŸŸ¢ Raw ISO date added
          status: bill.status,
          billType: bill.billType,
          contractNumber: bill.contractNumber,
          unitsConsumed: bill.unitsConsumed,
          ownerName: bill.ownerName,
          provider: bill.provider,
        },
      ],
    });
  } catch (error) {
    console.error("Fetch Bills Error:", error);
    res
      .status(500)
      .json({ message: error.message || "Could not fetch bills." });
  }
});

// 12. PAY SELECTED BILLS VIA LOCAL WALLET
router.post("/pay-selected-bills", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { invoiceIds, otp, transactionPin } = req.body;

    // Verify Transaction PIN
    await verifyTransactionPin(req.user._id, transactionPin);

    if (!invoiceIds || invoiceIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "No invoices selected for payment." });
    }

    let totalAmount = 0;
    const billsToPay = [];

    // Fetch and validate invoice details from MongoDB
    for (const invoiceId of invoiceIds) {
      const bill = await UbpsBill.findById(invoiceId).session(session);

      if (!bill) {
        throw new Error(`Invoice record not found.`);
      }

      if (bill.status === "PAID") {
        throw new Error(`Bill for ${bill.billMonth} is already paid.`);
      }

      // ðŸŸ¢ Check if bill is past due date dynamically
      const isLate = bill.dueDate && new Date() > new Date(bill.dueDate);
      const payableAmount = isLate ? bill.amountAfterDueDate : bill.amountDue;

      totalAmount += payableAmount;
      billsToPay.push({ bill, payableAmount, isLate });
    }

    // Verify Sender Wallet
    const wallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (!wallet) throw new Error("Wallet not found.");
    if (wallet.status === "FROZEN") throw new Error("Your wallet is Frozen.");
    if (wallet.balance < totalAmount)
      throw new Error(`Insufficient wallet balance.`);

    // Check velocity limit before payment
    await checkVelocityLimit(req.user._id, req.user.email, wallet, req.io);

    // Verify Large Transaction OTP (>10,000 PKR requires OTP)
    const isVerified = await verifyLargeTransactionOtp(
      req,
      res,
      totalAmount,
      otp,
      "Bill Payment",
    );
    if (!isVerified) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    // Deduct from sender wallet
    wallet.balance -= totalAmount;
    await wallet.save({ session });

    let lastTx = null;
    // Mark each bill as PAID and record transaction
    for (const item of billsToPay) {
      const { bill, payableAmount, isLate } = item;
      bill.status = "PAID";
      await bill.save({ session });

      const tx = new Transaction({
        senderWallet: wallet._id,
        receiverWallet: wallet._id,
        amount: payableAmount,
        type: "BILL_PAYMENT",
        status: "COMPLETED",
        description: `Paid ${bill.provider} Bill â€” ${bill.billMonth}${isLate ? " (Late surcharge included)" : ""}|CN:${bill.consumerNumber}`,
      });
      await tx.save({ session });
      lastTx = tx;
    }

    await session.commitTransaction();
    session.endSession();

    // Send real-time notification
    notifyUser(
      req.user._id,
      "Bills Paid âœ…",
      `PKR ${totalAmount.toLocaleString()} deducted for ${invoiceIds.length} bill(s).`,
      "TRANSACTION",
      req.io,
    );

    res.json({
      message: `Successfully paid ${invoiceIds.length} bill(s)!`,
      totalPaid: totalAmount,
      newBalance: wallet.balance,
      transaction: lastTx,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Pay Bills Error:", error);
    res.status(400).json({ message: error.message || "Payment failed." });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ROUTE 2: Pay Selected Bills via Stripe
// POST /api/wallet/pay-selected-bills
// Body: { invoiceIds: ['in_xxx', 'in_yyy'] }
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/pay-selected-bills", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { invoiceIds, otp } = req.body;

    if (!invoiceIds || invoiceIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "No invoices selected for payment." });
    }

    // Step 1: Stripe se har invoice ki details fetch karo
    let totalAmount = 0;
    const invoiceDetails = [];

    for (const invoiceId of invoiceIds) {
      const invoice = await stripe.invoices.retrieve(invoiceId);

      if (invoice.status !== "open") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `Invoice ${invoice.metadata?.billMonth || invoiceId} is already paid or invalid.`,
        });
      }

      totalAmount += invoice.amount_due / 100;
      invoiceDetails.push(invoice);
    }

    // Step 2: User ka wallet check karo
    const wallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (!wallet) throw new Error("Wallet not found.");
    if (wallet.status === "FROZEN") throw new Error("Your wallet is Frozen.");
    if (wallet.balance < totalAmount) throw new Error(` Insufficient balance`);

    // Check velocity limit before paying bills
    await checkVelocityLimit(req.user._id, req.user.email, wallet, req.io);

    // Verify Large Transaction OTP
    const isVerified = await verifyLargeTransactionOtp(
      req,
      res,
      totalAmount,
      otp,
      "Bill Payment",
    );
    if (!isVerified) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    // Step 3: Wallet se paise kato
    wallet.balance -= totalAmount;
    await wallet.save({ session });

    // Step 4: Har invoice ke liye Stripe par paid mark karo
    for (const invoice of invoiceDetails) {
      await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });

      // Transaction history mein save karo
      const tx = new Transaction({
        senderWallet: wallet._id,
        receiverWallet: wallet._id,
        amount: invoice.total / 100,
        type: "BILL_PAYMENT",
        description: `Paid ${invoice.metadata?.billType || "Utility"} â€” ${invoice.metadata?.billMonth || ""}`,
      });
      await tx.save({ session });
    }

    // Step 5: Database transaction commit karo
    await session.commitTransaction();
    session.endSession();

    // Step 6: Real-time notification bhejo
    notifyUser(
      req.user._id,
      "Bills Paid âœ…",
      `PKR ${totalAmount.toLocaleString()} deducted for ${invoiceIds.length} bill(s).`,
      "TRANSACTION",
      req.io,
    );

    res.json({
      message: `Successfully paid ${invoiceIds.length} bill(s)!`,
      totalPaid: totalAmount,
      newBalance: wallet.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Pay Bills Error:", error);
    res.status(400).json({ message: error.message || "Payment failed." });
  }
});

// 12. EXTENSION CHECKOUT (Chrome Extension One-Tap Checkout)
router.post("/extension-checkout", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { merchantMobile, amount, description, otp } = req.body;
    if (amount <= 0) throw new Error("Invalid checkout amount");

    const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(
      session,
    );
    if (senderWallet.status === "FROZEN")
      throw new Error("Your wallet is Frozen. Please unfreeze first.");
    if (senderWallet.balance < amount)
      throw new Error("Insufficient Balance in Wallexa Wallet.");

    // Check velocity limit (Rule 1)
    await checkVelocityLimit(
      req.user._id,
      req.user.email,
      senderWallet,
      req.io,
    );

    // Verify Large Transaction OTP (Rule 2)
    const isVerified = await verifyLargeTransactionOtp(
      req,
      res,
      amount,
      otp,
      `Merchant Checkout: ${description}`,
    );
    if (!isVerified) {
      await session.abortTransaction();
      session.endSession();
      return;
    }

    // Find Merchant User (Money will go to this merchant account)
    const merchantUser = await User.findOne({ mobileNumber: merchantMobile });
    if (!merchantUser)
      throw new Error("Merchant account not registered on Wallexa.");
    if (merchantUser._id.equals(req.user._id))
      throw new Error("Cannot pay to yourself.");

    // Find Merchant Wallet
    const receiverWallet = await Wallet.findOne({
      userId: merchantUser._id,
    }).session(session);
    if (!receiverWallet) throw new Error("Merchant wallet is inactive.");

    // Transfer funds
    senderWallet.balance -= Number(amount);
    receiverWallet.balance += Number(amount);

    await senderWallet.save({ session });
    await receiverWallet.save({ session });

    // Save Transaction history
    const tx = new Transaction({
      senderWallet: senderWallet._id,
      receiverWallet: receiverWallet._id,
      amount: Number(amount),
      type: "SEND",
      description: `Checkout: ${description}`,
    });
    await tx.save({ session });

    await session.commitTransaction();

    // Real-time notification to merchant
    notifyUser(
      merchantUser._id,
      "Payment Received ðŸ’°",
      `Received PKR ${amount} from ${req.user.firstName} for ${description}`,
      "TRANSACTION",
      req.io,
    );

    // Real-time notification to customer
    notifyUser(
      req.user._id,
      "Checkout Payment Sent ðŸ“¤",
      `Paid PKR ${amount} to ${merchantUser.firstName} for ${description}`,
      "TRANSACTION",
      req.io,
    );

    // Send confirmation emails
    sendMoneySentEmail(
      req.user.email,
      `${merchantUser.firstName} ${merchantUser.lastName}`,
      amount,
    );
    sendMoneyReceivedEmail(
      merchantUser.email,
      `${req.user.firstName} ${req.user.lastName}`,
      amount,
    );

    res.json({
      message: "Checkout Payment Successful",
      newBalance: senderWallet.balance,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// ==========================================
// ðŸ” TRANSACTION PIN SECURE API ROUTES
// ==========================================

// A. SETUP TRANSACTION PIN
router.post("/setup-pin", protect, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res
        .status(400)
        .json({ message: "PIN must be exactly 6 numeric digits." });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }

    // Hash the PIN using bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(pin, salt);

    wallet.transactionPin = hashedPin;
    wallet.isPinSet = true;
    wallet.failedPinAttempts = 0;
    await wallet.save();

    res.json({ message: "Transaction PIN set successfully." });
  } catch (err) {
    console.error("Setup PIN Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// A2. CHANGE PIN - VERIFY CURRENT PIN & SEND EMAIL OTP
// A2. CHANGE PIN - VERIFY CURRENT PIN & SEND EMAIL OTP
router.post("/change-pin/verify-current", protect, async (req, res) => {
  try {
    const { currentPin } = req.body;

    // 1. PIN format check karein
    if (!currentPin || !/^\d{6}$/.test(currentPin)) {
      return res
        .status(400)
        .json({ message: "PIN must be exactly 6 numeric digits." });
    }

    // 2. Database se wallet dhoondein
    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }

    // 3. Current PIN check karein
    const isMatch = await bcrypt.compare(currentPin, wallet.transactionPin);

    if (!isMatch) {
      const newAttempts = wallet.failedPinAttempts + 1;

      // Database mein attempts save karein (bina freeze kiye)
      await Wallet.updateOne(
        { userId: req.user._id },
        {
          $set: { failedPinAttempts: newAttempts },
        },
      );

      // Agar 3 attempts ho chuke hain toh sirf UI block ke liye signal return karein
      if (newAttempts >= 3) {
        return res.status(403).json({
          isBlocked: true,
          failedPinAttempts: newAttempts,
        });
      } else {
        const attemptsLeft = 3 - newAttempts;
        return res.status(400).json({
          message: `Incorrect Transaction PIN. ${attemptsLeft} attempt(s) remaining.`,
          attemptsLeft,
          failedPinAttempts: newAttempts,
        });
      }
    }

    // Sahi PIN hone par counter 0 karein
    wallet.failedPinAttempts = 0;

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000;

    wallet.pinResetOtp = otp;
    wallet.pinResetOtpExpiry = otpExpiry;
    await wallet.save();

    // Send OTP Email
    try {
      await sendEmail({
        to: req.user.email,
        subject: "Transaction PIN Change OTP - Wallexa",
        html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
                        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa Security</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <h2 style="color: #1e293b; margin-top: 0;">Change Your Transaction PIN</h2>
                            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
                                You requested to change your 6-digit transaction PIN. Please use the verification OTP code below:
                            </p>
                            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                                <span style="font-size: 32px; font-weight: 700; color: #4f46e5; letter-spacing: 5px;">${otp}</span>
                            </div>
                            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
                                This OTP code is valid for 10 minutes. If you did not request this, please secure your login immediately.
                            </p>
                        </div>
                    </div>
                `,
      });
    } catch (e) {
      console.error("PIN Change Mail Error:", e);
      return res
        .status(500)
        .json({ message: "Failed to send verification OTP email." });
    }

    res.json({ message: "Verification OTP code sent to your email." });
  } catch (err) {
    console.error("Change PIN Error:", err);
    res.status(500).json({ message: err.message });
  }
});
// B. FORGOT PIN - VERIFY PASSWORD & SEND EMAIL OTP
router.post("/forgot-pin/verify-password", protect, async (req, res) => {
  try {
    const { password, identifier } = req.body;
    if (!password || !identifier) {
      return res
        .status(400)
        .json({
          message: "Password and registered Email/Mobile are required.",
        });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Verify manually typed email/phone matches user's original credentials
    const cleanedIdentifier = identifier.trim().toLowerCase();
    const userEmail = req.user.email.toLowerCase();
    const userMobile = req.user.mobileNumber;

    if (cleanedIdentifier !== userEmail && cleanedIdentifier !== userMobile) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    wallet.pinResetOtp = otp;
    wallet.pinResetOtpExpiry = otpExpiry;
    await wallet.save();

    // Send OTP via email using self-contained transporter
    try {
      await sendEmail({
        to: user.email,
        subject: "Transaction PIN Reset OTP - Wallexa",
        html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
                        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa Security</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <h2 style="color: #1e293b; margin-top: 0;">Reset Your Transaction PIN</h2>
                            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
                                You requested to reset your 6-digit transaction PIN. Please use the verification OTP code below:
                            </p>
                            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                                <span style="font-size: 32px; font-weight: 700; color: #4f46e5; letter-spacing: 5px;">${otp}</span>
                            </div>
                            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
                                This OTP code is valid for 10 minutes. If you did not request this, please secure your login immediately.
                            </p>
                        </div>
                    </div>
                `,
      });
    } catch (e) {
      console.error("PIN Reset Mail Error:", e);
      return res
        .status(500)
        .json({ message: "Failed to send verification OTP email." });
    }

    res.json({ message: "Verification OTP code sent to your email." });
  } catch (err) {
    console.error("Forgot PIN Pass Verification Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// C. FORGOT PIN - VERIFY OTP & RESET PIN
router.post("/forgot-pin/reset", protect, async (req, res) => {
  try {
    const { otp, newPin } = req.body;
    if (!otp || !newPin) {
      return res
        .status(400)
        .json({ message: "OTP code and new PIN are required." });
    }

    if (!/^\d{6}$/.test(newPin)) {
      return res
        .status(400)
        .json({ message: "New PIN must be exactly 6 numeric digits." });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }

    // Validate OTP
    if (
      wallet.pinResetOtp !== otp ||
      !wallet.pinResetOtpExpiry ||
      wallet.pinResetOtpExpiry < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP code." });
    }

    // Check karein ke naya PIN kahin purane PIN ke barabar toh nahi
    if (wallet.transactionPin) {
      const isSamePin = await bcrypt.compare(newPin, wallet.transactionPin);
      if (isSamePin) {
        return res
          .status(400)
          .json({ message: "New PIN cannot be the same as your old PIN." });
      }
    }

    // Hash new PIN using bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(newPin, salt);

    // Update Wallet credentials
    wallet.transactionPin = hashedPin;
    wallet.isPinSet = true;
    wallet.failedPinAttempts = 0; // Reset attempts to 0
    wallet.mustResetPin = false; // Force flag ko wapsi false kar dein!
    wallet.pinResetOtp = null; // Clear OTP fields
    wallet.pinResetOtpExpiry = null;
    wallet.status = "ACTIVE"; // Unfreeze wallet if it was frozen

    await wallet.save();

    // Send confirmation email
    try {
      sendPinChangedEmail(
        req.user.email,
        `${req.user.firstName} ${req.user.lastName}`,
      );
    } catch (emailErr) {
      console.error("Failed to send PIN change confirmation email:", emailErr);
    }

    res.json({
      message:
        "Transaction PIN reset successfully. Your wallet has been unfrozen.",
    });
  } catch (err) {
    console.error("Reset PIN Error:", err);
    res.status(500).json({ message: err.message });
  }
});
export default router;

