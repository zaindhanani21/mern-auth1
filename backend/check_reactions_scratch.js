import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load env from backend
dotenv.config();

const PostSchema = new mongoose.Schema({
    author: mongoose.Schema.Types.ObjectId,
    content: String,
    reactions: Array
});

const Post = mongoose.model('Post', PostSchema);

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB!");
    const posts = await Post.find();
    for (let post of posts) {
        if (post.reactions && post.reactions.length > 0) {
            console.log(`Post ID: ${post._id} | Content: "${post.content.substring(0, 30)}..."`);
            console.log(`Reactions:`, JSON.stringify(post.reactions, null, 2));
        }
    }
    await mongoose.disconnect();
}

run().catch(console.error);
