import mongoose from 'mongoose';
import User from './models/User.js';
import PendingUser from './models/PendingUser.js';
import Wallet from './models/Wallet.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function cleanupTestData() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Show current data
        const userCount = await User.countDocuments();
        const pendingCount = await PendingUser.countDocuments();
        const walletCount = await Wallet.countDocuments();

        console.log('📊 Current Database Status:');
        console.log(`   Users: ${userCount}`);
        console.log(`   Pending Users: ${pendingCount}`);
        console.log(`   Wallets: ${walletCount}\n`);

        // Clean up any pending users (they might be expired or stuck)
        console.log('🧹 Cleaning up pending users...');
        const deletedPending = await PendingUser.deleteMany({});
        console.log(`✅ Deleted ${deletedPending.deletedCount} pending users\n`);

        // Optional: Remove test users (uncomment if needed)
        // console.log('🧹 Cleaning up test users...');
        // const deletedUsers = await User.deleteMany({ email: { $regex: /test|demo/i } });
        // console.log(`✅ Deleted ${deletedUsers.deletedCount} test users\n`);

        console.log('📊 Final Database Status:');
        const finalUserCount = await User.countDocuments();
        const finalPendingCount = await PendingUser.countDocuments();
        const finalWalletCount = await Wallet.countDocuments();

        console.log(`   Users: ${finalUserCount}`);
        console.log(`   Pending Users: ${finalPendingCount}`);
        console.log(`   Wallets: ${finalWalletCount}\n`);

        console.log('✅ Cleanup complete! Database is ready for testing.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

cleanupTestData();
