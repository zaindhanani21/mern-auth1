import { sendTransferEmail, sendAddMoneyEmail } from "./mailHelper.js";
import express from "express";
import User from "./models/User.js";
import Transaction from "./models/Transaction.js";
import ExternalBank from "./models/ExternalBank.js";
import Wallet from "./models/Wallet.js"; 
import mongoose from "mongoose";

const router = express.Router();

// --- ROUTE 1: SEND MONEY (Wallet-to-Wallet transfer) ---
router.post("/send-money", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { senderId, recipientMobile, amount } = req.body;

    // 1. Validation check
    if (!senderId || !recipientMobile || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Missing required transaction details." });
    }

    // 2. Find Sender profile details
    const sender = await User.findById(senderId).session(session);
    if (!sender) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Sender account not found." });
    }

    // ❄️ Security Check: Frozen Account validation
    if (sender.isFrozen) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ message: "Your account is frozen. Please unfreeze." });
    }

    // 💰 Balance Check & Decline Notification Email
    if (sender.balance < amount) {
      try {
        await sendTransferEmail(
          sender.email,
          "Waxella: Transfer Failed (Insufficient Balance)",
          {
            amount: amount,
            senderName: "Transaction Declined",
            senderMobile: "Low Balance Alert",
            txId: "N/A",
            newBalance: sender.balance,
          },
        );
      } catch (mailErr) {
        console.error("❌ Mailer Error:", mailErr.message);
      }
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Insufficient balance." });
    }

    // 3. Find Recipient profile details
    const recipient = await User.findOne({
      mobileNumber: recipientMobile,
    }).session(session);
    if (!recipient) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Recipient mobile number not registered." });
    }

    if (sender.mobileNumber === recipientMobile) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "You cannot send money to yourself." });
    }

    // 🟢 Fetch Wallets mapping for transaction history
    const senderWallet = await Wallet.findOne({ userId: sender._id }).session(session);
    const recipientWallet = await Wallet.findOne({ userId: recipient._id }).session(session);
    if (!senderWallet || !recipientWallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Wallet records not found." });
    }

    // 4. Update Balances
    sender.balance -= Number(amount);
    recipient.balance += Number(amount);

    await sender.save({ session });
    await recipient.save({ session });

    // 5. Create Immutable Transaction Record
    const newTransaction = new Transaction({
      senderWallet: senderWallet._id,
      receiverWallet: recipientWallet._id,
      amount: Number(amount),
      type: "SEND",
      description: `Sent to ${recipientMobile}`,
      status: "COMPLETED"
    });
    await newTransaction.save({ session });

    // 🟢 Commit Database Session
    await session.commitTransaction();
    session.endSession();

    // 📧 Background Success emails
    sendTransferEmail(recipient.email, "Waxella: Payment Received!", {
      amount: amount,
      senderName: `${sender.firstName} ${sender.lastName || ""}`,
      senderMobile: sender.mobileNumber,
      txId: newTransaction._id,
      newBalance: recipient.balance,
    }).catch((e) =>
      console.error("Background Mailer Error (Recipient):", e.message),
    );

    sendTransferEmail(sender.email, "Waxella: Money Sent Successfully!", {
      amount: amount,
      senderName: `${recipient.firstName} ${recipient.lastName || ""}`,
      senderMobile: recipient.mobileNumber,
      txId: newTransaction._id,
      newBalance: sender.balance,
    }).catch((e) =>
      console.error("Background Mailer Error (Sender):", e.message),
    );

    return res.status(200).json({
      message: "Transfer Successful!",
      newBalance: sender.balance,
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("❌ CRITICAL ERROR:", err);
    res.status(500).json({ message: "Transaction failed." });
  }
});

