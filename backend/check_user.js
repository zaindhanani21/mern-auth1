import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

async function checkUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");
        const user = await User.findOne({ mobileNumber: '03009243954' });
        if (user) {
            console.log("Found user:", user.firstName, user.lastName);
        } else {
            console.log("User NOT found in database");
            const allUsers = await User.find({}).select('mobileNumber');
            console.log("Other users in DB:", allUsers.map(u => u.mobileNumber));
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkUser();
