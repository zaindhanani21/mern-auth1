import express from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import { protect } from "../auth.js";
import Wallet from "../models/Wallet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Notification from "../models/Notification.js";
import ExternalBank from "../models/ExternalBank.js";
import SplitRequest from "../models/SplitRequest.js";
import { sendMoneyReceivedEmail, sendMoneySentEmail, sendFundsAddedEmail, sendSecurityAlertEmail, sendSecurityOtpEmail } from "../mailHelper.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});
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

// 🟢 Helper to check Velocity Limit and Freeze Wallet if violated
const checkVelocityLimit = async (userId, userEmail, wallet, io) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    // Check all outgoing/funding transactions of this user in the last 2 minutes
    const recentTxCount = await Transaction.countDocuments({
        $or: [
            { senderWallet: wallet._id },
            { receiverWallet: wallet._id, type: 'ADD_MONEY' }
        ],
        createdAt: { $gte: twoMinutesAgo },
        status: 'COMPLETED'
    });

        if (recentTxCount >= 3) {
        // Freeze Wallet permanently (bypass session/rollback to persist lock)
        await Wallet.updateOne({ _id: wallet._id }, { status: 'FROZEN' });
        
        // In-memory status update for current request
        wallet.status = 'FROZEN';

        // Create Security Notification
        await Notification.create({
            userId,
            title: "🚨 Wallet Locked",
            message: "Multiple transactions detected in a short time. Wallet locked for safety.",
            type: "SECURITY"
        });

        if (io) {
            io.to(userId.toString()).emit("notification", {
                title: "🚨 Wallet Locked",
                message: "Multiple transactions detected. Wallet locked for safety.",
                type: "SECURITY"
            });
        }

        // Send Email Alert
        await sendSecurityAlertEmail(
            userEmail,
            "Too many transactions (Velocity Limit Exceeded: 3 or more transactions in 2 minutes)"
        );

        

        throw new Error("Suspicious activity: Velocity limit exceeded. Your wallet has been frozen.");
    }
};

