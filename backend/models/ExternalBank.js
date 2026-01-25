import mongoose from 'mongoose';

const ExternalBankSchema = new mongoose.Schema(
  {
    cardHolderName: { 
      type: String, 
      required: [true, 'Card holder name is required'], 
      trim: true 
    },
    
    cardNumber: { 
      type: String, 
      required: [true, 'Card number is required'], 
      unique: true, 
      trim: true,
      // 🟢 Force this to stay a string to match Atlas
      match: [/^\d{16}$/, 'Card number must be exactly 16 digits'] 
    },

    expiryDate: { 
      type: String, 
      required: [true, 'Expiry date is required'],
      trim: true,
      match: [/^(0[1-9]|1[0-2])\/\d{2}$/, 'Expiry must be in MM/YY format']
    },

    cvc: { 
      type: String, 
      required: [true, 'CVC is required'],
      trim: true,
      match: [/^\d{3}$/, 'CVC must be exactly 3 digits']
    },

    bankBalance: { 
      type: Number, 
      required: true, 
      min: [0, 'Bank balance cannot be negative'],
      default: 0
    },

    currency: {
      type: String,
      default: "PKR",
      enum: ["PKR"], 
      immutable: true 
    },

    bankName: { 
      type: String, 
      default: "Global Partner Bank",
      trim: true 
    }
  },
  { 
    timestamps: true,
    // 🟢 OPTIONAL: Use this if your Atlas collection name is NOT "externalbanks"
    // collection: 'externalbanks' 
  }
);

ExternalBankSchema.index({ cardNumber: 1 });

const ExternalBank = mongoose.model('ExternalBank', ExternalBankSchema);
export default ExternalBank;