// --- ROUTE 2: ADD MONEY (Deposit funds from bank card) ---
router.post("/add-money", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, cardNumber, expiryDate, cvc, amount } = req.body;
    const depositAmount = Number(amount);

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found." });
    }

    const bankAccount = await ExternalBank.findOne({ 
      cardNumber: cardNumber.trim() 
    }).session(session);

    if (!bankAccount || bankAccount.cvc !== cvc.trim() || bankAccount.expiryDate !== expiryDate.trim()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Bank account not found or invalid details." });
    }

    const [expMonth, expYear] = expiryDate.split("/").map(Number);
    const today = new Date();
    const currentYear = today.getFullYear() % 100;
    const currentMonth = today.getMonth() + 1;

    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
      try {
        await sendTransferEmail(user.email, "Waxella: Deposit Failed (Expired Card)", {
            amount: depositAmount,
            senderName: "Transaction Declined",
            senderMobile: "Card Expired",
            txId: "N/A",
            newBalance: user.balance,
        });
      } catch (e) { console.error(e); }
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "This card has expired." });
    }

    if (bankAccount.bankBalance < depositAmount) {
      try {
        await sendAddMoneyEmail(user.email, "Waxella: Deposit Failed (Insufficient Bank Funds)", {
            amount: depositAmount,
            senderName: bankAccount.bankName,
            cardNumber: `Declined: Card ending in ${cardNumber.slice(-4)}`,
            txId: "N/A",
            newBalance: user.balance,
        });
      } catch (e) { console.error("Mailer Error:", e.message); }
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Insufficient bank balance." });
    }

    // 🟢 Fetch user's receiving wallet
    const userWallet = await Wallet.findOne({ userId: user._id }).session(session);
    if (!userWallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User wallet record not found." });
    }

    bankAccount.bankBalance -= depositAmount;
    user.balance = (user.balance || 0) + depositAmount;
    await bankAccount.save({ session });
    await user.save({ session });

    // 🟢 Save Secure Transaction
    const newTransaction = new Transaction({
      senderWallet: null,
      receiverWallet: userWallet._id,
      amount: depositAmount,
      type: "ADD_MONEY",
      description: `${bankAccount.bankName} | ****${cardNumber.slice(-4)}`,
      status: "COMPLETED"
    });
    await newTransaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    sendAddMoneyEmail(user.email, "Waxella: Funds Added Successfully!", {
      amount: depositAmount,
      senderName: bankAccount.bankName,
      cardNumber: `Card ending in ${cardNumber.slice(-4)}`,
      txId: newTransaction._id,
      newBalance: user.balance,
    }).catch((e) => console.error("Background Mailer Error:", e.message));

    return res.status(200).json({ message: "Funds added!", newBalance: user.balance });

  } catch (err) {
    if (session.inTransaction()) { await session.abortTransaction(); }
    session.endSession();
    res.status(500).json({ message: "Internal Error" });
  }
});

// --- ROUTE 3: BALANCE CHECK (Helper endpoint) ---
router.get("/balance/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId).select("balance");
  res.status(200).json({ balance: user.balance });
});

// --- ROUTE 4: TRANSACTION HISTORY (Helper endpoint) ---
router.get("/history/:userId", async (req, res) => {
  try {
    const userWallet = await Wallet.findOne({ userId: req.params.userId });
    if (!userWallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }

    // Find all transactions referencing this wallet as sender or receiver
    const history = await Transaction.find({
      $or: [{ senderWallet: userWallet._id }, { receiverWallet: userWallet._id }],
    })
      .populate({
        path: 'senderWallet',
        populate: { path: 'userId', select: 'firstName mobileNumber' }
      })
      .populate({
        path: 'receiverWallet',
        populate: { path: 'userId', select: 'firstName mobileNumber' }
      })
      .sort({ createdAt: -1 });

    // Format output mapping to match legacy frontend keys (sender & recipient User details)
    const formattedHistory = history.map(tx => {
      return {
        _id: tx._id,
        amount: tx.amount,
        type: tx.type,
        description: tx.description,
        status: tx.status,
        createdAt: tx.createdAt,
        sender: tx.senderWallet ? tx.senderWallet.userId : null,
        recipient: tx.receiverWallet ? tx.receiverWallet.userId : null
      };
    });

    res.status(200).json(formattedHistory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;