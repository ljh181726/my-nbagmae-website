const { connectDB } = require('./db');
const { getYearPlayers } = require('./cache');

// In-memory rooms cache for active sockets
const activeRooms = new Map();

// Franchise History Mapping Config
const FRANCHISE_MAPPING = {
  "OKC": [
    { abbr: "OKC", start: 2008, end: 2026 },
    { abbr: "SEA", start: 1967, end: 2007 }
  ],
  "SAC": [
    { abbr: "SAC", start: 1985, end: 2026 },
    { abbr: "KCK", start: 1975, end: 1984 },
    { abbr: "KCO", start: 1972, end: 1974 },
    { abbr: "CIN", start: 1957, end: 1971 },
    { abbr: "ROC", start: 1948, end: 1956 }
  ],
  "WAS": [
    { abbr: "WAS", start: 1997, end: 2026 },
    { abbr: "WSB", start: 1973, end: 1996 },
    { abbr: "CAP", start: 1971, end: 1972 },
    { abbr: "BAL", start: 1963, end: 1970 }
  ],
  "MEM": [
    { abbr: "MEM", start: 2001, end: 2026 },
    { abbr: "VAN", start: 1995, end: 2000 }
  ],
  "BKN": [
    { abbr: "BKN", start: 2012, end: 2026 },
    { abbr: "NJN", start: 1977, end: 2011 },
    { abbr: "NYN", start: 1976, end: 1976 }
  ],
  "CHA": [
    { abbr: "CHA", start: 2014, end: 2026 },
    { abbr: "CHA", start: 2004, end: 2013 }, // Bobcats
    { abbr: "CHH", start: 1988, end: 2001 }
  ],
  "NOP": [
    { abbr: "NOP", start: 2013, end: 2026 },
    { abbr: "NOH", start: 2002, end: 2012 },
    { abbr: "NOK", start: 2005, end: 2007 }
  ],
  "LAC": [
    { abbr: "LAC", start: 1984, end: 2026 },
    { abbr: "SDC", start: 1978, end: 1983 },
    { abbr: "BUF", start: 1970, end: 1977 }
  ],
  "GSW": [
    { abbr: "GSW", start: 1971, end: 2026 },
    { abbr: "SFW", start: 1962, end: 1970 }
  ],
  "HOU": [
    { abbr: "HOU", start: 1971, end: 2026 },
    { abbr: "SDR", start: 1967, end: 1970 }
  ],
  "UTA": [
    { abbr: "UTA", start: 1979, end: 2026 },
    { abbr: "NOJ", start: 1974, end: 1978 }
  ],
  "DET": [
    { abbr: "DET", start: 1957, end: 2026 },
    { abbr: "FTW", start: 1948, end: 1956 }
  ],
  "PHI": [
    { abbr: "PHI", start: 1963, end: 2026 },
    { abbr: "SYR", start: 1949, end: 1962 }
  ],
  "ATL": [
    { abbr: "ATL", start: 1968, end: 2026 },
    { abbr: "SLH", start: 1955, end: 1967 },
    { abbr: "MIL", start: 1951, end: 1954 },
    { abbr: "TRI", start: 1949, end: 1950 }
  ]
};

// Historical Team Data Configurations (Logo, colors)
const HISTORICAL_TEAMS_META = {
  "SEA": { name: "Seattle SuperSonics", logo: "🟢", primaryColor: "#006532", secondaryColor: "#F9AD1B" },
  "KCK": { name: "Kansas City Kings", logo: "👑", primaryColor: "#5A2D81", secondaryColor: "#63727A" },
  "WSB": { name: "Washington Bullets", logo: "🧙", primaryColor: "#002B5C", secondaryColor: "#E31837" },
  "VAN": { name: "Vancouver Grizzlies", logo: "🐻", primaryColor: "#008EA2", secondaryColor: "#C4CED4" },
  "NJN": { name: "New Jersey Nets", logo: "⬛", primaryColor: "#000000", secondaryColor: "#FFFFFF" },
  "NOH": { name: "New Orleans Hornets", logo: "⚜️", primaryColor: "#00788C", secondaryColor: "#F1B82D" },
  "NOK": { name: "NO/Oklahoma City Hornets", logo: "⚜️", primaryColor: "#00788C", secondaryColor: "#F1B82D" },
  "SDC": { name: "San Diego Clippers", logo: "⛵", primaryColor: "#C8102E", secondaryColor: "#1D428A" },
  "BUF": { name: "Buffalo Braves", logo: "⛵", primaryColor: "#008080", secondaryColor: "#000000" },
  "NOJ": { name: "New Orleans Jazz", logo: "🎷", primaryColor: "#002B5C", secondaryColor: "#00471B" },
  "CHH": { name: "Charlotte Hornets", logo: "🐝", primaryColor: "#00788C", secondaryColor: "#1D1160" }
};

