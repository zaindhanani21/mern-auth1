import { sendTransferEmail, sendAddMoneyEmail } from "./mailHelper.js";
import express from "express";
import User from "./models/User.js";
import Transaction from "./models/Transaction.js";
import ExternalBank from "./models/ExternalBank.js";
import mongoose from "mongoose";

const router = express.Router();

// --- ROUTE: SEND MONEY ---
router.post("/send-money", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { senderId, recipientMobile, amount } = req.body;

    // 1. Validation
    if (!senderId || !recipientMobile || !amount) {
      await session.abortTransaction();
      session.endSession(); // Ensure session ends on early return
      return res
        .status(400)
        .json({ message: "Missing required transaction details." });
    }

    // 2. Find Sender
    const sender = await User.findById(senderId).session(session);
    if (!sender) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Sender account not found." });
    }

    // ❄️ Security Check: Frozen
    if (sender.isFrozen) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ message: "Your account is frozen. Please unfreeze." });
    }

    // 💰 Balance Check & Failure Notification
    if (sender.balance < amount) {
      // 🟢 Failure email can still be awaited because the transaction stops anyway
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

    // 3. Find Recipient
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

    // 4. Update Balances
    sender.balance -= Number(amount);
    recipient.balance += Number(amount);

    await sender.save({ session });
    await recipient.save({ session });

    // 5. Create Transaction
    const newTransaction = new Transaction({
      sender: sender._id,
      recipient: recipient._id,
      amount: Number(amount),
      description: `Sent to ${recipientMobile}`,
    });
    await newTransaction.save({ session });

    // 🟢 COMMIT FIRST: Save data to the database before doing anything else
    await session.commitTransaction();
    session.endSession();

    // 📧 2-Way Success Notifications (BACKGROUND TASKS)
    // 🟢 REMOVED 'await': These now run in the background without blocking the response
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

    // 🟢 INSTANT RESPONSE: The user sees "Success" immediately
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

// --- ROUTE: ADD MONEY (Logic Update: Database Match vs. Time Match) ---
router.post("/add-money", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, cardNumber, expiryDate, cvc, amount } = req.body;
    const depositAmount = Number(amount);

    // 1. User Look-up
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found." });
    }

    // 🟢 STEP 1: Find the account by Card Number only
    const bankAccount = await ExternalBank.findOne({ 
      cardNumber: cardNumber.trim() 
    }).session(session);

    // 🟢 STEP 2: Validate if provided CVC and Expiry MATCH the database
    // If they don't match, we treat it as "Account not found" or "Invalid details"
    if (!bankAccount || bankAccount.cvc !== cvc.trim() || bankAccount.expiryDate !== expiryDate.trim()) {
      await session.abortTransaction();
      session.endSession();
      // Logic: If the details don't match the database record, stop here.
      return res.status(404).json({ message: "Bank account not found or invalid details." });
    }

    // 🟢 STEP 3: Now check Expiry against CURRENT TIME (Jan 2026)
    // We only reach this if the expiryDate matched the database record
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

    // ❌ 4. Bank Balance Check
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

    // 5. Update Accounts and Commit
    bankAccount.bankBalance -= depositAmount;
    user.balance = (user.balance || 0) + depositAmount;
    await bankAccount.save({ session });
    await user.save({ session });

    const newTransaction = new Transaction({
      sender: null,
      recipient: user._id,
      amount: depositAmount,
      description: `${bankAccount.bankName} | ****${cardNumber.slice(-4)}`,
    });
    await newTransaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Background Success Email
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
// --- HELPER ROUTES ---
router.get("/balance/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId).select("balance");
  res.status(200).json({ balance: user.balance });
});

router.get("/history/:userId", async (req, res) => {
  const history = await Transaction.find({
    $or: [{ sender: req.params.userId }, { recipient: req.params.userId }],
  })
    .populate("sender", "firstName mobileNumber")
    .populate("recipient", "firstName mobileNumber")
    .sort({ createdAt: -1 });
  res.status(200).json(history);
});

export default router;
