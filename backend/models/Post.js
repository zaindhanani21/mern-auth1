import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ReactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['like', 'love', 'haha', 'sad', 'angry'],
        required: true
    }
});

const PostSchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        content: {
            type: String,
            required: true,
            trim: true
        },
        visibility: {
            type: String,
            enum: ['public', 'friends', 'private'],
            default: 'public'
        },
        comments: [CommentSchema], // 🟢 Comments list nested inside post
        reactions: [ReactionSchema] // 🟢 Reactions list nested inside post
    },
    { timestamps: true }
);

const Post = mongoose.model('Post', PostSchema);
export default Post;