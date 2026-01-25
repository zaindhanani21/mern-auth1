import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

async function fixIndexes() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Get all indexes
        console.log('\n📋 Current indexes on users collection:');
        const indexes = await usersCollection.indexes();
        console.log(JSON.stringify(indexes, null, 2));

        // Drop the old cnicNum index if it exists
        try {
            console.log('\n🗑️  Attempting to drop old cnicNum_1 index...');
            await usersCollection.dropIndex('cnicNum_1');
            console.log('✅ Successfully dropped cnicNum_1 index');
        } catch (error) {
            if (error.code === 27) {
                console.log('ℹ️  Index cnicNum_1 does not exist (already removed)');
            } else {
                console.log('⚠️  Error dropping index:', error.message);
            }
        }

        // Verify final indexes
        console.log('\n📋 Final indexes on users collection:');
        const finalIndexes = await usersCollection.indexes();
        console.log(JSON.stringify(finalIndexes, null, 2));

        console.log('\n✅ Index cleanup complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixIndexes();
