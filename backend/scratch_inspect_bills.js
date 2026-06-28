import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UbpsBill from './models/UbpsBill.js';

dotenv.config();

async function inspect() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const count = await UbpsBill.countDocuments();
        console.log(`\nTotal Bills in database: ${count}`);

        const sampleBills = await UbpsBill.find({}, 'consumerNumber billType provider ownerName billMonth status');
        console.log('\n--- ALL BILLS ---');
        sampleBills.forEach(b => {
            console.log(`Consumer: ${b.consumerNumber} | Type: ${b.billType} | Provider: ${b.provider} | Owner: ${b.ownerName} | Month: ${b.billMonth} | Status: ${b.status}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
