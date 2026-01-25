import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function verifySchema() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Check indexes
        console.log('📋 Current Indexes on Users Collection:');
        const indexes = await usersCollection.indexes();
        indexes.forEach((index, i) => {
            console.log(`\n${i + 1}. ${index.name}:`);
            console.log(`   Keys: ${JSON.stringify(index.key)}`);
            if (index.unique) console.log(`   Unique: ✅`);
        });

        // Check schema fields
        console.log('\n\n📝 User Model Schema Fields:');
        const schema = User.schema.obj;
        Object.keys(schema).forEach(field => {
            const fieldDef = schema[field];
            let info = `   ${field}:`;
            if (fieldDef.type) info += ` ${fieldDef.type.name}`;
            if (fieldDef.required) info += ' (required)';
            if (fieldDef.unique) info += ' (unique)';
            console.log(info);
        });

        // Verify no cnicNum field exists
        console.log('\n\n✅ Verification Results:');
        const hasCnicNum = indexes.some(idx => idx.name === 'cnicNum_1');
        const hasCnicEncrypted = Object.keys(schema).includes('cnicEncrypted');
        const hasCnicHash = Object.keys(schema).includes('cnicHash');

        console.log(`   ❌ Old cnicNum index: ${hasCnicNum ? '⚠️  STILL EXISTS!' : '✅ Removed'}`);
        console.log(`   ✅ cnicEncrypted field: ${hasCnicEncrypted ? '✅ Present' : '❌ Missing'}`);
        console.log(`   ✅ cnicHash field: ${hasCnicHash ? '✅ Present' : '❌ Missing'}`);

        if (!hasCnicNum && hasCnicEncrypted && hasCnicHash) {
            console.log('\n🎉 Schema is correct! Ready for signup testing.');
        } else {
            console.log('\n⚠️  Schema has issues. Please review above.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verifySchema();
