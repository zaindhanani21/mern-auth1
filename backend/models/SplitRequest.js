import mongoose from 'mongoose';

const SplitParticipantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' }
});

const SplitRequestSchema = new mongoose.Schema({
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    participants: [SplitParticipantSchema],
    status: { type: String, enum: ['PENDING', 'PARTIALLY_PAID', 'COMPLETED'], default: 'PENDING' }
}, { timestamps: true });

const SplitRequest = mongoose.model('SplitRequest', SplitRequestSchema);
export default SplitRequest;
