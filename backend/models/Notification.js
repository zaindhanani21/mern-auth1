import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ['TRANSACTION', 'SECURITY', 'SYSTEM', 'SPLIT_REQUEST'],
            default: 'SYSTEM'
        },
        isRead: { type: Boolean, default: false },
        metadata: { type: Object } // Optional: linking to txId etc
    },
    { timestamps: true }
);

const Notification = mongoose.model('Notification', NotificationSchema);
export default Notification;
