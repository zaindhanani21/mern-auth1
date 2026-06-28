import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OneLinkBank from './models/OneLinkBank.js';

dotenv.config();

async function inspect() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const account = await OneLinkBank.findOne({ bankName: "HBL Bank" });
        if (account) {
            console.log("Account Holder:", account.accountHolder);
            console.log("Account Number:", account.accountNumber);
            console.log("IBAN:", account.iban);
            console.log("IBAN Length:", account.iban.length);
        } else {
            console.log("No HBL Bank account found.");
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