function dbToStdAbbr(abbr) {
  if (abbr === 'BRK') return 'BKN';
  if (abbr === 'PHO') return 'PHX';
  if (abbr === 'CHO') return 'CHA';
  return abbr;
}

function stdToDbAbbr(abbr) {
  if (abbr === 'BKN') return 'BRK';
  if (abbr === 'PHX') return 'PHO';
  if (abbr === 'CHA') return 'CHO';
  return abbr;
}

function getModernEquivalent(abbr) {
  const map = {
    'SEA': 'OKC',
    'KCK': 'SAC', 'KCO': 'SAC', 'CIN': 'SAC', 'ROC': 'SAC',
    'WSB': 'WAS', 'CAP': 'WAS', 'BAL': 'WAS',
    'VAN': 'MEM',
    'NJN': 'BKN', 'NYN': 'BKN', 'BRK': 'BKN',
    'NOH': 'NOP', 'NOK': 'NOP',
    'SDC': 'LAC', 'BUF': 'LAC',
    'CHH': 'CHA', 'CHO': 'CHA',
    'SFW': 'GSW', 'PHW': 'GSW',
    'NOJ': 'UTA',
    'SDR': 'HOU',
    'FTW': 'DET',
    'SYR': 'PHI',
    'SLH': 'ATL', 'TRI': 'ATL',
    'PHO': 'PHX'
  };
  return map[abbr] || abbr;
}

// Resolve the correct historical team code depending on draft year
function getHistoricalTeamAbbr(modernAbbr, year) {
  const stdKey = dbToStdAbbr(modernAbbr);
  const ranges = FRANCHISE_MAPPING[stdKey];
  if (!ranges) {
    return stdToDbAbbr(stdKey);
  }
  for (const range of ranges) {
    if (year >= range.start && year <= range.end) {
      return stdToDbAbbr(range.abbr);
    }
  }
  return stdToDbAbbr(stdKey);
}

// Get all possible abbreviation candidates for a team in a given year
function getAbbreviationCandidates(specTeam, year) {
  if (!specTeam) return [];
  const stdKey = dbToStdAbbr(getModernEquivalent(dbToStdAbbr(specTeam)));
  if (stdKey === 'BKN') {
    return ['BKN', 'BRK', 'NJN'];
  }
  if (stdKey === 'CHA') {
    if (year && year < 2004) {
      return ['CHH', 'CHA', 'CHO'];
    }
    return ['CHA', 'CHO'];
  }
  if (stdKey === 'NOP') {
    return ['NOP', 'NOH', 'NOK'];
  }
  if (stdKey === 'PHX') {
    return ['PHX', 'PHO'];
  }
  if (stdKey === 'OKC') {
    return ['OKC', 'SEA'];
  }
  if (stdKey === 'MEM') {
    return ['MEM', 'VAN'];
  }
  
  // For other teams, resolve via FRANCHISE_MAPPING range
  let targetAbbr = stdKey;
  const ranges = FRANCHISE_MAPPING[stdKey];
  if (ranges && year) {
    for (const range of ranges) {
      if (year >= range.start && year <= range.end) {
        targetAbbr = range.abbr;
        break;
      }
    }
  }
  const dbTarget = stdToDbAbbr(targetAbbr);
  const stdTarget = dbToStdAbbr(targetAbbr);
  const result = new Set([stdTarget, dbTarget, targetAbbr]);
  return Array.from(result);
}

// Check if a player's team abbreviation matches target team abbreviation (and its variants) for a given year
function matchTeamAbbr(playerTeam, targetTeam, year) {
  if (!playerTeam || !targetTeam) return false;
  const candidates = getAbbreviationCandidates(targetTeam, year);
  const upperPlayer = playerTeam.toUpperCase();
  return candidates.some(c => c.toUpperCase() === upperPlayer);
}