// 🟢 Helper to verify OTP for Large Transactions (Returns true if success, false if blocked/needs OTP)
const verifyLargeTransactionOtp = async (req, res, amount, otp, actionName) => {
    if (Number(amount) >= 10000) {
        if (!otp) {
            // Generate OTP
            const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
            req.user.otp = generatedOtp;
            req.user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 mins
            req.user.otpAttempts = 0; // Reset attempts
            await req.user.save();

            // Send OTP Email
            await sendSecurityOtpEmail(req.user.email, Number(amount), generatedOtp);

            // Create security notification
            await Notification.create({
                userId: req.user._id,
                title: "🔒 OTP Verification Required",
                message: `A large transaction (${actionName}) of PKR ${amount} requires verification.`,
                type: "SECURITY"
            });

            res.json({ requiresOtp: true, message: "Large transaction requires verification OTP." });
            return false; // Stop API execution
        } else {
            // Verify OTP
            if (req.user.otp !== otp || req.user.otpExpires < Date.now()) {
                req.user.otpAttempts = (req.user.otpAttempts || 0) + 1;

                if (req.user.otpAttempts >= 3) {
                    // Freeze Wallet permanently (bypass session to persist lock on abort)
                    await Wallet.updateOne({ userId: req.user._id }, { status: 'FROZEN' });

                    req.user.otp = null;
                    req.user.otpExpires = null;
                    req.user.otpAttempts = 0;
                    await req.user.save();

                    // Send Alert Email
                    await sendSecurityAlertEmail(req.user.email, `Too many failed OTP attempts during ${actionName} verification.`);

                    res.status(400).json({ message: "Too many failed OTP attempts. Your wallet has been frozen." });
                    return false; // Stop API execution
                }

                await req.user.save();
                res.status(400).json({ message: `Invalid OTP. Attempts remaining: ${3 - req.user.otpAttempts}` });
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
            isFrozen: wallet.status === 'FROZEN'
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

        // 🟢 Deep Population: Is se batch query ke zarye instantly data load hota hai
        const history = await Transaction.find({
            $or: [{ senderWallet: wallet._id }, { receiverWallet: wallet._id }]
        })
            .sort({ createdAt: -1 })
            .populate({
                path: 'senderWallet',
                select: 'walletId userId',
                populate: { path: 'userId', select: 'firstName lastName mobileNumber' }
            })
            .populate({
                path: 'receiverWallet',
                select: 'walletId userId',
                populate: { path: 'userId', select: 'firstName lastName mobileNumber' }
            });

        // 🟢 In-Memory Loop: CPU memory mein microsecond mein response ready karta hai
        const enrichedHistory = history.map((tx) => {
            const isSender = tx.senderWallet?._id.equals(wallet._id);
            let otherPartyName = "Bank/System";
            let otherPartyMobile = "";

            if (tx.type === 'SEND' || tx.type === 'RECEIVE') {
                const otherWallet = isSender ? tx.receiverWallet : tx.senderWallet;
                if (otherWallet && otherWallet.userId) {
                    otherPartyName = `${otherWallet.userId.firstName} ${otherWallet.userId.lastName}`;
                    otherPartyMobile = otherWallet.userId.mobileNumber;
                }
            } else if (tx.type === 'EXTERNAL_TRANSFER') {
                otherPartyName = tx.description;
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
        });

        res.json({
            history: enrichedHistory
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 2. ADD MONEY (Stripe Integration)
router.post("/add-money", protect, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { amount, paymentMethodId } = req.body;

        // --- STEP 1: Validate the request ---
        if (!amount || amount <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Please enter a valid amount." });
        }
        if (!paymentMethodId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Card details are missing. Please try again." });
        }

             // Check velocity limit before charging the card
     const checkWallet = await Wallet.findOne({ userId: req.user._id });
     if (!checkWallet) throw new Error("Wallet not found");
     if (checkWallet.status === 'FROZEN') throw new Error("Wallet is Frozen");
     await checkVelocityLimit(req.user._id, req.user.email, checkWallet, req.io);

        // --- STEP 2: Confirm the payment with Stripe ---
        // Stripe charges in smallest currency unit (cents/paisa), so multiply by 100
        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // e.g. PKR 1000 → 100000 paisa
                currency: "pkr",
                payment_method: paymentMethodId,
                confirm: true,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: "never"
                }
            });
        } catch (stripeError) {
            await session.abortTransaction();
            session.endSession();

            // Handle specific Stripe error codes clearly
            const code = stripeError.code;
            if (code === "card_declined") {
                const declineCode = stripeError.decline_code;
                if (declineCode === "insufficient_funds") {
                    return res.status(400).json({ message: "Transaction failed: Insufficient funds in your bank account." });
                }
                return res.status(400).json({ message: "Your card was declined. Please check your card details." });
            }
            if (code === "incorrect_number" || code === "invalid_number") {
                return res.status(400).json({ message: "Invalid card details. Please check your card number." });
            }
            if (code === "incorrect_cvc" || code === "invalid_cvc") {
                return res.status(400).json({ message: "Invalid card details. Please check your CVC." });
            }
            if (code === "expired_card") {
                return res.status(400).json({ message: "Your card has expired. Please use a different card." });
            }

            // Generic Stripe error fallback
            return res.status(400).json({ message: stripeError.message || "Payment failed. Please try again." });
        }

        // --- STEP 4: Payment confirmed — update wallet in MongoDB ---
        const wallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (!wallet) throw new Error("Wallet not found");
        if (wallet.status === 'FROZEN') throw new Error("Wallet is Frozen");

        wallet.balance += Number(amount);
        await wallet.save({ session });

        // --- STEP 5: Log the transaction in the database ---
        const tx = new Transaction({
            receiverWallet: wallet._id,
            amount,
            type: 'ADD_MONEY',
            description: `Deposit via Stripe (Payment ID: ${paymentIntent.id.slice(-8)})`
        });
        await tx.save({ session });

        // All good — commit everything to the database
        await session.commitTransaction();

        // --- STEP 6: Send real-time Socket.io notification ---
        notifyUser(
            req.user._id,
            "Funds Added ✅",
            `PKR ${amount} has been added to your Waxella wallet successfully!`,
            "TRANSACTION",
            req.io
        );

        // --- STEP 7: Send confirmation email ---
        sendFundsAddedEmail(req.user.email, amount);

        res.json({ message: "Money Added Successfully", newBalance: wallet.balance });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: error.message || "Something went wrong. Please try again." });
    } finally {
        session.endSession();
    }
});

