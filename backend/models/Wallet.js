import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        walletId: {
            type: String,
            required: true,
            unique: true
        },
        balance: {
            type: Number,
            default: 0,
            min: 0,
            get: (v) => Math.round(v * 100) / 100,
            set: (v) => Math.round(v * 100) / 100
        },
        currency: {
            type: String,
            default: 'PKR',
            enum: ['PKR', 'USD']
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'FROZEN'],
            default: 'ACTIVE'
        },
        isDeleted: { type: Boolean, default: false }
    },
    { timestamps: true }
);

const Wallet = mongoose.model('Wallet', WalletSchema);
export default Wallet;
