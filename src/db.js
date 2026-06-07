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
    const updateDoc = {
      $set: { 
        name: profile.name, 
        avatar: profile.avatar, 
        lastLoginAt: now 
      } 
    };
    
    // Migrate existing users to have the new fields if missing
    if (existing.virtual_currency === undefined) {
      updateDoc.$set.virtual_currency = 10;
      updateDoc.$set.last_sign_in_date = null;
      updateDoc.$set.continuous_days = 0;
      updateDoc.$set.pve_cleared_stages = [];
      updateDoc.$set.pre_banned_players = [
        { team: '', jersey: '' },
        { team: '', jersey: '' },
        { team: '', jersey: '' }
      ];
    }
    
    await collection.updateOne({ uid: profile.uid }, updateDoc);
    return await collection.findOne({ uid: profile.uid });
  }

  const newUser = {
    uid: profile.uid,
    name: profile.name,
    avatar: profile.avatar,
    provider: profile.provider,
    points: 100, // legacy points
    virtual_currency: 10, // starting coins (generous default for testing)
    last_sign_in_date: null,
    continuous_days: 0,
    pve_cleared_stages: [],
    pre_banned_players: [
      { team: '', jersey: '' },
      { team: '', jersey: '' },
      { team: '', jersey: '' }
    ],
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
  
  if (user.last_sign_in_date === todayStr) {
    return { success: false, message: '今天已經簽到過了！', user };
  }

  let newStreak = 1;
  if (user.last_sign_in_date) {
    const lastDate = new Date(user.last_sign_in_date);
    const today = new Date(todayStr);
    const diffTime = Math.abs(today - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      newStreak = (user.continuous_days || 0) + 1;
      if (newStreak > 7) newStreak = 7;
    } else {
      newStreak = 1;
    }
  }

  // Calculate checkin reward coins
  // Base: 3 coins. If streak is 7, +10 coins extra.
  let coinsGained = 3;
  if (newStreak === 7) {
    coinsGained += 10;
  }

  // All-Clear Passive check:
  // "當玩家成功將 60 個 PVE 關卡全部通過後，系統必須在其帳號上解鎖一個永久被動狀態。
  // 此後該玩家每天簽到或登入時，都可以固定每天多領取 5 元的全通關福利。"
  let hasAllClearPassive = false;
  if (user.pve_cleared_stages && user.pve_cleared_stages.length >= 60) {
    hasAllClearPassive = true;
    coinsGained += 5;
  }

  const updatedCurrency = (user.virtual_currency || 0) + coinsGained;

  await collection.updateOne(
    { uid },
    {
      $set: {
        last_sign_in_date: todayStr,
        continuous_days: newStreak,
        virtual_currency: updatedCurrency,
        // Also sync old legacy fields
        lastCheckInDate: todayStr,
        checkInStreak: newStreak,
        points: (user.points || 0) + coinsGained * 10
      }
    }
  );

  const updatedUser = await collection.findOne({ uid });
  return { 
    success: true, 
    coinsGained, 
    streak: newStreak, 
    hasAllClearPassive,
    user: updatedUser 
  };
}

async function incrementRookieGames(uid) {
  const database = await connectDB();
  const collection = database.collection('users');
  await collection.updateOne({ uid }, { $inc: { rookieGamesPlayed: 1 } });
}

async function updatePVEProgress(uid, nextLevelToUnlock) {
  const database = await connectDB();
  const collection = database.collection('users');
  const user = await collection.findOne({ uid });
  if (!user) return { success: false, message: 'User not found' };
  
  const clearedLevel = nextLevelToUnlock - 1;
  let coinsAwarded = 0;
  let firstClear = false;

  const clearedStages = user.pve_cleared_stages || [];
  const newUnlocked = Math.max(user.unlockedLevel || 1, nextLevelToUnlock);

  const updateSet = { unlockedLevel: newUnlocked };
  const updateDoc = { $set: updateSet };

  if (clearedLevel >= 1 && clearedLevel <= 60 && !clearedStages.includes(clearedLevel)) {
    firstClear = true;
    // Bronze (1-15) = 1 coin
    // Silver (16-30) = 2 coins
    // Gold/Legend (31-60) = 3 coins
    if (clearedLevel <= 15) {
      coinsAwarded = 1;
    } else if (clearedLevel <= 30) {
      coinsAwarded = 2;
    } else {
      coinsAwarded = 3;
    }

    updateDoc.$push = { pve_cleared_stages: clearedLevel };
    updateDoc.$inc = { virtual_currency: coinsAwarded };
  }

  await collection.updateOne({ uid }, updateDoc);
  const updatedUser = await collection.findOne({ uid });

  return { 
    success: true, 
    firstClear, 
    coinsAwarded, 
    clearedLevel, 
    user: updatedUser 
  };
}

module.exports = {
  connectDB,
  getUserByUid,
  findOrCreateUser,
  performCheckIn,
  incrementRookieGames,
  updatePVEProgress
};

