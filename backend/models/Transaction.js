import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
    {
        senderWallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            default: null // Null for deposits
        },
        receiverWallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            default: null
        },
        amount: { type: Number, required: true },
        type: {
            type: String,
            enum: ['SEND', 'RECEIVE', 'ADD_MONEY', 'BILL_PAYMENT', 'SPLIT_PAYMENT', 'EXTERNAL_TRANSFER'],
            required: true
        },
        description: { type: String },
        status: {
            type: String,
            enum: ['COMPLETED', 'FAILED', 'PENDING'],
            default: 'COMPLETED'
        }
    },
    { timestamps: true }
);

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;