// 3. SEND MONEY (Peer-to-Peer)
router.post("/send-money", protect, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { recipientMobile, amount, otp } = req.body;
        if (amount <= 0) throw new Error("Invalid amount");

        const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (senderWallet.status === 'FROZEN') throw new Error("Your wallet is Frozen");
        if (senderWallet.balance < amount) throw new Error("Insufficient Balance");

        // Check velocity limit before sending money
        await checkVelocityLimit(req.user._id, req.user.email, senderWallet, req.io);

        // Verify Large Transaction OTP
        const isVerified = await verifyLargeTransactionOtp(req, res, amount, otp, "Transfer");
        if (!isVerified) {
            await session.abortTransaction();
            session.endSession();
            return;
        }


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

        if (notificationId === 'social') {
            // Mark all social comments & reactions notifications as read
            await Notification.updateMany(
                { 
                    userId: req.user._id, 
                    isRead: false,
                    type: { $in: ['SOCIAL_COMMENT', 'SOCIAL_REACT'] }
                },
                { isRead: true }
            );
            return res.json({ message: "Social notifications marked as read" });
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
             // Check velocity limit before paying the bill
     await checkVelocityLimit(req.user._id, req.user.email, wallet, req.io);

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
                // 🔒 Check if user is currently blocked
        if (req.user.splitBlockUntil && req.user.splitBlockUntil > Date.now()) {
            const remainingMs = req.user.splitBlockUntil - Date.now();
            const hours = Math.floor(remainingMs / (1000 * 60 * 60));
            const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeMessage = "";
            if (hours > 0) {
                timeMessage = `${hours} ${hours === 1 ? 'hour' : 'hours'} and ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
            } else {
                timeMessage = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
            }
            
            throw new Error(`Request timeout. Please try again after ${timeMessage}.`);
        }

        // 🔒 Spam Control: Count requests in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentRequestCount = await SplitRequest.countDocuments({
            initiator: req.user._id,
            createdAt: { $gte: fiveMinutesAgo }
        });

        if (recentRequestCount >= 3) {
            // Block user for 2 hours
            req.user.splitBlockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
            await req.user.save();

            throw new Error("Request timeout. Split request limit exceeded, blocked for 2 hours.");
        }
        const { description, totalAmount, friends } = req.body;
        if (totalAmount <= 0) throw new Error("Invalid total amount");
        if (!friends || friends.length === 0) throw new Error("No friends selected for splitting.");

        let participants = [];
        let totalParticipantsAmount = 0; // 🛡️ Sum track karne ke liye
        for (let f of friends) {
            const user = await User.findOne({ mobileNumber: f.mobileNumber });
            if (!user) throw new Error(`User with mobile ${f.mobileNumber} not found.`);
            if (user._id.equals(req.user._id)) continue; // skip self
            
            // 🛡️ Check: Kisi bhi participant ki amount 0 ya negative nahi honi chahiye
            if (!f.amount || Number(f.amount) <= 0) {
                throw new Error(`Amount for ${user.firstName} must be greater than 0.`);
            }
            
            totalParticipantsAmount += Number(f.amount);
            participants.push({ userId: user._id, amount: f.amount, status: 'PENDING' });
        }

        // 🛡️ Check: Sab participants ka sum total bill amount se zyada na ho
        if (totalParticipantsAmount > totalAmount) {
            throw new Error(`The total split amount for participants (PKR ${totalParticipantsAmount}) cannot exceed the total bill amount (PKR ${totalAmount}).`);
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
        const { splitId, otp } = req.body;

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

        // Check velocity limit before accepting/paying split
        await checkVelocityLimit(req.user._id, req.user.email, senderWallet, req.io);

        // Verify Large Transaction OTP
        const isVerified = await verifyLargeTransactionOtp(req, res, amount, otp, "Split Bill Payment");
        if (!isVerified) {
            await session.abortTransaction();
            session.endSession();
            return;
        }

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
                // Notify Initiator
        notifyUser(split.initiator, "Split Paid", `${req.user.firstName} paid their share (PKR ${amount}) for ${split.description}`, "TRANSACTION", req.io);
        
        // Notify Acceptor (Self)
        notifyUser(req.user._id, "Split Approved", `You paid PKR ${amount} for ${split.description}`, "TRANSACTION", req.io);

        // 🔄 Real-time sync for other participants
        for (const p of split.participants) {
            if (!p.userId.equals(req.user._id)) {
                notifyUser(
                    p.userId,
                    "Split Updated",
                    `${req.user.firstName} paid their share for ${split.description}`,
                    "SPLIT_REQUEST",
                    req.io
                );
            }
        }

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

        // 🔄 Real-time sync for other participants
        for (const p of split.participants) {
            if (!p.userId.equals(req.user._id)) {
                notifyUser(
                    p.userId,
                    "Split Updated",
                    `${req.user.firstName} rejected the split request for ${split.description}`,
                    "SPLIT_REQUEST",
                    req.io
                );
            }
        }

        res.json({ message: "Split Rejected successfully" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});
// 12. SEND EXTERNAL BANK MONEY (Stripe Bank Token API)
router.post("/send-external-money", protect, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { bankName, accountNumber, amount, otp } = req.body;

        // Validation
        if (!accountNumber || accountNumber.trim().length < 6) {
            throw new Error("Please enter a valid Bank Account Number (minimum 6 digits)");
        }
        if (!amount || Number(amount) <= 0) {
            throw new Error("Please enter a valid transfer amount");
        }
        if (!bankName) {
            throw new Error("Please select a bank");
        }

        // Check Wallexa Wallet Balance
        const senderWallet = await Wallet.findOne({ userId: req.user._id }).session(session);
        if (!senderWallet) throw new Error("Wallet not found");
        if (senderWallet.status === 'FROZEN') throw new Error("Your wallet is Frozen. Please unfreeze first.");
        if (senderWallet.balance < Number(amount)) throw new Error("Insufficient Wallet Balance");

        // Check velocity limit before sending bank transfer
        await checkVelocityLimit(req.user._id, req.user.email, senderWallet, req.io);

        // Verify Large Transaction OTP
        const isVerified = await verifyLargeTransactionOtp(req, res, amount, otp, "Bank Transfer");
        if (!isVerified) {
            await session.abortTransaction();
            session.endSession();
            return;
        }

        // Real-time Stripe Bank Token API Call
        let token;
        try {
            token = await stripe.tokens.create({
                bank_account: {
                    country: 'US',
                    currency: 'usd',
                    account_holder_name: `${req.user.firstName} ${req.user.lastName}`,
                    account_holder_type: 'individual',
                    routing_number: '110000000',
                    account_number: accountNumber.trim(),
                },
            });
        } catch (stripeError) {
            throw new Error(`Bank Transfer Declined: ${stripeError.message}`);
        }

        // Deduct from Wallexa Wallet
        senderWallet.balance -= Number(amount);
        await senderWallet.save({ session });

        // Save Transaction History
        const tx = new Transaction({
            senderWallet: senderWallet._id,
            receiverWallet: null,
            amount: Number(amount),
            type: 'EXTERNAL_TRANSFER',
            description: `Sent to ${bankName} A/C: ••••${accountNumber.trim().slice(-4)}`
        });
        await tx.save({ session });

        await session.commitTransaction();

        // Real-time Socket Notification
        notifyUser(
            req.user._id,
            "Transfer Successful 🏦",
            `PKR ${amount} sent to ${bankName} account ending in ${accountNumber.trim().slice(-4)}`,
            "TRANSACTION",
            req.io
        );

        // Send Email Confirmation
        try {
            sendMoneySentEmail(
                req.user.email,
                `${bankName} (A/C: ••••${accountNumber.trim().slice(-4)})`,
                Number(amount)
            );
        } catch (mailErr) {
            console.error("Mail Error:", mailErr);
        }

        res.json({
            message: "Bank Transfer Successful!",
            newBalance: senderWallet.balance,
            stripeToken: token.id
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(400).json({ message: error.message });
    } finally {
        session.endSession();
    }
});
// ============================================================
// UTILITY BILLING — STRIPE SANDBOX INTEGRATION
// ============================================================

// BILL TYPES CONFIG (for seeding realistic invoice descriptions)
const BILL_CONFIG = {
  'Electricity Bill': {
    providers: ['K-Electric', 'LESCO', 'IESCO'],
    amounts: [4500, 6200, 7800, 3200, 5500]
  },
  'Gas Bill': {
    providers: ['SSGC', 'SNGPL'],
    amounts: [1200, 2100, 3400, 900, 1800]
  },
  'Internet Bill': {
    providers: ['PTCL', 'Nayatel', 'StormFiber'],
    amounts: [2500, 3000, 4000, 1500, 2000]
  },
  'Mobile Package': {
    providers: ['Jazz', 'Telenor', 'Zong', 'Ufone'],
    amounts: [500, 750, 1000, 1500, 300]
  }
};

// Helper: months generate karne ke liye (Calculates the last 3 months)
const getPastMonths = () => {
  const months = [];
  const now = new Date();
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
      dueDate: new Date(d.getFullYear(), d.getMonth() + 1, 10) // Due date is the 10th of next month
    });
  }
  return months;
};

// Helper: Seed a single unpaid invoice on Stripe (Bulletproof Order)
const seedUnpaidInvoice = async (stripe, customerId, billType, month, amount) => {
  // 1. Create the Draft Invoice first so we have the invoice ID
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 10,
    currency: 'pkr', // Explicitly specify PKR
    metadata: {
      billMonth: month.label,
      dueDate: month.dueDate.toISOString(),
      billType: billType
    }
  });

  // 2. Create the Invoice Item and attach it DIRECTLY to the draft invoice we just created
  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: invoice.id, // 🌟 DIRECT ATTACHMENT: No race condition!
    amount: amount * 100, // Convert PKR to cents
    currency: 'pkr',
    description: `${billType} — ${month.label}`
  });

  // 3. Finalize Invoice (Publish it so it becomes UNPAID / open)
  await stripe.invoices.finalizeInvoice(invoice.id);
};

// ─────────────────────────────────────────────
// ROUTE 1: Fetch Bills from Stripe
// GET /api/wallet/fetch-bills?billType=Electricity Bill&consumerNumber=03001234567
// ─────────────────────────────────────────────
router.get('/fetch-bills', protect, async (req, res) => {
  try {
    const { billType, consumerNumber } = req.query;

    if (!billType || !consumerNumber) {
      return res.status(400).json({ message: 'Bill type and consumer number are required.' });
    }

    // 1. Strict Validation: Must be exactly 11-digit numeric value
    if (!/^\d{11}$/.test(consumerNumber)) {
      return res.status(400).json({ message: 'Invalid consumer number. Please enter a valid 11-digit mobile number.' });
    }

        // 🟢 NEW SECURITY CHECK: User sirf apna hi number fetch kar sake
    if (consumerNumber !== req.user.mobileNumber) {
      return res.status(400).json({ 
        message: `Account Verification Failed: You can only fetch bills registered under your own mobile number (${req.user.mobileNumber}).` 
      });
    }

    if (!BILL_CONFIG[billType]) {
      return res.status(400).json({ message: 'Invalid bill type selected.' });
    }

    // Search Stripe to see if this customer already exists
    const searchResult = await stripe.customers.search({
      query: `metadata['consumerNumber']:'${consumerNumber}' AND metadata['billType']:'${billType}'`,
      limit: 1
    });

    let customerId;

        if (searchResult.data.length > 0) {
      // Customer already exists
      customerId = searchResult.data[0].id;
      
      // 🟢 Stripe ke server par purane name ("K-Electric...") ko automatically user ke real name se badal dena!
      await stripe.customers.update(customerId, {
        name: `${req.user.firstName} ${req.user.lastName}`
      });
    } else {
      // Create new customer on Stripe
      const config = BILL_CONFIG[billType];
      const providerName = config.providers[0];

      const customer = await stripe.customers.create({
        name: `${req.user.firstName} ${req.user.lastName}`, // 🟢 Naye user ka Stripe profile direct real name se banega!
        email: req.user.email,
        metadata: {
          consumerNumber: consumerNumber,
          billType: billType,
          provider: providerName,
          userId: req.user._id.toString()
        }
      });
      customerId = customer.id;
    }
    // Fetch all invoices from Stripe for this customer
    let invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 20
    });

    const months = getPastMonths();
    const config = BILL_CONFIG[billType];
    const amounts = config.amounts;

    // Check if March, April, and May invoices exist. If not, seed them as UNPAID.
    let invoicesUpdated = false;
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      
      const exists = invoices.data.some(
        inv => inv.metadata?.billMonth === month.label && inv.metadata?.billType === billType
      );

      if (!exists) {
        // 🌟 CHOOSE RANDOM AMOUNT FOR EVERY MONTH DYNAMICALLY!
        const randomAmount = amounts[Math.floor(Math.random() * amounts.length)];
        await seedUnpaidInvoice(stripe, customerId, billType, month, randomAmount);
        invoicesUpdated = true;
      }
    }

    // If we seeded any missing invoices, fetch the fresh list
    if (invoicesUpdated) {
      invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 20
      });
    }

    // Filter and return ONLY the 3 correct months' invoices in professional English
    const formattedInvoices = [];
    for (const month of months) {
      const inv = invoices.data.find(
        item => item.metadata?.billMonth === month.label && item.metadata?.billType === billType
      );

      if (inv) {
        formattedInvoices.push({
          invoiceId: inv.id,
          billMonth: inv.metadata?.billMonth || month.label,
          amount: inv.total / 100, // Convert cents to PKR
          dueDate: inv.metadata?.dueDate
            ? new Date(inv.metadata.dueDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })
            : 'N/A',
          status: inv.status === 'paid' ? 'PAID' : 'UNPAID',
          billType: billType
        });
      }
    }

    // Stripe se user ka real customer profile retrieve karna taake name fetch ho sake
    const stripeCustomer = await stripe.customers.retrieve(customerId);
    const ownerName = stripeCustomer.name || `${req.user.firstName} ${req.user.lastName}`;

    res.json({
      customerId,
      consumerNumber,
      billType,
      ownerName: ownerName, // 🟢 Frontend ko user ka verified name send karna!
      invoices: formattedInvoices
    });

  } catch (error) {
    console.error('Fetch Bills Error:', error);
    res.status(500).json({ message: error.message || 'Could not fetch bills from Stripe.' });
  }
});



// ─────────────────────────────────────────────
// ROUTE 2: Pay Selected Bills via Stripe
// POST /api/wallet/pay-selected-bills
// Body: { invoiceIds: ['in_xxx', 'in_yyy'] }
// ─────────────────────────────────────────────
router.post('/pay-selected-bills', protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { invoiceIds, otp } = req.body;

    if (!invoiceIds || invoiceIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'No invoices selected for payment.' });
    }

    // Step 1: Stripe se har invoice ki details fetch karo
    let totalAmount = 0;
    const invoiceDetails = [];

    for (const invoiceId of invoiceIds) {
      const invoice = await stripe.invoices.retrieve(invoiceId);

      if (invoice.status !== 'open') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `Invoice ${invoice.metadata?.billMonth || invoiceId} is already paid or invalid.`
        });
      }

      totalAmount += invoice.amount_due / 100;
      invoiceDetails.push(invoice);
    }

    // Step 2: User ka wallet check karo
    const wallet = await Wallet.findOne({ userId: req.user._id }).session(session);
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.status === 'FROZEN') throw new Error('Your wallet is Frozen.');
    if (wallet.balance < totalAmount) throw new Error(` Insufficient balance`);

    // Check velocity limit before paying bills
    await checkVelocityLimit(req.user._id, req.user.email, wallet, req.io);

    // Verify Large Transaction OTP
    const isVerified = await verifyLargeTransactionOtp(req, res, totalAmount, otp, "Bill Payment");
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
        type: 'BILL_PAYMENT',
        description: `Paid ${invoice.metadata?.billType || 'Utility'} — ${invoice.metadata?.billMonth || ''}`
      });
      await tx.save({ session });
    }

    // Step 5: Database transaction commit karo
    await session.commitTransaction();
    session.endSession();

    // Step 6: Real-time notification bhejo
    notifyUser(
      req.user._id,
      'Bills Paid ✅',
      `PKR ${totalAmount.toLocaleString()} deducted for ${invoiceIds.length} bill(s).`,
      'TRANSACTION',
      req.io
    );

    res.json({
      message: `Successfully paid ${invoiceIds.length} bill(s)!`,
      totalPaid: totalAmount,
      newBalance: wallet.balance
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Pay Bills Error:', error);
    res.status(400).json({ message: error.message || 'Payment failed.' });
  }
});
export default router;
