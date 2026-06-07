import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
    {
        senderWallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            default: null,
            immutable: true // 🟢 Field level lock: edit blocked
        },
        receiverWallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            default: null,
            immutable: true // 🟢 Field level lock: edit blocked
        },
        amount: { 
            type: Number, 
            required: true,
            immutable: true // 🟢 Field level lock: edit blocked
        },
        type: {
            type: String,
            enum: ['SEND', 'RECEIVE', 'ADD_MONEY', 'BILL_PAYMENT', 'SPLIT_PAYMENT', 'EXTERNAL_TRANSFER'],
            required: true,
            immutable: true // 🟢 Field level lock: edit blocked
        },
        description: { 
            type: String,
            immutable: true // 🟢 Field level lock: edit blocked
        },
        status: {
            type: String,
            enum: ['COMPLETED', 'FAILED', 'PENDING'],
            default: 'COMPLETED',
            immutable: true // 🟢 Field level lock: edit blocked
        }
    },
    { timestamps: true }
);

// 🟢 MIDDLEWARE 1: Deletion block karna
TransactionSchema.pre('remove', function(next) {
    next(new Error('Transactions are immutable and cannot be deleted!'));
});

// 🟢 MIDDLEWARE 2: Update queries block karna
TransactionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'update'], function(next) {
    next(new Error('Transactions are immutable and cannot be updated!'));
});

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;