// Generate room code (4-6 digits)
function generateRoomId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Save room snapshot to MongoDB Atlas for persistence
async function saveRoomToDB(roomId, room) {
  try {
    const db = await connectDB();
    const cleanRoom = {
      _id: String(roomId),
      settings: room.settings,
      players: room.players.map(p => ({
        socketId: p.socketId,
        name: p.name,
        roster: p.roster,
        isOwner: p.isOwner,
        isOnline: p.isOnline,
        uid: p.uid || null,
        rookieGamesPlayed: p.rookieGamesPlayed || 0
      })),
      draftOrder: room.draftOrder,
      draftIndex: room.draftIndex,
      draftedIds: room.draftedIds,
      currentTeam: room.currentTeam,
      blindPool: room.blindPool,
      phase: room.phase,
      roomState: room.roomState || 'LOBBY',
      currentTurnPlayerId: room.currentTurnPlayerId || null,
      turnExpiresAt: room.turnExpiresAt || null,
      evalResult: room.evalResult,
      ratings: room.ratings || null,
      dynamicGrid: room.dynamicGrid || null,
      sheetIndex: room.sheetIndex !== undefined ? room.sheetIndex : null,
      isPVE: room.isPVE || false,
      levelId: room.levelId || null,
      updatedAt: new Date()
    };
    await db.collection('active_rooms').updateOne(
      { _id: roomId },
      { $set: cleanRoom },
      { upsert: true }
    );
  } catch (err) {
    console.error(`❌ Error saving room ${roomId} to DB:`, err);
  }
}

// Load room state from DB (session recovery after crash/restart)
async function loadRoomFromDB(roomId) {
  try {
    const db = await connectDB();
    const doc = await db.collection('active_rooms').findOne({ _id: String(roomId) });
    if (!doc) return null;
    return {
      settings: doc.settings,
      players: doc.players,
      draftOrder: doc.draftOrder,
      draftIndex: doc.draftIndex,
      draftedIds: doc.draftedIds,
      currentTeam: doc.currentTeam,
      blindPool: doc.blindPool,
      phase: doc.phase,
      roomState: doc.roomState || 'LOBBY',
      currentTurnPlayerId: doc.currentTurnPlayerId || null,
      turnExpiresAt: doc.turnExpiresAt || null,
      evalResult: doc.evalResult,
      ratings: doc.ratings || null,
      dynamicGrid: doc.dynamicGrid || null,
      sheetIndex: doc.sheetIndex !== undefined ? doc.sheetIndex : null,
      isPVE: doc.isPVE || false,
      levelId: doc.levelId || null
    };
  } catch (err) {
    console.error(`❌ Error loading room ${roomId} from DB:`, err);
    return null;
  }
}

// Generate standard Snake Draft order (configurable rounds)
function generateSnakeDraftOrder(numPlayers, rounds = 5) {
  const order = [];
  for (let r = 0; r < rounds; r++) {
    if (r % 2 === 0) {
      for (let p = 0; p < numPlayers; p++) order.push(p);
    } else {
      for (let p = numPlayers - 1; p >= 0; p--) order.push(p);
    }
  }
  return order;
}

// Filter player list based on room configuration settings
async function getAvailablePlayersForRoom(room) {
  const allPlayers = await getYearPlayers(room.settings.year);
  const banned = room.bannedPlayerNames || [];
  return allPlayers.filter(p => {
    // Exclude drafted players
    if (room.draftedIds.includes(p.name)) return false;
    // Exclude room pre-banned players
    if (banned.includes(p.name)) return false;
    // Apply Star Bans
    if (room.settings.banAllStars && p.is_allstar) return false;
    // Apply Rookie Only filter
    if (room.settings.rookieOnly && !p.is_rookie) return false;
    return true;
  });
}

