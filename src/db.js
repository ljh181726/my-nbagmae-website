const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
let client = null;
let db = null;

async function connectDB() {
  if (db) return db;
  
  if (!uri) {
    console.warn('⚠️ MONGODB_URI is not defined in environment variables. Falling back to local/in-memory mode if applicable.');
    throw new Error('MONGODB_URI is missing');
  }

  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10, // Limits connections to protect MongoDB Atlas M0 free tier
      minPoolSize: 1,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    await client.connect();
    db = client.db('nba_draft_showdown');
    console.log('✅ Connected successfully to MongoDB Atlas database:', db.databaseName);
    return db;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }
}

module.exports = { connectDB };
