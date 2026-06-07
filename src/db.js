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

async function getUserByUid(uid) {
  const database = await connectDB();
  return await database.collection('users').findOne({ uid });
}

async function findOrCreateUser(profile) {
  const database = await connectDB();
  const collection = database.collection('users');
  const now = new Date();
  
  const existing = await collection.findOne({ uid: profile.uid });
  if (existing) {
    await collection.updateOne(
      { uid: profile.uid },
      { 
        $set: { 
          name: profile.name, 
          avatar: profile.avatar, 
          lastLoginAt: now 
        } 
      }
    );
    return await collection.findOne({ uid: profile.uid });
  }

  const newUser = {
    uid: profile.uid,
    name: profile.name,
    avatar: profile.avatar,
    provider: profile.provider,
    points: 100, // starting points
    lastCheckInDate: null,
    checkInStreak: 0,
    rookieGamesPlayed: 0,
    unlockedLevel: 1, // Start at Level 1
    createdAt: now,
    lastLoginAt: now
  };
  await collection.insertOne(newUser);
  return newUser;
}

async function performCheckIn(uid) {
  const database = await connectDB();
  const collection = database.collection('users');
  const user = await collection.findOne({ uid });
  if (!user) throw new Error('User not found');

  const todayStr = new Date().toISOString().split('T')[0];
  
  if (user.lastCheckInDate === todayStr) {
    return { success: false, message: '今天已經簽到過了！', user };
  }

  let newStreak = 1;
  if (user.lastCheckInDate) {
    const lastDate = new Date(user.lastCheckInDate);
    const today = new Date(todayStr);
    const diffTime = Math.abs(today - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      newStreak = (user.checkInStreak || 0) + 1;
      if (newStreak > 7) newStreak = 7;
    } else {
      newStreak = 1;
    }
  }

  const pointsGained = 100 * newStreak + (newStreak === 7 ? 500 : 0);
  const updatedPoints = (user.points || 0) + pointsGained;

  await collection.updateOne(
    { uid },
    {
      $set: {
        lastCheckInDate: todayStr,
        checkInStreak: newStreak,
        points: updatedPoints
      }
    }
  );

  const updatedUser = await collection.findOne({ uid });
  return { success: true, pointsGained, streak: newStreak, user: updatedUser };
}

async function incrementRookieGames(uid) {
  const database = await connectDB();
  const collection = database.collection('users');
  await collection.updateOne({ uid }, { $inc: { rookieGamesPlayed: 1 } });
}

async function updatePVEProgress(uid, level) {
  const database = await connectDB();
  const collection = database.collection('users');
  const user = await collection.findOne({ uid });
  if (user && level > (user.unlockedLevel || 1)) {
    await collection.updateOne({ uid }, { $set: { unlockedLevel: level } });
  }
}

module.exports = {
  connectDB,
  getUserByUid,
  findOrCreateUser,
  performCheckIn,
  incrementRookieGames,
  updatePVEProgress
};

