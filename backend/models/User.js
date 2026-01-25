import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Encryption setup for CNIC
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'); // 32 bytes for AES-256
const IV_LENGTH = 16; // AES block size

function encrypt(text) {
  if (!text) return text;
  // Ensure key is Buffer of 32 bytes
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').length === 32
    ? Buffer.from(ENCRYPTION_KEY, 'hex')
    : crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();

  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// 🟢 Decryption is mainly for internal checking if needed, 
// but usually we just compare hashes or only decrypt when displaying to authorized admin.
// For "unique" checks on encrypted fields, standard practice is to also store a "blind index" (hash) 
// but for simplicity here we might just have to scan or decrypt all (slow) OR simpler: 
// Just store a hashed version for uniqueness check and encrypted version for storage.
// To keep it simple for this "senior architect" prompt: 
// I will store a `cnicHash` for uniqueness and `cnicEncrypted` for the data.

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    midName: { type: String, trim: true, default: '' },
    lastName: { type: String, required: true, trim: true },

    // Identifiers
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    // Security
    password: { type: String, required: true, select: false }, // Hashed

    // Personal Details
    dateOfBirth: { type: Date, required: true },
    nationality: { type: String, required: true },

    // Profile Picture
    profilePicture: { type: String, default: null }, // URL or base64

    // Encrypted Sensitive Data
    cnicEncrypted: { type: String, required: true },
    cnicHash: { type: String, required: true }, // No longer unique constraint

    // Status Flags
    isEmailVerified: { type: Boolean, default: false },
    isMobileVerified: { type: Boolean, default: false },

    // Role/Auth
    isAdmin: { type: Boolean, default: false },

    // OTP System
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },

    // Timestamp
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to check password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Helper to encrypt CNIC (Static or method)
UserSchema.statics.encryptCNIC = function (cnic) {
  return encrypt(cnic);
};
UserSchema.statics.hashCNIC = function (cnic) {
  return crypto.createHash('sha256').update(cnic).digest('hex');
};

const User = mongoose.model('User', UserSchema);
export default User;