async function generateDynamic15UsdGrid(year, bannedPlayerNames = []) {
  const allPlayers = await getYearPlayers(year);
  const filteredPlayers = allPlayers.filter(p => !bannedPlayerNames.includes(p.name));
  
  const pools = {
    "PG": [],
    "SG": [],
    "SF": [],
    "PF": [],
    "C": []
  };
  
  filteredPlayers.forEach(p => {
    if (!p.position || !Array.isArray(p.position)) return;
    p.position.forEach(pos => {
      const upperPos = pos.toUpperCase();
      if (pools[upperPos]) {
        pools[upperPos].push(p);
      }
    });
  });
  
  const weights = {
    "PG": { pts: 1.0, ast: 1.8, trb: 0.5 },
    "SG": { pts: 1.3, ast: 1.0, trb: 0.7 },
    "SF": { pts: 1.1, ast: 0.9, trb: 1.0 },
    "PF": { pts: 1.0, ast: 0.7, trb: 1.3 },
    "C":  { pts: 0.9, ast: 0.5, trb: 1.8 }
  };
  
  const topPlayersByPosition = {};
  
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
    const pool = pools[pos];
    const w = weights[pos];
    
    const scoredPool = pool.map(p => {
      const score = (p.pts || 0) * w.pts + (p.ast || 0) * w.ast + (p.trb || 0) * w.trb;
      return { ...p, score };
    });
    
    scoredPool.sort((a, b) => b.score - a.score);
    topPlayersByPosition[pos] = scoredPool.slice(0, 5);
  }
  
  const grid = [];
  const positionsOrder = ["PG", "SG", "SF", "PF", "C"];
  
  for (let i = 0; i < 5; i++) {
    const price = 5 - i;
    for (const pos of positionsOrder) {
      const player = topPlayersByPosition[pos][i];
      if (player) {
        grid.push({
          name: player.name,
          pts: player.pts,
          trb: player.trb,
          ast: player.ast,
          positions: player.position,
          team: player.team,
          is_allstar: !!player.is_allstar,
          is_rookie: !!player.is_rookie,
          price: price
        });
      } else {
        grid.push({
          name: `N/A Player ${pos}`,
          pts: 0,
          trb: 0,
          ast: 0,
          positions: [pos],
          team: "FA",
          is_allstar: false,
          is_rookie: false,
          price: price
        });
      }
    }
  }
  
  return grid;
}

const MODERN_TEAMS = [
  { name: "Los Angeles Lakers",       abbreviation: "LAL", primaryColor: "#552583", secondaryColor: "#FDB927", logo: "🟣" },
  { name: "Golden State Warriors",    abbreviation: "GSW", primaryColor: "#1D428A", secondaryColor: "#FFC72C", logo: "🔵" },
  { name: "Boston Celtics",           abbreviation: "BOS", primaryColor: "#007A33", secondaryColor: "#BA9653", logo: "🟢" },
  { name: "Chicago Bulls",            abbreviation: "CHI", primaryColor: "#CE1141", secondaryColor: "#000000", logo: "🔴" },
  { name: "Miami Heat",               abbreviation: "MIA", primaryColor: "#98002E", secondaryColor: "#F9A01B", logo: "🔥" },
  { name: "Brooklyn Nets",            abbreviation: "BKN", primaryColor: "#000000", secondaryColor: "#FFFFFF", logo: "⬛" },
  { name: "Milwaukee Bucks",          abbreviation: "MIL", primaryColor: "#00471B", secondaryColor: "#EEE1C6", logo: "🦌" },
  { name: "Philadelphia 76ers",       abbreviation: "PHI", primaryColor: "#006BB6", secondaryColor: "#ED174C", logo: "🔔" },
  { name: "Phoenix Suns",             abbreviation: "PHX", primaryColor: "#1D1160", secondaryColor: "#E56020", logo: "☀️" },
  { name: "Dallas Mavericks",         abbreviation: "DAL", primaryColor: "#00538C", secondaryColor: "#002B5E", logo: "🐴" },
  { name: "Denver Nuggets",           abbreviation: "DEN", primaryColor: "#0E2240", secondaryColor: "#FEC524", logo: "⛏️" },
  { name: "Cleveland Cavaliers",      abbreviation: "CLE", primaryColor: "#860038", secondaryColor: "#FDBB30", logo: "🗡️" },
  { name: "Toronto Raptors",          abbreviation: "TOR", primaryColor: "#CE1141", secondaryColor: "#000000", logo: "🦖" },
  { name: "San Antonio Spurs",        abbreviation: "SAS", primaryColor: "#C4CED4", secondaryColor: "#000000", logo: "⭐" },
  { name: "Oklahoma City Thunder",    abbreviation: "OKC", primaryColor: "#007AC1", secondaryColor: "#EF6020", logo: "⚡" },
  { name: "Houston Rockets",          abbreviation: "HOU", primaryColor: "#CE1141", secondaryColor: "#000000", logo: "🚀" },
  { name: "Atlanta Hawks",            abbreviation: "ATL", primaryColor: "#E03A3E", secondaryColor: "#C1D32F", logo: "🦅" },
  { name: "New York Knicks",          abbreviation: "NYK", primaryColor: "#006BB6", secondaryColor: "#F58426", logo: "🗽" },
  { name: "Memphis Grizzlies",        abbreviation: "MEM", primaryColor: "#5D76A9", secondaryColor: "#12173F", logo: "🐻" },
  { name: "New Orleans Pelicans",     abbreviation: "NOP", primaryColor: "#0C2340", secondaryColor: "#C8102E", logo: "⚜️" },
  { name: "Minnesota Timberwolves",   abbreviation: "MIN", primaryColor: "#0C2340", secondaryColor: "#236192", logo: "🐺" },
  { name: "Sacramento Kings",         abbreviation: "SAC", primaryColor: "#5A2D81", secondaryColor: "#63727A", logo: "👑" },
  { name: "Portland Trail Blazers",   abbreviation: "POR", primaryColor: "#E03A3E", secondaryColor: "#000000", logo: "🔥" },
  { name: "Indiana Pacers",           abbreviation: "IND", primaryColor: "#002D62", secondaryColor: "#FDBB30", logo: "🏎️" },
  { name: "Utah Jazz",                abbreviation: "UTA", primaryColor: "#002B5C", secondaryColor: "#00471B", logo: "🎷" },
  { name: "Charlotte Hornets",        abbreviation: "CHA", primaryColor: "#1D1160", secondaryColor: "#00788C", logo: "🐝" },
  { name: "Washington Wizards",       abbreviation: "WAS", primaryColor: "#002B5C", secondaryColor: "#E31837", logo: "🧙" },
  { name: "Detroit Pistons",          abbreviation: "DET", primaryColor: "#C8102E", secondaryColor: "#1D42BA", logo: "🔧" },
  { name: "Orlando Magic",            abbreviation: "ORL", primaryColor: "#0077C0", secondaryColor: "#C4CED4", logo: "✨" },
  { name: "Los Angeles Clippers",     abbreviation: "LAC", primaryColor: "#C8102E", secondaryColor: "#1D428A", logo: "⛵" }
];

