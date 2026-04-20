import express from 'express';
import { protect } from '../auth.js';
import User from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

// Helper to decrypt CNIC for display
function decrypt(text) {
    if (!text || !text.includes(':')) return text;

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex').length === 32
        ? Buffer.from(ENCRYPTION_KEY, 'hex')
        : crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();

    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return 'XXXXX-XXXXXXX-X'; // Return masked if decryption fails
    }
}

// GET /api/profile - Get current user's profile
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -otp -otpExpires');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Decrypt CNIC for display (masked)
        const cnicDecrypted = decrypt(user.cnicEncrypted);
        const cnicMasked = cnicDecrypted.replace(/(\d{5})-(\d{7})-(\d{1})/, '$1-****$3-$3');

        res.json({
            id: user._id,
            firstName: user.firstName,
            midName: user.midName,
            lastName: user.lastName,
            email: user.email,
            mobileNumber: user.mobileNumber,
            dateOfBirth: user.dateOfBirth,
            nationality: user.nationality,
            cnicMasked,
            cnicFull: cnicDecrypted, // Send full for editing (only if needed)
            profilePicture: user.profilePicture,
            isEmailVerified: user.isEmailVerified,
            isMobileVerified: user.isMobileVerified,
            createdAt: user.createdAt
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/profile/update - Update profile (allowed fields only)
router.put('/update', protect, async (req, res) => {
    try {
        const { firstName, midName, lastName, dateOfBirth, nationality } = req.body;

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update allowed fields
        if (firstName) user.firstName = firstName;
        if (midName !== undefined) user.midName = midName; // Allow empty string
        if (lastName) user.lastName = lastName;
        if (dateOfBirth) user.dateOfBirth = dateOfBirth;
        if (nationality) user.nationality = nationality;

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: {
                firstName: user.firstName,
                midName: user.midName,
                lastName: user.lastName,
                dateOfBirth: user.dateOfBirth,
                nationality: user.nationality
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/profile/upload-picture - Upload profile picture (base64)
router.post('/upload-picture', protect, async (req, res) => {
    try {
        const { profilePicture } = req.body;

        if (!profilePicture) {
            return res.status(400).json({ message: 'No image data provided' });
        }

        // Validate base64 image (basic check)
        if (!profilePicture.startsWith('data:image/')) {
            return res.status(400).json({ message: 'Invalid image format' });
        }

        // Check size (limit to 2MB base64)
        if (profilePicture.length > 2 * 1024 * 1024) {
            return res.status(400).json({ message: 'Image too large (max 2MB)' });
        }

        const user = await User.findById(req.user._id);
        user.profilePicture = profilePicture;
        await user.save();

        res.json({
            message: 'Profile picture updated successfully',
            profilePicture: user.profilePicture
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/profile/:userId - Get public profile of another user
router.get('/:userId', protect, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('firstName lastName mobileNumber profilePicture');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            mobileNumber: user.mobileNumber,
            profilePicture: user.profilePicture
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/profile/mobile/:mobileNumber - Get public profile by mobile number
router.get('/mobile/:mobileNumber', protect, async (req, res) => {
    try {
        const user = await User.findOne({ mobileNumber: req.params.mobileNumber }).select('firstName lastName mobileNumber');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            mobileNumber: user.mobileNumber
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
