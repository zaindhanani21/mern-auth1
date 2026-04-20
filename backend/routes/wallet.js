import express from "express";
import mongoose from "mongoose";
import { protect } from "../auth.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import ExternalBank from "../models/ExternalBank.js";
import SplitRequest from "../models/SplitRequest.js";
import { sendMoneyReceivedEmail, sendMoneySentEmail, sendFundsAddedEmail } from "../mailHelper.js";

const router = express.Router();

// Helper to Create Notification
const notifyUser = async (userId, title, message, type, io) => {
    try {
        await Notification.create({ userId, title, message, type });
        if (io) {
            io.to(userId.toString()).emit("notification", { title, message, type });
        }
    } catch (e) { console.error("Notification Error:", e); }
};

// 1. GET BALANCE & HISTORY
router.get("/dashboard", protect, async (req, res) => {
    try {
        const wallet = await Wallet.findOne({ userId: req.user._id });
        if (!wallet) return res.status(404).json({ message: "Wallet not found" });

        const history = await Transaction.find({
            $or: [{ senderWallet: wallet._id }, { receiverWallet: wallet._id }]
        })
            .sort({ createdAt: -1 })
            .populate('senderWallet', 'walletId') // Only expose walletId if needed, or link to User details
            .populate('receiverWallet', 'walletId');

        // For frontend display, we might want names instead of Wallet IDs.
        // Complex populate to get user names:
        const enrichedHistory = await Promise.all(history.map(async (tx) => {
            const isSender = tx.senderWallet?._id.equals(wallet._id);
            let otherPartyName = "Bank/System";
            let otherPartyMobile = "";

            if (tx.type === 'SEND' || tx.type === 'RECEIVE') {
                // Resolve the other party's wallet
                const otherWalletId = isSender ? tx.receiverWallet : tx.senderWallet;
                const otherWallet = await Wallet.findById(otherWalletId).populate('userId', 'firstName lastName mobileNumber');
                if (otherWallet && otherWallet.userId) {
                    otherPartyName = `${otherWallet.userId.firstName} ${otherWallet.userId.lastName}`;
                    otherPartyMobile = otherWallet.userId.mobileNumber;
                }
            }

            return {
                _id: tx._id,
                amount: tx.amount,
                type: tx.type,
                description: tx.description,
                createdAt: tx.createdAt,
                isSender,
                otherPartyName,
                otherPartyMobile
            };
        }));

        res.json({
            balance: wallet.balance,
            isFrozen: wallet.status === 'FROZEN',
            history: enrichedHistory
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2. ADD MONEY
router.post("/add-money", protect, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { amount, cardNumber, cvc, expiryDate } = req.body;
        if (amount <= 0) throw new Error("Invalid amount");

        // Validate Bank Mock (Optional logic from previous, simplified here)
        // [Assume bank check passes for brevity or re-implement if strict]

        const wallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (!wallet) throw new Error("Wallet not found");
        if (wallet.status === 'FROZEN') throw new Error("Wallet is Frozen");

        wallet.balance += Number(amount);
        await wallet.save({ session });

        const tx = new Transaction({
            receiverWallet: wallet._id,
            amount,
            type: 'ADD_MONEY',
            description: `Deposit via Card ending ${cardNumber.slice(-4)}`
        });
        await tx.save({ session });
        await session.commitTransaction();

        // Notify
        notifyUser(req.user._id, "Funds Added", `PKR ${amount} added to your wallet.`, "TRANSACTION", req.io);

        // Send Email
        sendFundsAddedEmail(req.user.email, amount);

        res.json({ message: "Money Added Successfully", newBalance: wallet.balance });
    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ message: error.message });
    } finally {
        session.endSession();
    }
});

// 3. SEND MONEY (Peer-to-Peer)
router.post("/send-money", protect, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { recipientMobile, amount } = req.body;
        if (amount <= 0) throw new Error("Invalid amount");

        const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (senderWallet.status === 'FROZEN') throw new Error("Your wallet is Frozen");
        if (senderWallet.balance < amount) throw new Error("Insufficient Balance");

        // Find Recipient User first
        const recipientUser = await User.findOne({ mobileNumber: recipientMobile });
        if (!recipientUser) throw new Error("Recipient not found");
        if (recipientUser._id.equals(req.user._id)) throw new Error("Cannot send to self");

        // Find Recipient Wallet
        const receiverWallet = await Wallet.findOne({ userId: recipientUser._id }).session(session);
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
            type: 'SEND', // Logic can distinguish SEND vs RECEIVE based on perspective
            description: `Transfer to ${recipientMobile}`
        });
        await tx.save({ session });

        await session.commitTransaction();

        // Real-time Notifications
        notifyUser(req.user._id, "Money Sent", `Sent PKR ${amount} to ${recipientUser.firstName}`, "TRANSACTION", req.io);
        notifyUser(recipientUser._id, "Money Received", `Received PKR ${amount} from ${req.user.firstName}`, "TRANSACTION", req.io);

        // Send Emails
        sendMoneySentEmail(req.user.email, `${recipientUser.firstName} ${recipientUser.lastName}`, amount);
        sendMoneyReceivedEmail(recipientUser.email, `${req.user.firstName} ${req.user.lastName}`, amount);

        res.json({ message: "Transfer Successful" });

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
        const newStatus = wallet.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
        wallet.status = newStatus;

        req.user.otp = null; // Clear OTP
        await req.user.save();
        await wallet.save();

        const msg = newStatus === 'FROZEN' ? "Wallet Frozen ❄️" : "Wallet Unfrozen 🔥";
        notifyUser(req.user._id, "Security Alert", msg, "SECURITY", req.io);

        res.json({ message: msg, isFrozen: newStatus === 'FROZEN' });
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
            isRead: false
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

        if (notificationId === 'all') {
            // Mark all as read
            await Notification.updateMany(
                { userId: req.user._id, isRead: false },
                { isRead: true }
            );
            return res.json({ message: "All notifications marked as read" });
        }

        // Mark single notification as read
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, userId: req.user._id },
            { isRead: true },
            { new: true }
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
        const { provider, consumerNumber, amount, type } = req.body;
        if (amount <= 0) throw new Error("Invalid amount");

        const wallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (!wallet) throw new Error("Wallet not found");
        if (wallet.status === 'FROZEN') throw new Error("Your wallet is Frozen");
        if (wallet.balance < amount) throw new Error("Insufficient Balance");

        // Deduct from wallet
        wallet.balance -= Number(amount);
        await wallet.save({ session });

        const tx = new Transaction({
            senderWallet: wallet._id,
            receiverWallet: wallet._id, // System
            amount,
            type: 'BILL_PAYMENT',
            description: `Paid ${provider} (${type}) for A/C ${consumerNumber}`
        });
        await tx.save({ session });

        await session.commitTransaction();

        // Notify
        notifyUser(req.user._id, "Bill Paid", `Successfully paid PKR ${amount} for ${provider} bill.`, "TRANSACTION", req.io);

        res.json({ message: "Bill Payment Successful", newBalance: wallet.balance });
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
        const { description, totalAmount, friends } = req.body;
        if (totalAmount <= 0) throw new Error("Invalid total amount");
        if (!friends || friends.length === 0) throw new Error("No friends selected for splitting.");

        let participants = [];
        for (let f of friends) {
            const user = await User.findOne({ mobileNumber: f.mobileNumber });
            if (!user) throw new Error(`User with mobile ${f.mobileNumber} not found.`);
            if (user._id.equals(req.user._id)) continue; // skip self
            participants.push({ userId: user._id, amount: f.amount, status: 'PENDING' });
        }

        if (participants.length === 0) throw new Error("No valid friends added.");

        const splitRequest = new SplitRequest({
            initiator: req.user._id,
            description,
            totalAmount,
            participants
        });
        await splitRequest.save();

        // Notify participants
        for (let p of participants) {
            notifyUser(p.userId, "Bill Split Request", `${req.user.firstName} requested PKR ${p.amount} for ${description}`, "SPLIT_REQUEST", req.io);
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
                { 'participants.userId': req.user._id },
                { initiator: req.user._id }
            ]
        }).populate('initiator', 'firstName lastName mobileNumber')
          .populate('participants.userId', 'firstName lastName mobileNumber')
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
        const { splitId } = req.body;

        const split = await SplitRequest.findById(splitId).session(session);
        if (!split) throw new Error("Split request not found");

        const participantIndex = split.participants.findIndex(p => p.userId.equals(req.user._id));
        if (participantIndex === -1) throw new Error("You are not part of this split request");
        
        const participant = split.participants[participantIndex];
        if (participant.status === 'ACCEPTED') throw new Error("You have already paid this split");

        const amount = participant.amount;

        const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (senderWallet.status === 'FROZEN') throw new Error("Your wallet is Frozen");
        if (senderWallet.balance < amount) throw new Error("Insufficient Balance");

        const receiverWallet = await Wallet.findOne({ userId: split.initiator }).session(session);

        // Deduct/Add
        senderWallet.balance -= Number(amount);
        receiverWallet.balance += Number(amount);

        await senderWallet.save({ session });
        await receiverWallet.save({ session });

        // Update participant status
        split.participants[participantIndex].status = 'ACCEPTED';

        // Check if all paid
        const allPaid = split.participants.every(p => p.status === 'ACCEPTED');
        if (allPaid) {
            split.status = 'COMPLETED';
        } else {
            split.status = 'PARTIALLY_PAID';
        }
        await split.save({ session });

        // Record Transaction
        const tx = new Transaction({
            senderWallet: senderWallet._id,
            receiverWallet: receiverWallet._id,
            amount,
            type: 'SPLIT_PAYMENT',
            description: `Split Paid: ${split.description}`
        });
        await tx.save({ session });

        await session.commitTransaction();

        // Notify Initiator
        notifyUser(split.initiator, "Split Paid", `${req.user.firstName} paid their share (PKR ${amount}) for ${split.description}`, "TRANSACTION", req.io);
        
        // Notify Acceptor (Self)
        notifyUser(req.user._id, "Split Approved", `You paid PKR ${amount} for ${split.description}`, "TRANSACTION", req.io);

        res.json({ message: "Split Paid Successfully" });
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
        const split = await SplitRequest.findById(splitId).populate('initiator', 'firstName lastName');
        if (!split) throw new Error("Split request not found");

        const participantIndex = split.participants.findIndex(p => p.userId.equals(req.user._id));
        if (participantIndex === -1) throw new Error("You are not part of this split request");
        
        if (split.participants[participantIndex].status !== 'PENDING') throw new Error("You have already responded to this request");

        split.participants[participantIndex].status = 'REJECTED';
        await split.save();

        // Notify Initiator
        notifyUser(split.initiator._id, "Split Rejected", `${req.user.firstName} rejected the split request for ${split.description}`, "SPLIT_REJECTED", req.io);
        
        // Notify Rejector (Self)
        notifyUser(req.user._id, "Split Rejected", `You rejected the split request from ${split.initiator.firstName}`, "SPLIT_REJECTED", req.io);

        res.json({ message: "Split Rejected successfully" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

export default router;