const franchiseLegendsCache = new Map();

async function getFranchiseLegendsFromDB(modernTeamAbbr) {
  if (franchiseLegendsCache.has(modernTeamAbbr)) {
    return franchiseLegendsCache.get(modernTeamAbbr);
  }

  console.log(`🔍 Building franchiseLegendsCache for ${modernTeamAbbr} across all 50 years...`);
  const playerMap = new Map();

  const years = Array.from({ length: 50 }, (_, i) => 1977 + i);
  const allYearsPlayers = await Promise.all(years.map(y => getYearPlayers(y)));

  years.forEach((y, idx) => {
    const players = allYearsPlayers[idx];
    const targetAbbr = getHistoricalTeamAbbr(modernTeamAbbr, y);
    
    const teamAllStars = players.filter(p => p.team === targetAbbr && p.is_allstar === true);
    
    for (const p of teamAllStars) {
      const score = (p.pts || 0) + (p.ast || 0) + (p.trb || 0);
      const existing = playerMap.get(p.name);
      
      if (!existing || score > existing.score) {
        playerMap.set(p.name, {
          name: p.name,
          pts: p.pts,
          trb: p.trb,
          ast: p.ast,
          position: p.position,
          team: p.team,
          is_allstar: true,
          is_rookie: !!p.is_rookie,
          is_legend: true,
          year: y,
          score: score
        });
      }
    }
  });

  const result = Array.from(playerMap.values()).map(p => {
    const { score, ...rest } = p;
    return rest;
  });

  result.sort((a, b) => {
    const scoreA = (a.pts || 0) + (a.ast || 0) + (a.trb || 0);
    const scoreB = (b.pts || 0) + (b.ast || 0) + (b.trb || 0);
    return scoreB - scoreA;
  });

  franchiseLegendsCache.set(modernTeamAbbr, result);
  console.log(`💾 Cached ${result.length} franchise legends for ${modernTeamAbbr}`);
  return result;
}

function getActiveRooms() {
  return activeRooms;
}

module.exports = {
  generateRoomId,
  saveRoomToDB,
  loadRoomFromDB,
  generateSnakeDraftOrder,
  getAvailablePlayersForRoom,
  getHistoricalTeamAbbr,
  getAbbreviationCandidates,
  matchTeamAbbr,
  HISTORICAL_TEAMS_META,
  getActiveRooms,
  activeRooms,
  generateDynamic15UsdGrid,
  MODERN_TEAMS,
  getFranchiseLegendsFromDB,
  getModernEquivalent
};
