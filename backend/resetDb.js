import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import Wallet from "./models/Wallet.js";
import Transaction from "./models/Transaction.js";
import Notification from "./models/Notification.js";

dotenv.config();

const resetDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Connected for Reset...");

        // Delete Users
        const users = await User.deleteMany({});
        console.log(`🗑️ Deleted ${users.deletedCount} Users.`);

        // Delete Wallets
        const wallets = await Wallet.deleteMany({});
        console.log(`🗑️ Deleted ${wallets.deletedCount} Wallets.`);

        // Delete Transactions
        const txs = await Transaction.deleteMany({});
        console.log(`🗑️ Deleted ${txs.deletedCount} Transactions.`);

        // Delete Notifications
        const notifs = await Notification.deleteMany({});
        console.log(`🗑️ Deleted ${notifs.deletedCount} Notifications.`);

        console.log("✨ Database successfully cleared!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error resetting database:", err);
        process.exit(1);
    }
};

resetDatabase();
