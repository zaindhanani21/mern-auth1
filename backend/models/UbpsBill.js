import mongoose from 'mongoose';

const UbpsBillSchema = new mongoose.Schema(
    {
        consumerNumber: {
            type: String,
            required: true,
            unique: true
        },
        contractNumber: {
            type: String,
            required: true
        },
        billType: {
            type: String,
            required: true,
            enum: ['Electricity Bill', 'Gas Bill', 'Water Bill', 'Internet Bill']
        },
        provider: {
            type: String,
            required: true
        },
        ownerName: {
            type: String,
            required: true
        },
        billMonth: {
            type: String,
            required: true
        },
        unitsConsumed: {
            type: String,
            required: true
        },
        amountDue: {
            type: Number,
            required: true,
            min: 0
        },
        lateFee: {
            type: Number,
            required: true,
            min: 0
        },
        amountAfterDueDate: {
            type: Number,
            required: true,
            min: 0
        },
        dueDate: {
            type: Date,
            required: true
        },
        status: {
            type: String,
            enum: ['UNPAID', 'PAID'],
            default: 'UNPAID'
        }
    },
    { timestamps: true }
);

const UbpsBill = mongoose.model('UbpsBill', UbpsBillSchema);
export default UbpsBill;
