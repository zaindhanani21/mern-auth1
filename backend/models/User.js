import mongoose from 'mongoose';

// Define the User Schema
const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: [true, 'First name is required'], trim: true, minlength: 2 },
    midName: { type: String, trim: true, default: '' }, 
    lastName: { type: String, required: [true, 'Last name is required'], trim: true, minlength: 2 },
    
    email: { 
        type: String, 
        required: [true, 'Email is required'], 
        unique: true, 
        lowercase: true, 
        trim: true 
    },
    
    mobileNumber: { 
        type: String, 
        required: [true, 'Mobile number is required'], 
        unique: true, 
        trim: true,
        match: [/^\d{11}$/, 'Mobile number must be exactly 11 digits.'] 
    },

    dateOfBirth: { type: Date, required: [true, 'Date of birth is required'] },
    nationality: { type: String, required: [true, 'Nationality is required'], trim: true },

    cnicNum: { 
        type: String, 
        required: [true, 'CNIC number is required'], 
        unique: true, 
        trim: true,
        // 🟢 Regex updated to strictly match the XXXXX-XXXXXXX-X format from your React frontend
        match: [/^\d{5}-\d{7}-\d{1}$/, 'CNIC must be in the format XXXXX-XXXXXXX-X'] 
    },

    password: { type: String, required: [true, 'Password is required'], minlength: 6, select: false },
    
    // 🟢 OTP Fields for 2FA and Password Reset
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },

    balance: { 
        type: Number, 
        default: 0, 
        min: 0, 
        set: v => Math.round(v * 100) / 100 
    },

    
    isFrozen: { type: Boolean, default: false },
  freezeOtp: { type: String }, // 🟢 Must be exactly this name
  freezeOtpExpires: { type: Date } // 🟢 Must be exactly this name
  },
  { timestamps: true }
);

// Export the Mongoose model
const User = mongoose.model('User', UserSchema);
export default User;