import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        // 🟢 Remove required: true to allow System/Admin deposits
        required: false 
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: [true, "Recipient is required"]
    },
    amount: {
        type: Number,
        required: [true, "Amount is required"],
        min: [1, "Amount must be at least 1"]
    },
    description: {
        type: String,
        default: "Transfer"
    },
    status: {
        type: String,
        enum: ['completed', 'failed'],
        default: 'completed'
    }
}, { timestamps: true });

export default mongoose.model("Transaction", transactionSchema);