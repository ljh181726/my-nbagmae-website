const { connectDB } = require('./db');

const memoryCache = new Map();
const CACHE_TTL_2026 = 60 * 60 * 1000; // 1 hour TTL for the active 2026 season
let cache2026Time = 0;

async function getYearPlayers(year) {
  const cacheKey = `y${year}`;
  
  // Return cached list if available and not expired (for 2026)
  if (memoryCache.has(cacheKey)) {
    if (year !== 2026 || (Date.now() - cache2026Time < CACHE_TTL_2026)) {
      return memoryCache.get(cacheKey);
    }
  }

  try {
    const db = await connectDB();
    const collectionName = `y${year}`;
    
    console.log(`🔌 Cache Miss: Querying MongoDB Atlas for collection '${collectionName}'...`);
    const players = await db.collection(collectionName).find({}).toArray();
    
    // Save to memory cache
    memoryCache.set(cacheKey, players);
    if (year === 2026) {
      cache2026Time = Date.now();
    }
    
    console.log(`💾 Cache Set: Cached ${players.length} players for year ${year}`);
    return players;
  } catch (err) {
    console.error(`❌ Failed to retrieve players from DB for year ${year}:`, err);
    // Return empty array to prevent crashing
    return [];
  }
}

function clearCache() {
  memoryCache.clear();
  cache2026Time = 0;
}

module.exports = { getYearPlayers, clearCache };
