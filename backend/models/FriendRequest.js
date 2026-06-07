import mongoose from 'mongoose';

const FriendRequestSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
            default: 'PENDING'
        }
    },
    { timestamps: true }
);

// Yeh index ensure karta hai ke unique combinations hi store hon (Duplicate requests prevent karne ke liye)
FriendRequestSchema.index({ sender: 1, recipient: 1 }, { unique: true });

const FriendRequest = mongoose.model('FriendRequest', FriendRequestSchema);
export default FriendRequest;