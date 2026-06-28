import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Wallet from './models/Wallet.js';

dotenv.config();

async function inspect() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const wallets = await Wallet.find({});
        console.log('\n--- WALLETS ---');
        wallets.forEach(w => {
            console.log({
                userId: w.userId,
                walletId: w.walletId,
                status: w.status,
                failedPinAttempts: w.failedPinAttempts,
                pinBlockUntil: w.pinBlockUntil,
                mustResetPin: w.mustResetPin
            });
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
