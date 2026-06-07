import mongoose from 'mongoose';

const SocialProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        displayName: {
            type: String,
            required: true,
            trim: true
        },
        profilePicture: {
            type: String,
            default: null
        },
        friends: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        ]
    },
    { timestamps: true }
);

const SocialProfile = mongoose.model('SocialProfile', SocialProfileSchema);
export default SocialProfile;