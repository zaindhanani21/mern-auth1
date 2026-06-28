import mongoose from 'mongoose';

const OneLinkBankSchema = new mongoose.Schema(
  {
    bankName: {
      type: String,
      required: true,
      trim: true
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true
    },
    accountHolder: {
      type: String,
      required: true,
      trim: true
    },
    iban: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    balance: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  },
  { timestamps: true }
);

const OneLinkBank = mongoose.model('OneLinkBank', OneLinkBankSchema);
export default OneLinkBank;