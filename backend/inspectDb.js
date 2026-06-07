import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import FriendRequest from './models/FriendRequest.js';

dotenv.config();

async function inspect() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const users = await User.find({}, '_id username email firstName lastName');
        console.log('\n--- USERS ---');
        console.log(users);

        const requests = await FriendRequest.find({});
        console.log('\n--- FRIEND REQUESTS ---');
        console.log(requests);

        // Check if any request points to non-existent users
        for (const req of requests) {
            const senderExists = await User.exists({ _id: req.sender });
            const recipientExists = await User.exists({ _id: req.recipient });
            console.log(`Request ID: ${req._id} | Sender: ${req.sender} (Exists: ${!!senderExists}) | Recipient: ${req.recipient} (Exists: ${!!recipientExists})`);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
