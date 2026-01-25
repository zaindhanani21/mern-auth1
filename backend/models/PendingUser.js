import mongoose from 'mongoose';

// Flexible schema to hold all registration data temporarily
// This auto-deletes itself after 10 minutes (TTL) to keep DB clean
const PendingUserSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true },
        midName: { type: String, default: '' },
        lastName: { type: String, required: true },

        email: { type: String, required: true },
        mobileNumber: { type: String, required: true },

        password: { type: String, required: true }, // Stored temporarily until verified

        dateOfBirth: { type: Date, required: true },
        nationality: { type: String, required: true },

        cnicNum: { type: String, required: true }, // Raw input, will be encrypted on move

        otp: { type: String, required: true },

        createdAt: { type: Date, default: Date.now, expires: 600 } // Documents expire after 600s (10m)
    },
    { timestamps: true }
);

const PendingUser = mongoose.model('PendingUser', PendingUserSchema);
export default PendingUser;
