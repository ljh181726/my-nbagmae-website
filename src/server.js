const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const {
  connectDB,
  getUserByUid,
  findOrCreateUser,
  performCheckIn,
  incrementRookieGames,
  updatePVEProgress
} = require('./db');
const { PVE_LEVELS } = require('./pve_levels');
const { getYearPlayers } = require('./cache');
const { queueEvaluation } = require('./gemini');
const {
  generateRoomId,
  saveRoomToDB,
  loadRoomFromDB,
  generateSnakeDraftOrder,
  getAvailablePlayersForRoom,
  getHistoricalTeamAbbr,
  HISTORICAL_TEAMS_META,
  activeRooms,
  generateDynamic15UsdGrid,
  MODERN_TEAMS,
  getFranchiseLegendsFromDB,
  getModernEquivalent
} = require('./lobby');

const { getLegendsForTeam } = require('./legends_pool');

// Salary Cap lookup
const SALARY_CAPS = {
  1977: 2000000,   1978: 2100000,   1979: 2200000,   1980: 2300000,
  1981: 2400000,   1982: 2500000,   1983: 2600000,   1984: 2700000,
  1985: 3600000,   1986: 4233000,   1987: 4945000,   1988: 6164000,
  1989: 7232000,   1990: 9802000,   1991: 11871000,  1992: 12500000,
  1993: 14000000,  1994: 15175000,  1995: 15964000,  1996: 23000000,
  1997: 24363000,  1998: 26900000,  1999: 30000000,  2000: 34000000,
  2001: 35500000,  2002: 42500000,  2003: 40271000,  2004: 43840000,
  2005: 49500000,  2006: 49500000,  2007: 53135000,  2008: 55630000,
  2009: 58680000,  2010: 57700000,  2011: 58044000,  2012: 58044000,
  2013: 58044000,  2014: 58679000,  2015: 63065000,  2016: 70000000,
  2017: 94143000,  2018: 99093000,  2019: 101869000, 2020: 109140000,
  2021: 109140000, 2022: 112414000, 2023: 123655000, 2024: 136021000,
  2025: 140588000, 2026: 154647000
};

const app = express();
const port = process.env.PORT || 7860;

// Enable CORS for Hugging Face Space iframe embedding
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

// Serve static client files from root directory
app.use(express.static(path.join(__dirname, '..')));

// Express Routes
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.get('/api/config', (req, res) => {
  res.json({
    hasGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

// Load players_cache.json on server startup
let playersCacheData = null;
try {
  const cachePath = path.join(__dirname, '../players_cache.json');
  if (fs.existsSync(cachePath)) {
    const raw = fs.readFileSync(cachePath, 'utf8');
    playersCacheData = JSON.parse(raw);
    console.log('✅ Loaded players_cache.json for jersey number lookup');
  }
} catch (err) {
  console.error('⚠️ Failed to load players_cache.json:', err);
}

// Helper: Resolve player jersey number
function getPlayerJerseyNumber(playerName, teamAbbr) {
  if (playersCacheData && playersCacheData.data && playersCacheData.data.playersByTeam) {
    const teamPlayers = playersCacheData.data.playersByTeam[teamAbbr] || [];
    const found = teamPlayers.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (found && found.jerseyNumber) {
      return found.jerseyNumber;
    }
  }

  // Custom historical legends list
  const legendsJerseys = {
    "Michael Jordan": { "CHI": "23" },
    "Magic Johnson": { "LAL": "32" },
    "Larry Bird": { "BOS": "33" },
    "Kobe Bryant": { "LAL": "24" },
    "Shaquille O'Neal": { "LAL": "34", "ORL": "32", "MIA": "32" },
    "LeBron James": { "LAL": "23", "CLE": "23", "MIA": "6" },
    "Stephen Curry": { "GSW": "30" },
    "Kevin Durant": { "PHX": "35", "GSW": "35", "BKN": "7", "OKC": "35" },
    "Giannis Antetokounmpo": { "MIL": "34" },
    "Nikola Jokic": { "DEN": "15" },
    "Joel Embiid": { "PHI": "21" },
    "Luka Doncic": { "DAL": "77", "LAL": "77" },
    "Jayson Tatum": { "BOS": "0" },
    "Jaylen Brown": { "BOS": "7" },
    "Allen Iverson": { "PHI": "3" },
    "Yao Ming": { "HOU": "11" },
    "Tim Duncan": { "SAS": "21" },
    "Dwyane Wade": { "MIA": "3" },
    "Dirk Nowitzki": { "DAL": "41" },
    "Hakeem Olajuwon": { "HOU": "34" },
    "Kareem Abdul-Jabbar": { "LAL": "33", "MIL": "33" },
    "Bill Russell": { "BOS": "6" },
    "Wilt Chamberlain": { "PHI": "13", "LAL": "13" }
  };

  const nameMatch = Object.keys(legendsJerseys).find(k => k.toLowerCase() === playerName.toLowerCase());
  if (nameMatch) {
    const teamsObj = legendsJerseys[nameMatch];
    if (teamsObj[teamAbbr]) {
      return teamsObj[teamAbbr];
    }
    return Object.values(teamsObj)[0];
  }

  // Deterministic fallback string hash
  const cleanName = playerName.toLowerCase().replace(/[^a-z]/g, '');
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = (hash * 31 + cleanName.charCodeAt(i)) % 100;
  }
  return (hash % 99).toString();
}

// Helper: Find player by team & jersey number
function lookupPlayerByTeamAndJersey(teamAbbr, jersey) {
  if (playersCacheData && playersCacheData.data && playersCacheData.data.playersByTeam) {
    const teamPlayers = playersCacheData.data.playersByTeam[teamAbbr] || [];
    const found = teamPlayers.find(p => p.jerseyNumber === jersey);
    if (found) {
      const isAllStar = found.allStarCount > 0 || found.is_allstar === true;
      return { name: found.name, isAllStar };
    }
  }

  const legendsList = [
    { name: "Michael Jordan", team: "CHI", jersey: "23", isAllStar: true },
    { name: "Magic Johnson", team: "LAL", jersey: "32", isAllStar: true },
    { name: "Larry Bird", team: "BOS", jersey: "33", isAllStar: true },
    { name: "Kobe Bryant", team: "LAL", jersey: "24", isAllStar: true },
    { name: "Kobe Bryant", team: "LAL", jersey: "8", isAllStar: true },
    { name: "Shaquille O'Neal", team: "LAL", jersey: "34", isAllStar: true },
    { name: "Shaquille O'Neal", team: "ORL", jersey: "32", isAllStar: true },
    { name: "Shaquille O'Neal", team: "MIA", jersey: "32", isAllStar: true },
    { name: "LeBron James", team: "LAL", jersey: "23", isAllStar: true },
    { name: "LeBron James", team: "CLE", jersey: "23", isAllStar: true },
    { name: "LeBron James", team: "MIA", jersey: "6", isAllStar: true },
    { name: "Stephen Curry", team: "GSW", jersey: "30", isAllStar: true },
    { name: "Kevin Durant", team: "PHX", jersey: "35", isAllStar: true },
    { name: "Kevin Durant", team: "GSW", jersey: "35", isAllStar: true },
    { name: "Kevin Durant", team: "BKN", jersey: "7", isAllStar: true },
    { name: "Kevin Durant", team: "OKC", jersey: "35", isAllStar: true },
    { name: "Giannis Antetokounmpo", team: "MIL", jersey: "34", isAllStar: true },
    { name: "Nikola Jokic", team: "DEN", jersey: "15", isAllStar: true },
    { name: "Joel Embiid", team: "PHI", jersey: "21", isAllStar: true },
    { name: "Luka Doncic", team: "DAL", jersey: "77", isAllStar: true },
    { name: "Luka Doncic", team: "LAL", jersey: "77", isAllStar: true },
    { name: "Jayson Tatum", team: "BOS", jersey: "0", isAllStar: true },
    { name: "Jaylen Brown", team: "BOS", jersey: "7", isAllStar: true },
    { name: "Allen Iverson", team: "PHI", jersey: "3", isAllStar: true },
    { name: "Yao Ming", team: "HOU", jersey: "11", isAllStar: true },
    { name: "Tim Duncan", team: "SAS", jersey: "21", isAllStar: true },
    { name: "Dwyane Wade", team: "MIA", jersey: "3", isAllStar: true },
    { name: "Dirk Nowitzki", team: "DAL", jersey: "41", isAllStar: true },
    { name: "Hakeem Olajuwon", team: "HOU", jersey: "34", isAllStar: true },
    { name: "Kareem Abdul-Jabbar", team: "LAL", jersey: "33", isAllStar: true },
    { name: "Kareem Abdul-Jabbar", team: "MIL", jersey: "33", isAllStar: true },
    { name: "Bill Russell", team: "BOS", jersey: "6", isAllStar: true },
    { name: "Wilt Chamberlain", team: "PHI", jersey: "13", isAllStar: true },
    { name: "Wilt Chamberlain", team: "LAL", jersey: "13", isAllStar: true }
  ];
  
  const leg = legendsList.find(l => l.team === teamAbbr && l.jersey === jersey);
  if (leg) {
    return { name: leg.name, isAllStar: leg.isAllStar };
  }

  return { name: `${teamAbbr} #${jersey} 球員`, isAllStar: false };
}

// Helper: Generate HOF Coach critique for pre-banned list updates
function generateCoachCritiqueForPrebans(preBannedPlayers) {
  let starsCount = 0;
  let benchesCount = 0;
  let starsNames = [];
  let benchesNames = [];
  
  for (const pb of preBannedPlayers) {
    if (!pb.team || !pb.jersey) continue;
    const jerseyNum = pb.jersey.replace('#', '');
    const playerInfo = lookupPlayerByTeamAndJersey(pb.team, jerseyNum);
    
    if (playerInfo.isAllStar) {
      starsCount++;
      starsNames.push(playerInfo.name);
    } else {
      benchesCount++;
      benchesNames.push(playerInfo.name || `${pb.team} #${jerseyNum}`);
    }
  }
  
  if (starsCount === 0 && benchesCount === 0) {
    return "你一個人都沒禁用？是準備空手套白狼，還是對自己的垃圾防守太有自信了？別怪我沒警告你，上了場被射穿了可別哭鼻子！";
  }
  
  if (starsCount > 0 && benchesCount === 0) {
    const namesStr = starsNames.join('、');
    return `算你聰明，把 ${namesStr} 禁掉，不然你今天又要被射穿了。防守這些怪物確實得動動腦子。`;
  }
  
  if (benchesCount > 0 && starsCount === 0) {
    const namesStr = benchesNames.join('、');
    return `你竟然花了虛擬幣去禁一個像 ${namesStr} 這樣的板凳角色？看來你的腦袋跟你的防守一樣需要修理。你是在逗我笑嗎？`;
  }
  
  const starsStr = starsNames.join('、');
  const benchesStr = benchesNames.join('、');
  return `禁用 ${starsStr} 還算有點戰術眼光，但你禁用 ${benchesStr} 是什麼操作？難道你怕他們坐在板凳上把對方的開水喝光嗎？`;
}

// Process room pre-bans when draft begins
async function processRoomPreBans(room) {
  room.bannedPlayerNames = room.bannedPlayerNames || [];
  room.preBanResults = room.preBanResults || {};

  const db = await connectDB();
  const collection = db.collection('users');
  const year = room.settings.year || 2026;

  for (const player of room.players) {
    if (!player.uid || player.isCPU) continue;

    const user = await collection.findOne({ uid: player.uid });
    if (!user) continue;

    const preBans = user.pre_banned_players || [];
    if (preBans.length === 0) continue;

    let balance = user.virtual_currency || 0;
    const candidates = [];

    for (const pb of preBans) {
      if (!pb.team || !pb.jersey) continue;

      const targetTeamAbbr = getHistoricalTeamAbbr(pb.team, year);
      const jerseyNum = pb.jersey.replace('#', '');

      // Check current year pool
      const allPlayers = await getYearPlayers(year);
      const match = allPlayers.find(p => {
        const pTeam = p.team || '';
        return pTeam.toUpperCase() === targetTeamAbbr.toUpperCase() &&
               getPlayerJerseyNumber(p.name, p.team) === jerseyNum;
      });

      if (match) {
        const cost = match.is_allstar ? 2 : 1;
        candidates.push({
          name: match.name,
          cost,
          isAllStar: match.is_allstar,
          team: pb.team,
          jersey: pb.jersey
        });
      } else {
        const lookup = lookupPlayerByTeamAndJersey(pb.team, jerseyNum);
        if (lookup.name) {
          const cost = lookup.isAllStar ? 2 : 1;
          candidates.push({
            name: lookup.name,
            cost,
            isAllStar: lookup.isAllStar,
            team: pb.team,
            jersey: pb.jersey
          });
        }
      }
    }

    if (candidates.length === 0) continue;

    // Prioritize All-Stars (cost 2) over general players (cost 1)
    candidates.sort((a, b) => b.cost - a.cost);

    const successfulBans = [];
    const failedBans = [];
    let spent = 0;

    for (const cand of candidates) {
      if (balance >= cand.cost) {
        balance -= cand.cost;
        spent += cand.cost;
        successfulBans.push(cand);
        if (!room.bannedPlayerNames.includes(cand.name)) {
          room.bannedPlayerNames.push(cand.name);
        }
      } else {
        failedBans.push(cand);
      }
    }

    // Update user balance in database
    await collection.updateOne(
      { uid: player.uid },
      { $set: { virtual_currency: balance } }
    );

    // Update Coach Critique on failure due to insufficient funds
    if (failedBans.length > 0) {
      const roasts = [
        "連全明星的禁用費都付不起？看來你除了球技不及格，連錢包都很骨感，還不快滾去多刷幾場 PVE 賺錢！",
        "想要預防針卻買不起？錢包空空還想學人家玩禁用。老老實實去 PVE 模式搬磚刷幣吧，別在這裡丟人現眼了！",
        "沒錢還敢設定預先禁用？當這裡是慈善機構？回去看看你的餘額，連一個一般球員的禁用費都快出不起了！"
      ];
      const selectedRoast = roasts[Math.floor(Math.random() * roasts.length)];
      await collection.updateOne(
        { uid: player.uid },
        { $set: { coach_critique: selectedRoast } }
      );
    }

    room.preBanResults[player.name] = {
      successful: successfulBans.map(b => b.name),
      failed: failedBans.map(b => b.name),
      spent,
      balance
    };
  }
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { uid, name, avatar, provider } = req.body;
    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }
    const user = await findOrCreateUser({ uid, name, avatar, provider });
    res.json({ user });
  } catch (err) {
    console.error('Error in /api/auth/login:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/preban', async (req, res) => {
  try {
    const { uid, pre_banned_players } = req.body;
    if (!uid || !Array.isArray(pre_banned_players) || pre_banned_players.length !== 3) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    const validated = [];
    const teamRegex = /^[A-Za-z]{3}$/;
    const jerseyRegex = /^#\d+$/;
    
    for (const pb of pre_banned_players) {
      if (!pb.team && !pb.jersey) {
        validated.push({ team: '', jersey: '' });
      } else {
        const teamNormalized = pb.team.trim().toUpperCase();
        const jerseyNormalized = pb.jersey.trim();
        
        if (!teamRegex.test(teamNormalized) || !jerseyRegex.test(jerseyNormalized)) {
          return res.status(400).json({ error: '輸入格式有誤！球隊必須為三字英文代碼 (如 BOS)，背號必須包含井字號 (如 #0)。' });
        }
        
        validated.push({ team: teamNormalized, jersey: jerseyNormalized });
      }
    }
    
    const db = await connectDB();
    const collection = db.collection('users');
    const user = await collection.findOne({ uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const critique = generateCoachCritiqueForPrebans(validated);
    
    await collection.updateOne(
      { uid },
      { 
        $set: { 
          pre_banned_players: validated,
          coach_critique: critique
        } 
      }
    );
    
    const updatedUser = await collection.findOne({ uid });
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('Error in /api/users/preban:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/checkin', async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }
    const checkinResult = await performCheckIn(uid);
    res.json(checkinResult);
  } catch (err) {
    console.error('Error in /api/users/checkin:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/api/pve/levels', (req, res) => {
  res.json({ levels: PVE_LEVELS });
});

app.post('/api/users/pve/unlock', async (req, res) => {
  try {
    const { uid, level } = req.body;
    if (!uid || !level) {
      return res.status(400).json({ error: 'Missing uid or level' });
    }
    const result = await updatePVEProgress(uid, level);
    res.json({ success: true, user: result.user, firstClear: result.firstClear, coinsAwarded: result.coinsAwarded });
  } catch (err) {
    console.error('Error in /api/users/pve/unlock:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const server = http.createServer(app);

// Configure Socket.io with optimized heartbeats to defend against HF Spaces network timeouts
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 5000,  // Check connection every 5s
  pingTimeout: 10000   // Disconnect if no response after 10s
});

// Helper: Broadcast room state update to all room members
function broadcastRoomUpdate(roomId) {
  const room = activeRooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('room_update', room);
}

const vm = require('vm');

let ACTIVE_5X5_GRIDS = [];
let LEGENDS_5X5_GRIDS = [];

try {
  const dataJsPath = path.join(__dirname, '../data.js');
  if (fs.existsSync(dataJsPath)) {
    const dataJsContent = fs.readFileSync(dataJsPath, 'utf8');
    const code = dataJsContent.replace(/export\s+/g, '');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    ACTIVE_5X5_GRIDS = sandbox.ACTIVE_5X5_GRIDS || [];
    LEGENDS_5X5_GRIDS = sandbox.LEGENDS_5X5_GRIDS || [];
  }
} catch (err) {
  console.error('⚠️ Failed to load 5x5 grids from data.js:', err);
}

const roomTimers = new Map();

// Helper: Start/Reset the 30-second turn timer for draft phase
function startRoomTurnTimer(roomId) {
  if (roomTimers.has(roomId)) {
    clearTimeout(roomTimers.get(roomId));
    roomTimers.delete(roomId);
  }

  const room = activeRooms.get(roomId);
  if (!room || room.phase === 'lobby' || room.phase === 'eval') return;

  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  let turnDuration = 30000;
  
  if (activePlayer && activePlayer.uid && activePlayer.rookieGamesPlayed < 5) {
    turnDuration = 60000;
    console.log(`⏳ Rookie timer active for ${activePlayer.name}: 60 seconds`);
  }

  // Set expiration time
  room.turnExpiresAt = Date.now() + turnDuration;

  // Setup timeout callback
  const timer = setTimeout(async () => {
    try {
      console.log(`🚨 AFK timeout for Room ${roomId}. Running penalty draft...`);
      await triggerAFKPenalty(roomId);
    } catch (err) {
      console.error(`Error in AFK Penalty for Room ${roomId}:`, err);
    }
  }, turnDuration);

  roomTimers.set(roomId, timer);
}

// Helper: Clear timer
function clearRoomTurnTimer(roomId) {
  if (roomTimers.has(roomId)) {
    clearTimeout(roomTimers.get(roomId));
    roomTimers.delete(roomId);
  }
}

// Helper: Calculate ratings (Offense, Defense, Overall)
function calcRatings(roster) {
  if (!roster || roster.length === 0) return { offense: 0, defense: 0, overall: 0 };

  const n = roster.length;
  
  // Offense: PTS, AST are primary. All-Star bonus.
  const totalPts = roster.reduce((s, p) => s + (p.pts || 0), 0) / n;
  const totalAst = roster.reduce((s, p) => s + (p.ast || 0), 0) / n;
  const allStarBonus = roster.filter(p => p.is_allstar).length * 2;
  const offenseRaw = (totalPts / 30) * 70 + (totalAst / 8) * 20 + allStarBonus;
  const offense = Math.min(100, Math.max(30, Math.round(offenseRaw)));

  // Defense: TRB is primary. Guard positions get deflection bonus from AST and partial rebounds.
  const playerDefScores = roster.map(p => {
    const isBig = p.position && (p.position.includes('C') || p.position.includes('PF'));
    const isPerimeter = p.position && (p.position.includes('PG') || p.position.includes('SG'));
    
    let base = 50; // base defensive rating
    if (isBig) {
      base += (p.trb || 0) * 4.5;
    } else if (isPerimeter) {
      base += (p.ast || 0) * 2.5 + (p.trb || 0) * 2.0;
    } else { // SF or others
      base += (p.trb || 0) * 3.0 + (p.ast || 0) * 1.5;
    }
    
    if (p.is_allstar) base += 5;
    return Math.min(99, Math.max(40, base));
  });
  
  const defenseRaw = playerDefScores.reduce((s, val) => s + val, 0) / n;
  const defense = Math.min(100, Math.max(30, Math.round(defenseRaw)));

  // Overall:
  // Chemistry: position balance
  const positionsRepresented = new Set();
  roster.forEach(p => {
    if (p.position) {
      p.position.forEach(pos => positionsRepresented.add(pos));
    }
  });
  const balanceBonus = Math.min(10, positionsRepresented.size * 2);

  // All-star chemistry bonus
  const allStarCount = roster.filter(p => p.is_allstar).length;
  const chemistryBonus = Math.min(10, allStarCount * 2);

  const overallRaw = (offense * 0.55 + defense * 0.40) + balanceBonus + chemistryBonus;
  const overall = Math.min(100, Math.max(30, Math.round(overallRaw)));

  return { offense, defense, overall };
}

// Helper: Complete draft phase and transition to evaluation
async function completeDraft(room) {
  room.phase = 'eval';
  room.roomState = 'GAME_OVER';
  
  if (room.isPVE) {
    const levelConfig = PVE_LEVELS[room.levelId - 1];
    if (levelConfig) {
      const cpuPlayer = {
        socketId: 'cpu_bot',
        name: `電腦隊伍 (${levelConfig.cpuTeamName})`,
        roster: levelConfig.cpuRoster,
        isOwner: false,
        isOnline: true,
        isCPU: true
      };
      if (!room.players.some(p => p.socketId === 'cpu_bot')) {
        room.players.push(cpuPlayer);
      }
    }
  }

  // Compute ratings for all players
  room.ratings = {};
  room.players.forEach(p => {
    room.ratings[p.name] = calcRatings(p.roster);
  });

  // Increment rookieGamesPlayed for human players, and handle PVE progression
  try {
    for (const p of room.players) {
      if (p.uid && !p.isCPU) {
        await incrementRookieGames(p.uid);
      }
    }

    if (room.isPVE) {
      const player = room.players.find(p => p.socketId !== 'cpu_bot');
      const cpu = room.players.find(p => p.socketId === 'cpu_bot');
      if (player && cpu) {
        const playerOverall = room.ratings[player.name].overall;
        const cpuOverall = room.ratings[cpu.name].overall;
        room.pveWin = playerOverall > cpuOverall;
        
        if (room.pveWin) {
          console.log(`🏆 Player won PVE level ${room.levelId}! Unlocking next level...`);
          if (player.uid) {
            const dbResult = await updatePVEProgress(player.uid, room.levelId + 1);
            if (dbResult && dbResult.success) {
              if (dbResult.firstClear) {
                room.pveFirstClearAward = {
                  clearedLevel: dbResult.clearedLevel,
                  coinsAwarded: dbResult.coinsAwarded
                };
              }
              // Send the updated user back to the client
              io.to(player.socketId).emit('user_update', dbResult.user);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error updating stats/progress on draft completion:', err);
  }
  
  console.log(`🏁 Draft completed for room ${room.id}. Entering evaluation...`);
  clearRoomTurnTimer(room.id);
}

// Helper: Trigger AFK Penalty Auto-Draft
async function triggerAFKPenalty(roomId) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  if (!activePlayer) return;

  const mode = room.settings.mode;
  let selectedPlayer = null;
  let teamLogo = '🏀';
  let teamName = '';

  // 1. Determine selection based on mode
  if (mode === '15usd' || mode === 'legend_15usd') {
    // For 15usd modes, pick any player from grid that is within price limit and not drafted
    let availableGridPlayers = [];
    if (room.dynamicGrid) {
      availableGridPlayers = room.dynamicGrid;
    } else {
      const gridsPool = mode === 'legend_15usd' ? LEGENDS_5X5_GRIDS : ACTIVE_5X5_GRIDS;
      if (room.sheetIndex !== null && gridsPool && gridsPool[room.sheetIndex]) {
        availableGridPlayers = gridsPool[room.sheetIndex];
      }
    }
    
    const remainingPicks = 5 - activePlayer.roster.length;
    const spent = activePlayer.roster.reduce((sum, p) => sum + (p.salary || p.price || 0), 0);
    const remainingBudget = 15 - spent;
    const maxAffordable = remainingBudget - (remainingPicks - 1);
    
    if (availableGridPlayers && availableGridPlayers.length > 0) {
      const affordableCount = availableGridPlayers.filter(p => !room.draftedIds.includes(p.name) && p.price <= maxAffordable).length;
      const isSafetyNetActive = (affordableCount < remainingPicks);

      let candidates = [];
      if (isSafetyNetActive) {
        candidates = availableGridPlayers.filter(p => !room.draftedIds.includes(p.name));
      } else {
        candidates = availableGridPlayers.filter(p => !room.draftedIds.includes(p.name) && p.price <= maxAffordable);
      }

      // Constraints
      const rookieFloor = room.settings.rookieFloor || 0;
      const currentRookies = activePlayer.roster.filter(p => p.is_rookie).length;
      const rookieDeficit = rookieFloor - currentRookies;
      const mustPickRookie = rookieDeficit > 0 && remainingPicks <= rookieDeficit;

      const allStarCap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
      const currentAllStars = activePlayer.roster.filter(p => p.is_allstar).length;
      const cannotPickAllStar = currentAllStars >= allStarCap;

      let filtered = candidates;
      if (mustPickRookie) {
        filtered = filtered.filter(p => p.is_rookie);
      }
      if (cannotPickAllStar) {
        filtered = filtered.filter(p => !p.is_allstar);
      }

      if (filtered.length > 0) candidates = filtered;

      let penaltyCandidates = candidates.filter(p => !p.is_allstar);
      if (penaltyCandidates.length === 0) penaltyCandidates = candidates;
      penaltyCandidates.sort((a, b) => (a.pts || 0) - (b.pts || 0));

      if (penaltyCandidates.length > 0) {
        selectedPlayer = { ...penaltyCandidates[0] };
        if (isSafetyNetActive) {
          selectedPlayer.price = 1;
          selectedPlayer.salary = 1;
        }
      }
    }
  } else if (mode === 'blind') {
    // For blind mode, pick the worst card from blindPool
    if (room.blindPool && room.blindPool.length > 0) {
      let candidates = room.blindPool.filter(p => !room.draftedIds.includes(p.realName));
      let penaltyCandidates = candidates.filter(p => !p.is_allstar);
      if (penaltyCandidates.length === 0) penaltyCandidates = candidates;
      penaltyCandidates.sort((a, b) => (a.pts || 0) - (b.pts || 0));
      if (penaltyCandidates.length > 0) {
        const candidate = penaltyCandidates[0];
        selectedPlayer = {
          name: candidate.realName,
          team: candidate.realTeam,
          pts: candidate.pts,
          trb: candidate.trb,
          ast: candidate.ast,
          position: candidate.position,
          salary: candidate.salary,
          is_allstar: candidate.is_allstar,
          is_rookie: candidate.is_rookie,
          year: candidate.realYear,
          is_blind: true,
          blindId: candidate.blindId
        };
      }
    }
  } else {
    // Wheel-based modes (wheel, salary_cap, salary_cap_legend, etc.)
    let rolledTeam = room.currentTeam;
    
    if (!rolledTeam && room.availableTeams && room.availableTeams.length > 0) {
      const idx = Math.floor(Math.random() * room.availableTeams.length);
      rolledTeam = room.availableTeams[idx];
      room.currentTeam = rolledTeam;
    }

    if (rolledTeam) {
      teamName = rolledTeam.name;
      teamLogo = rolledTeam.logo;

      // Fetch all eligible players for this team
      let pool = [];
      if (mode === 'legend_wheel') {
        const legends = await getFranchiseLegendsFromDB(rolledTeam.abbreviation);
        pool = legends;
      } else if (mode === 'salary_cap_legend') {
        const yearPlayers = await getYearPlayers(room.settings.year);
        const targetAbbr = getHistoricalTeamAbbr(rolledTeam.abbreviation, room.settings.year);
        const teamYearPlayers = yearPlayers.filter(p => p.team === targetAbbr);
        const legends = await getFranchiseLegendsFromDB(rolledTeam.abbreviation);
        pool = [...teamYearPlayers, ...legends];
      } else {
        const allPlayers = await getYearPlayers(room.settings.year);
        const targetAbbr = getHistoricalTeamAbbr(rolledTeam.abbreviation, room.settings.year);
        pool = allPlayers.filter(p => p.team === targetAbbr);
      }

      // Filter drafted players and active constraints
      let available = pool.filter(p => {
        if (room.draftedIds.includes(p.name)) return false;
        if (room.settings.banAllStars && p.is_allstar) return false;
        if (room.settings.rookieOnly && !p.is_rookie) return false;
        return true;
      });

      // Special Salary Cap Modes: filter players within remaining salary cap!
      if (mode.includes('salary_cap')) {
        const totalSalaryCap = SALARY_CAPS[room.settings.year] || 154647000;
        const currentSpent = activePlayer.roster.reduce((sum, p) => sum + (p.salary || 0), 0);
        const remainingCap = totalSalaryCap - currentSpent;
        available = available.filter(p => (p.salary || 0) <= remainingCap);
      }

      // P1 Constraints
      const rookieFloor = room.settings.rookieFloor || 0;
      const currentRookies = activePlayer.roster.filter(p => p.is_rookie).length;
      const rookieDeficit = rookieFloor - currentRookies;
      const mustPickRookie = rookieDeficit > 0 && remainingPicks <= rookieDeficit;

      const allStarCap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
      const currentAllStars = activePlayer.roster.filter(p => p.is_allstar).length;
      const cannotPickAllStar = currentAllStars >= allStarCap;

      let filtered = available;
      if (mustPickRookie) {
        filtered = filtered.filter(p => p.is_rookie);
      }
      if (cannotPickAllStar) {
        filtered = filtered.filter(p => !p.is_allstar);
      }
      if (filtered.length > 0) {
        available = filtered;
      }

      // Penalty constraints:
      // 1. Force exclude allstars: is_allstar === false
      let penaltyCandidates = available.filter(p => !p.is_allstar);
      if (penaltyCandidates.length === 0) {
        penaltyCandidates = available; // Fallback
      }

      // 2. Sort by PTS ASC, select the worst player
      penaltyCandidates.sort((a, b) => (a.pts || 0) - (b.pts || 0));
      selectedPlayer = penaltyCandidates[0];
    }
  }

  // 3. Fallback to any random player in case team is empty or salary cap too low to afford anyone
  if (!selectedPlayer) {
    console.log(`⚠️ Low cap or empty pool fallback for Room ${roomId}`);
    let generalPool = await getYearPlayers(room.settings.year || 2026);
    
    let available = generalPool.filter(p => {
      if (room.draftedIds.includes(p.name)) return false;
      if (room.settings.banAllStars && p.is_allstar) return false;
      if (room.settings.rookieOnly && !p.is_rookie) return false;
      return true;
    });

    if (mode.includes('salary_cap')) {
      const totalSalaryCap = SALARY_CAPS[room.settings.year] || 154647000;
      const currentSpent = activePlayer.roster.reduce((sum, p) => sum + (p.salary || 0), 0);
      const remainingCap = totalSalaryCap - currentSpent;
      available = available.filter(p => (p.salary || 0) <= remainingCap);
    }

    // P1 Constraints
    const remainingPicks = 5 - activePlayer.roster.length;
    const rookieFloor = room.settings.rookieFloor || 0;
    const currentRookies = activePlayer.roster.filter(p => p.is_rookie).length;
    const rookieDeficit = rookieFloor - currentRookies;
    const mustPickRookie = rookieDeficit > 0 && remainingPicks <= rookieDeficit;

    const allStarCap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
    const currentAllStars = activePlayer.roster.filter(p => p.is_allstar).length;
    const cannotPickAllStar = currentAllStars >= allStarCap;

    let filtered = available;
    if (mustPickRookie) {
      filtered = filtered.filter(p => p.is_rookie);
    }
    if (cannotPickAllStar) {
      filtered = filtered.filter(p => !p.is_allstar);
    }
    if (filtered.length > 0) {
      available = filtered;
    }

    let penaltyCandidates = available.filter(p => !p.is_allstar);
    if (penaltyCandidates.length === 0) penaltyCandidates = available;
    penaltyCandidates.sort((a, b) => (a.pts || 0) - (b.pts || 0));
    selectedPlayer = penaltyCandidates[0];
  }

  if (selectedPlayer) {
    const draftedPlayerDoc = {
      name: selectedPlayer.name,
      team: selectedPlayer.team || selectedPlayer.realTeam || 'UNK',
      pts: selectedPlayer.pts || 0,
      trb: selectedPlayer.trb || 0,
      ast: selectedPlayer.ast || 0,
      position: selectedPlayer.positions || selectedPlayer.position || ['G'],
      salary: selectedPlayer.salary || selectedPlayer.price || 0,
      is_allstar: !!selectedPlayer.is_allstar,
      is_rookie: !!selectedPlayer.is_rookie,
      peak_year: selectedPlayer.year || room.settings.year,
      is_legend: mode.includes('legend') || selectedPlayer.is_legend || false
    };

    activePlayer.roster.push(draftedPlayerDoc);
    room.draftedIds.push(draftedPlayerDoc.name);

    // Broadcast AFK Penalty event
    io.to(roomId).emit('afk_penalty_trigger', {
      playerName: activePlayer.name,
      teamName: teamName || draftedPlayerDoc.team,
      playerNameAssigned: draftedPlayerDoc.name,
      logo: teamLogo
    });

    // If it was a blind draft, also broadcast the blind reveal!
    if (selectedPlayer.is_blind) {
      io.to(roomId).emit('blind_reveal', {
        playerName: activePlayer.name,
        realName: draftedPlayerDoc.name,
        realTeam: draftedPlayerDoc.team,
        blindId: selectedPlayer.blindId
      });
    }
  }

  // Move to next turn
  room.draftIndex++;
  room.currentTeam = null;

  if (room.draftIndex >= room.draftOrder.length) {
    await completeDraft(room);
  } else {
    // Switch turn
    room.phase = 'wheel';
    room.roomState = 'DRAFTING';
    const nextPlayerIdx = room.draftOrder[room.draftIndex];
    const nextPlayer = room.players[nextPlayerIdx];
    room.currentTurnPlayerId = nextPlayer ? nextPlayer.socketId : null;
    
    // Start timer for the next turn
    startRoomTurnTimer(roomId);
  }

  await saveRoomToDB(roomId, room);
  broadcastRoomUpdate(roomId);
}

// Helper: Check if a team has any draftable players remaining for a room
async function hasAvailablePlayersForTeam(room, teamAbbr) {
  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  if (!activePlayer) return false;

  const allPlayers = await getYearPlayers(room.settings.year);
  const targetAbbr = getHistoricalTeamAbbr(teamAbbr, room.settings.year);

  const remainingPicks = 5 - activePlayer.roster.length;
  const currentRookies = activePlayer.roster.filter(p => p.is_rookie).length;
  const rookieFloor = room.settings.rookieFloor || 0;
  const rookieDeficit = rookieFloor - currentRookies;
  const mustPickRookie = rookieDeficit > 0 && remainingPicks <= rookieDeficit;

  const currentAllStars = activePlayer.roster.filter(p => p.is_allstar).length;
  const allStarCap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
  const cannotPickAllStar = currentAllStars >= allStarCap;

  const banned = room.bannedPlayerNames || [];

  return allPlayers.some(p => {
    // Must match team
    if (p.team !== targetAbbr) return false;
    // Exclude drafted players
    if (room.draftedIds.includes(p.name)) return false;
    // Exclude room pre-banned players
    if (banned.includes(p.name)) return false;
    // Apply Star Bans
    if (room.settings.banAllStars && p.is_allstar) return false;
    // Apply Rookie Only filter
    if (room.settings.rookieOnly && !p.is_rookie) return false;

    // Apply active player constraints
    if (mustPickRookie && !p.is_rookie) return false;
    if (cannotPickAllStar && p.is_allstar) return false;

    return true;
  });
}

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // 1. Create Room Event
  socket.on('create_room', async ({ settings, playerName, uid }) => {
    const roomId = generateRoomId();
    let rookieGamesPlayed = 0;
    if (uid) {
      try {
        const user = await getUserByUid(uid);
        if (user) {
          rookieGamesPlayed = user.rookieGamesPlayed || 0;
        }
      } catch (err) {
        console.error('Error fetching user rookie games in create_room:', err);
      }
    }

    const room = {
      id: roomId,
      settings: {
        year: parseInt(settings.year) || 2026,
        banAllStars: !!settings.banAllStars,
        rookieOnly: !!settings.rookieOnly,
        mode: settings.mode || 'wheel', // 'wheel', 'legend_wheel', '15usd', ...
        blindSubmode: settings.blindSubmode || 'single',
        decade: settings.decade || '1990s',
        allStarCap: settings.allStarCap !== undefined ? parseInt(settings.allStarCap) : 5,
        rookieFloor: settings.rookieFloor !== undefined ? parseInt(settings.rookieFloor) : 0
      },
      players: [{
        socketId: socket.id,
        name: playerName || 'Host',
        roster: [],
        isOwner: true,
        isOnline: true,
        uid: uid || null,
        rookieGamesPlayed
      }],
      draftOrder: [],
      draftIndex: 0,
      draftedIds: [],
      currentTeam: null,
      blindPool: [],
      phase: 'lobby',
      evalResult: null,
      availableTeams: [],
      sheetIndex: null, // For 15 USD modes, tells clients which pregenerated 5x5 grid to render
      isPVE: !!settings.isPVE,
      levelId: settings.levelId ? parseInt(settings.levelId) : null
    };

    activeRooms.set(roomId, room);
    socket.join(roomId);
    await saveRoomToDB(roomId, room);

    socket.emit('room_created', { roomId, room });
    console.log(`🏠 Room ${roomId} created by ${playerName} (isPVE: ${room.isPVE})`);
  });

  // 2. Join Room Event
  socket.on('join_room', async ({ roomId, playerName, uid }) => {
    let room = activeRooms.get(roomId);

    // If not in memory, attempt to recover from MongoDB Atlas
    if (!room) {
      room = await loadRoomFromDB(roomId);
      if (room) {
        // Hydrate back into in-memory cache
        activeRooms.set(roomId, room);
      }
    }

    if (!room) {
      socket.emit('error_message', '找不到此房號，請確認後再輸入。');
      return;
    }

    if (room.phase !== 'lobby' && !room.players.some(p => p.name === playerName)) {
      socket.emit('error_message', '遊戲已經開始，無法中途加入！');
      return;
    }

    if (room.players.length >= 4 && !room.players.some(p => p.name === playerName)) {
      socket.emit('error_message', '房間已滿（上限 4 人）！');
      return;
    }

    let rookieGamesPlayed = 0;
    if (uid) {
      try {
        const user = await getUserByUid(uid);
        if (user) {
          rookieGamesPlayed = user.rookieGamesPlayed || 0;
        }
      } catch (err) {
        console.error('Error fetching user rookie games in join_room:', err);
      }
    }

    // Check if player is already in this room (reconnect case)
    const existingPlayer = room.players.find(p => p.name === playerName);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.isOnline = true;
      existingPlayer.uid = uid || existingPlayer.uid || null;
      if (uid) {
        existingPlayer.rookieGamesPlayed = rookieGamesPlayed;
      }
      // Update turn player socket ID if active
      if (room.draftOrder && room.draftOrder.length > 0) {
        const activePlayerIdx = room.draftOrder[room.draftIndex];
        const activePlayer = room.players[activePlayerIdx];
        if (activePlayer && activePlayer.name === playerName) {
          room.currentTurnPlayerId = socket.id;
        }
      }
    } else {
      room.players.push({
        socketId: socket.id,
        name: playerName,
        roster: [],
        isOwner: false,
        isOnline: true,
        uid: uid || null,
        rookieGamesPlayed
      });
    }

    socket.join(roomId);
    await saveRoomToDB(roomId, room);
    broadcastRoomUpdate(roomId);

    console.log(`👤 Player ${playerName} joined room ${roomId}`);
  });

  // 3. Reconnect/Rejoin Event
  socket.on('rejoin_room', async ({ roomId, playerName }) => {
    let room = activeRooms.get(roomId);

    // If server restarted, read room state from MongoDB Atlas
    if (!room) {
      room = await loadRoomFromDB(roomId);
      if (room) {
        activeRooms.set(roomId, room);
      }
    }

    if (room) {
      const player = room.players.find(p => p.name === playerName);
      if (player) {
        player.socketId = socket.id;
        player.isOnline = true;
        socket.join(roomId);
        // Update turn player socket ID if active
        if (room.draftOrder && room.draftOrder.length > 0) {
          const activePlayerIdx = room.draftOrder[room.draftIndex];
          const activePlayer = room.players[activePlayerIdx];
          if (activePlayer && activePlayer.name === playerName) {
            room.currentTurnPlayerId = socket.id;
          }
        }
        console.log(`🔄 Session restored: ${playerName} rejoined Room ${roomId}`);
        await saveRoomToDB(roomId, room);
        broadcastRoomUpdate(roomId);
      } else {
        socket.emit('rejoin_failed');
      }
    } else {
      socket.emit('rejoin_failed');
    }
  });

  // 4. Start Game Event
  socket.on('start_game', async ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.phase = 'draft';
    room.draftIndex = 0;
    room.draftedIds = [];
    room.evalResult = null;
    room.currentTeam = null;

    if (room.isPVE) {
      const levelConfig = PVE_LEVELS[room.levelId - 1];
      if (levelConfig) {
        room.settings.mode = levelConfig.mode;
        
        // Parse year from cpuTeamName
        const matchYear = levelConfig.cpuTeamName.match(/^(\d{4})/);
        const levelYear = matchYear ? parseInt(matchYear[1]) : 2026;
        room.settings.year = levelYear;
        
        if (levelConfig.restrictions) {
          room.settings.allStarCap = levelConfig.restrictions.allStarCap !== undefined ? levelConfig.restrictions.allStarCap : 5;
          room.settings.rookieFloor = levelConfig.restrictions.rookieFloor !== undefined ? levelConfig.restrictions.rookieFloor : 0;
          room.settings.budget = levelConfig.restrictions.budget !== undefined ? levelConfig.restrictions.budget : 15;
        } else {
          room.settings.allStarCap = 5;
          room.settings.rookieFloor = 0;
          room.settings.budget = 15;
        }
      }
      room.draftOrder = [0, 0, 0, 0, 0];
    } else {
      // Randomize player draft order (Snake draft)
      const shuntedPlayers = [...room.players];
      // Shuffle players order
      for (let i = shuntedPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuntedPlayers[i], shuntedPlayers[j]] = [shuntedPlayers[j], shuntedPlayers[i]];
      }
      // Update players in room with new order
      room.players = shuntedPlayers;
      room.draftOrder = generateSnakeDraftOrder(room.players.length);
    }

    // Process pre-bans & deduct currency *after* settings (like year) are fully initialized
    try {
      await processRoomPreBans(room);
    } catch (err) {
      console.error('Error processing room pre-bans:', err);
    }

    const year = room.settings.year;
    const mode = room.settings.mode;

    console.log(`🚀 Starting draft for room ${roomId} in mode ${mode} (${year})`);

    // Fetch players for the chosen year, decade or legend pool (triggers cache populate from DB if needed)
    let playersPool = [];
    if (mode === 'blind' && room.settings.blindSubmode === 'decade') {
      const decade = room.settings.decade || '1990s';
      let startYear, endYear;
      if (decade === '1980s') { startYear = 1980; endYear = 1989; }
      else if (decade === '1990s') { startYear = 1990; endYear = 1999; }
      else if (decade === '2000s') { startYear = 2000; endYear = 2009; }
      else if (decade === '2010s') { startYear = 2010; endYear = 2019; }
      else if (decade === '2020s') { startYear = 2020; endYear = 2026; }
      else { startYear = 1990; endYear = 1999; }

      try {
        const years = [];
        for (let y = startYear; y <= endYear; y++) years.push(y);
        const allYearsPlayers = await Promise.all(years.map(y => getYearPlayers(y)));
        playersPool = allYearsPlayers.flat();
      } catch (err) {
        socket.emit('error_message', `無法讀取 ${decade} 年代球員數據！`);
        room.phase = 'lobby';
        broadcastRoomUpdate(roomId);
        return;
      }
    } else if (mode === 'wheel' || mode === 'salary_cap' || mode === 'salary_cap_legend' || mode === 'blind' || mode === '15usd') {
      playersPool = await getYearPlayers(year);
      if (playersPool.length === 0) {
        socket.emit('error_message', `找不到 ${year} 年的球員數據，請確認資料庫已匯入該年資料！`);
        room.phase = 'lobby';
        broadcastRoomUpdate(roomId);
        return;
      }
    }

    // Handle game mode initializations
    if (mode === '15usd') {
      try {
        room.dynamicGrid = await generateDynamic15UsdGrid(year, room.bannedPlayerNames);
        room.sheetIndex = null;
      } catch (err) {
        socket.emit('error_message', `無法動態生成 5x5 表格，請確認資料庫中已匯入 ${year} 年資料！`);
        room.phase = 'lobby';
        broadcastRoomUpdate(roomId);
        return;
      }
    } else if (mode === 'legend_15usd') {
      room.sheetIndex = Math.floor(Math.random() * 40);
      room.dynamicGrid = null;
    } else if (mode === 'blind') {
      // Filter out invalid players (All-Star/Rookie constraints if applicable)
      const allowedPlayers = playersPool.filter(p => {
        if (room.settings.banAllStars && p.is_allstar) return false;
        if (room.settings.rookieOnly && !p.is_rookie) return false;
        return true;
      });

      // Sample (players.length * 5) random players for the shared pool
      const sampleSize = room.players.length * 5;
      if (allowedPlayers.length < sampleSize) {
        socket.emit('error_message', `可選球員不足！符合篩選條件的球員只有 ${allowedPlayers.length} 名。`);
        room.phase = 'lobby';
        broadcastRoomUpdate(roomId);
        return;
      }

      // Shuffle and slice
      const shuffled = [...allowedPlayers];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const rawSample = shuffled.slice(0, sampleSize);

      // Hide identities in the pool sent to clients
      room.blindPool = rawSample.map((p, idx) => ({
        blindId: `B-${idx}`,
        pts: p.pts,
        trb: p.trb,
        ast: p.ast,
        position: p.position,
        salary: p.salary,
        is_allstar: p.is_allstar,
        is_rookie: p.is_rookie,
        decade: room.settings.blindSubmode === 'decade' ? `${Math.floor(p.year / 10) * 10}s` : null,
        // Backend keeps real name/team/year
        realName: p.name,
        realTeam: p.team,
        realYear: p.year
      }));
    } else {
      if (mode === 'legend_wheel') {
        room.availableTeams = [...MODERN_TEAMS];
      } else if (mode === 'salary_cap_legend') {
        // Salary Cap + Legends: use all modern teams (players from DB year + legends from franchise history)
        room.availableTeams = [...MODERN_TEAMS];
      } else {
        // Wheel, Salary Cap, Blind: get all unique team abbreviations in the players pool
        // Filter out any multi-team symbols ending in 'TM' (e.g., 2TM, 3TM, 4TM)
        const teamsSet = new Set(playersPool.map(p => p.team).filter(t => t && !t.endsWith('TM')));
        // Map back to standard modern teams, then fallback to historical metadata
        room.availableTeams = Array.from(teamsSet).map(abbr => {
          // 1. Check historical metadata first
          const meta = HISTORICAL_TEAMS_META[abbr];
          if (meta) {
            return {
              abbreviation: abbr,
              name: meta.name,
              logo: meta.logo || '🏀',
              primaryColor: meta.primaryColor || '#4b5563',
              secondaryColor: meta.secondaryColor || '#9ca3af'
            };
          }
          // 2. Check modern equivalent
          const standardAbbr = getModernEquivalent(abbr);
          const modern = MODERN_TEAMS.find(t => t.abbreviation === standardAbbr);
          if (modern) {
            return {
              ...modern,
              abbreviation: abbr // Keep database abbreviation for query consistency
            };
          }
          // 3. Fallback
          return {
            abbreviation: abbr,
            name: abbr,
            logo: '🏀',
            primaryColor: '#4b5563',
            secondaryColor: '#9ca3af'
          };
        });
      }
    }

    const activePlayerIdx = room.draftOrder[0];
    const activePlayer = room.players[activePlayerIdx];
    room.currentTurnPlayerId = activePlayer ? activePlayer.socketId : null;
    room.roomState = 'DRAFTING';

    await saveRoomToDB(roomId, room);
    io.to(roomId).emit('game_started', room);
    broadcastRoomUpdate(roomId);

    startRoomTurnTimer(roomId);
  });

  // 5. Spin Wheel Event
  socket.on('spin_wheel_request', async ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    const activePlayerIdx = room.draftOrder[room.draftIndex];
    const activePlayer = room.players[activePlayerIdx];

    if (!activePlayer || activePlayer.socketId !== socket.id) {
      socket.emit('error_message', '目前不是你的回合，無法旋轉轉盤！');
      return;
    }

    if (room.roomState !== 'DRAFTING') {
      socket.emit('error_message', '轉盤目前正在旋轉中，請勿重複操作。');
      return;
    }

    // Lock the room state
    room.roomState = 'WHEEL_SPINNING';
    room.turnExpiresAt = null; // Hide timer during spin

    // Clear active turn timer
    clearRoomTurnTimer(roomId);

    // Start a 6-second backup timer to auto-transition to pick phase if client gets stuck/backgrounded
    const backupTimer = setTimeout(async () => {
      try {
        const currentRoom = activeRooms.get(roomId);
        if (currentRoom && currentRoom.phase === 'wheel' && currentRoom.roomState === 'WHEEL_SPINNING') {
          console.log(`⏰ Backup spin timer expired for Room ${roomId}. Transitioning to pick phase...`);
          currentRoom.phase = 'pick';
          currentRoom.roomState = 'DRAFTING';
          await saveRoomToDB(roomId, currentRoom);
          broadcastRoomUpdate(roomId);
          startRoomTurnTimer(roomId); // Start fresh 30s timer for pick
        }
      } catch (err) {
        console.error(`Error in backup spin timer for room ${roomId}:`, err);
      }
    }, 6000);
    roomTimers.set(roomId, backupTimer);

    const mode = room.settings.mode;
    const year = room.settings.year;

    let rolledTeam = null;

    // Spin retry protection (max 10 attempts to find a team with players)
    for (let attempt = 0; attempt < 10; attempt++) {
      const idx = Math.floor(Math.random() * room.availableTeams.length);
      const tempTeam = room.availableTeams[idx];
      
      if (mode === 'legend_15usd' || mode === '15usd') {
        break;
      }

      if (mode === 'legend_wheel') {
        const legends = await getFranchiseLegendsFromDB(tempTeam.abbreviation);
        const availableLegends = legends.filter(p => !room.draftedIds.includes(p.name));
        if (availableLegends.length > 0) {
          rolledTeam = tempTeam;
          break;
        } else {
          io.to(roomId).emit('auto_respin_alert', {
            teamName: tempTeam.name,
            logo: tempTeam.logo
          });
        }
      } else if (mode === 'wheel' || mode === 'salary_cap' || mode === 'salary_cap_legend') {
        const playersAvailable = await hasAvailablePlayersForTeam(room, tempTeam.abbreviation);
        if (playersAvailable) {
          rolledTeam = tempTeam;
          break;
        } else {
          io.to(roomId).emit('auto_respin_alert', {
            teamName: tempTeam.name,
            logo: tempTeam.logo
          });
        }
      } else {
        rolledTeam = tempTeam;
        break;
      }
    }

    if (!rolledTeam) {
      rolledTeam = room.availableTeams[Math.floor(Math.random() * room.availableTeams.length)];
    }

    room.currentTeam = rolledTeam;
    room.phase = 'wheel';
    await saveRoomToDB(roomId, room);

    // Broadcast spin start to everyone!
    io.to(roomId).emit('wheel_start_spin', { team: rolledTeam, roomSnapshot: room });
  });

  // 5b. Client notifies server animation is done -> switch to pick phase
  socket.on('spin_done', async ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room || room.phase !== 'wheel') return;

    // Only allow active player to trigger spin_done (anti-spam / safety)
    const activePlayerIdx = room.draftOrder[room.draftIndex];
    const activePlayer = room.players[activePlayerIdx];
    if (activePlayer && activePlayer.socketId !== socket.id) return;

    // Clear backup timer
    clearRoomTurnTimer(roomId);

    room.phase = 'pick';
    room.roomState = 'DRAFTING'; // Allow picking
    await saveRoomToDB(roomId, room);
    broadcastRoomUpdate(roomId);

    // Start fresh 30s timer for picking phase!
    startRoomTurnTimer(roomId);
  });

  // 6. Draft Player Event
  socket.on('draft_player_request', async ({ roomId, playerSelection }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    const activePlayerIdx = room.draftOrder[room.draftIndex];
    const activePlayer = room.players[activePlayerIdx];

    if (!activePlayer || activePlayer.socketId !== socket.id) {
      socket.emit('error_message', '目前不是你的回合，無法選擇球員！');
      return;
    }

    if (room.roomState === 'WHEEL_SPINNING') {
      socket.emit('error_message', '目前轉盤正在旋轉，請等候旋轉結束再選人！');
      return;
    }

    const mode = room.settings.mode;
    const year = room.settings.year;

    let draftedPlayerDoc = null;

    if (mode === '15usd' || mode === 'legend_15usd') {
      // Hardcoded 5x5 Grid Draft: selection has name, price, pts, trb, ast, position, team
      draftedPlayerDoc = {
        name: playerSelection.name,
        pts: playerSelection.pts,
        trb: playerSelection.trb,
        ast: playerSelection.ast,
        position: playerSelection.positions,
        team: playerSelection.team,
        salary: playerSelection.price, // Map $ price tier as salary
        is_allstar: !!playerSelection.is_allstar,
        is_rookie: !!playerSelection.is_rookie
      };

      // Check budget with P2 dynamic budget prevention and safety net
      const currentSpent = activePlayer.roster.reduce((sum, p) => sum + p.salary, 0);
      const remainingPicks = 5 - activePlayer.roster.length;
      const budget = 15 - currentSpent;
      const maxAffordable = budget - (remainingPicks - 1);

      // Check if safety net is active
      const gridsPool = mode === 'legend_15usd' ? LEGENDS_5X5_GRIDS : ACTIVE_5X5_GRIDS;
      const gridData = room.dynamicGrid || gridsPool[room.sheetIndex];
      const affordableCount = gridData ? gridData.filter(pr => !room.draftedIds.includes(pr.name) && pr.price <= maxAffordable).length : 0;
      const isSafetyNetActive = (affordableCount < remainingPicks);

      if (isSafetyNetActive) {
        draftedPlayerDoc.salary = 1;
      } else {
        if (draftedPlayerDoc.salary > maxAffordable) {
          socket.emit('error_message', `預算超出限制！為了保證後續選秀（每人至少 $1），此輪最高只能選擇 $${maxAffordable} 的球員。`);
          return;
        }
      }

      if (room.draftedIds.includes(draftedPlayerDoc.name)) {
        socket.emit('error_message', '該球員已被其他人選走！');
        return;
      }

    } else if (mode === 'blind') {
      // Blind mode selection: selection is the blindId
      const poolItem = room.blindPool.find(p => p.blindId === playerSelection.blindId);
      if (!poolItem) {
        socket.emit('error_message', '無效的盲選卡片！');
        return;
      }

      if (room.draftedIds.includes(poolItem.realName)) {
        socket.emit('error_message', '此球員已在盲選中被揭曉選走！');
        return;
      }

      draftedPlayerDoc = {
        name: poolItem.realName,
        pts: poolItem.pts,
        trb: poolItem.trb,
        ast: poolItem.ast,
        position: poolItem.position,
        team: poolItem.realTeam,
        salary: poolItem.salary,
        is_allstar: poolItem.is_allstar,
        is_rookie: poolItem.is_rookie,
        year: poolItem.realYear,
        peak_year: poolItem.realYear
      };

      // Tell players who was just revealed!
      io.to(roomId).emit('blind_reveal', {
        playerName: activePlayer.name,
        realName: draftedPlayerDoc.name,
        realTeam: draftedPlayerDoc.team,
        blindId: poolItem.blindId
      });

    } else {
      // Wheel or Salary Cap Modes (Roster database)
      const isLegendPick = !!playerSelection.isLegend;
      
      if (isLegendPick) {
        // Load peak stats from legends pool
        draftedPlayerDoc = {
          name: playerSelection.name,
          pts: playerSelection.pts,
          trb: playerSelection.trb,
          ast: playerSelection.ast,
          position: playerSelection.position,
          team: playerSelection.team,
          salary: playerSelection.salary,
          is_allstar: !!playerSelection.is_allstar,
          is_rookie: !!playerSelection.is_rookie,
          is_legend: true,
          peak_year: playerSelection.year
        };
      } else {
        // Standard database load
        const yearPlayers = await getYearPlayers(year);
        const match = yearPlayers.find(p => p.name === playerSelection.name && p.team === playerSelection.team);
        if (!match) {
          socket.emit('error_message', '找不到選取的球員！');
          return;
        }
        draftedPlayerDoc = {
          name: match.name,
          pts: match.pts,
          trb: match.trb,
          ast: match.ast,
          position: match.position,
          team: match.team,
          salary: match.salary,
          is_allstar: match.is_allstar,
          is_rookie: match.is_rookie
        };
      }

      if (room.draftedIds.includes(draftedPlayerDoc.name)) {
        socket.emit('error_message', '該球員已被其他人選走！');
        return;
      }

      // Check Salary Cap limit
      if (mode === 'salary_cap') {
        const teamCap = SALARY_CAPS[year] || 154647000;
        const currentSalary = activePlayer.roster.reduce((sum, p) => sum + p.salary, 0);
        
        if (currentSalary + draftedPlayerDoc.salary > teamCap) {
          socket.emit('error_message', `薪資空間不足！目前薪資：$${currentSalary.toLocaleString()}，該球員薪水：$${draftedPlayerDoc.salary.toLocaleString()}，總薪資上限：$${teamCap.toLocaleString()}`);
          return;
        }
      }
    }

    if (!draftedPlayerDoc) {
      socket.emit('error_message', '無效的球員選擇！');
      return;
    }

    // P1 Constraints (All-Star Cap and Rookie Floor)
    const remainingPicks = 5 - activePlayer.roster.length;
    const currentRookies = activePlayer.roster.filter(p => p.is_rookie).length;
    const rookieFloor = room.settings.rookieFloor || 0;
    const rookieDeficit = rookieFloor - currentRookies;
    const mustPickRookie = rookieDeficit > 0 && remainingPicks <= rookieDeficit;

    if (mustPickRookie && !draftedPlayerDoc.is_rookie) {
      socket.emit('error_message', `你還需要選擇 ${rookieDeficit} 位新秀，剩餘選秀次數不足，本次必須選擇新秀！`);
      return;
    }

    const currentAllStars = activePlayer.roster.filter(p => p.is_allstar).length;
    const allStarCap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
    if (draftedPlayerDoc.is_allstar && currentAllStars >= allStarCap) {
      socket.emit('error_message', `你的全明星名額已達上限 (${allStarCap} 人)！`);
      return;
    }

    // Push selection
    activePlayer.roster.push(draftedPlayerDoc);
    room.draftedIds.push(draftedPlayerDoc.name);

    // Clear turn timer
    clearRoomTurnTimer(roomId);

    // Move to next turn
    room.draftIndex++;
    room.currentTeam = null;

    if (room.draftIndex >= room.draftOrder.length) {
      await completeDraft(room);
    } else {
      room.phase = 'wheel';
      room.roomState = 'DRAFTING';
      const nextPlayerIdx = room.draftOrder[room.draftIndex];
      const nextPlayer = room.players[nextPlayerIdx];
      room.currentTurnPlayerId = nextPlayer ? nextPlayer.socketId : null;
      
      // Start timer for the next turn
      startRoomTurnTimer(roomId);
    }

    await saveRoomToDB(roomId, room);
    broadcastRoomUpdate(roomId);
  });

  // 7. Request AI Evaluation Event
  socket.on('request_evaluation', async ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    // Mark AI evaluating and broadcast
    io.to(roomId).emit('ai_evaluating');

    try {
      console.log(`🤖 Queuing Gemini AI evaluation for Room ${roomId}...`);
      const evaluationText = await queueEvaluation(room);
      
      room.evalResult = evaluationText;
      await saveRoomToDB(roomId, room);
      
      io.to(roomId).emit('eval_result', evaluationText);
      broadcastRoomUpdate(roomId);
      console.log(`✅ Room ${roomId} evaluation complete.`);
    } catch (err) {
      console.error(`❌ Evaluation error for room ${roomId}:`, err);
      io.to(roomId).emit('eval_error', err.message || 'AI 評估失敗，請點擊重試。');
    }
  });

  // 8. Replay / Restart Room Event
  socket.on('play_again', async ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    // Reset room phase and state
    room.phase = 'lobby';
    room.roomState = 'LOBBY';
    room.draftIndex = 0;
    room.draftOrder = [];
    room.draftedIds = [];
    room.currentTeam = null;
    room.blindPool = [];
    room.evalResult = null;
    room.ratings = null;
    room.dynamicGrid = null;
    room.sheetIndex = null;
    room.availableTeams = [];
    room.currentTurnPlayerId = null;
    room.turnExpiresAt = null;

    // Clear timers
    clearRoomTurnTimer(roomId);

    // Clear rosters and remove CPU bots
    room.players = room.players.filter(p => !p.isCPU);
    room.players.forEach(p => {
      p.roster = [];
    });

    await saveRoomToDB(roomId, room);
    broadcastRoomUpdate(roomId);
  });

  // 9. Fetch Franchise Legends Pick Pool Event
  socket.on('get_team_legends', ({ teamAbbr }, callback) => {
    const legends = getLegendsForTeam(teamAbbr);
    callback(legends);
  });

  // 10. Fetch Team Roster Event / Dynamic Franchise Legends
  socket.on('get_team_roster', async ({ roomId, teamAbbr }, callback) => {
    const room = activeRooms.get(roomId);
    if (!room) return callback([]);

    const mode = room.settings.mode;
    const banned = room.bannedPlayerNames || [];

    if (mode === 'legend_wheel') {
      try {
        const legends = await getFranchiseLegendsFromDB(teamAbbr);
        const filtered = legends.filter(p => {
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
        return callback(filtered);
      } catch (err) {
        console.error(`❌ Error fetching franchise legends for ${teamAbbr}:`, err);
        return callback([]);
      }
    }

    const year = room.settings.year;
    const allPlayers = await getYearPlayers(year);
    const targetAbbr = getHistoricalTeamAbbr(teamAbbr, year);

    const filtered = allPlayers.filter(p => {
      // Match team
      if (p.team !== targetAbbr) return false;
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

    callback(filtered);
  });

  // 11. Leave Room Event
  socket.on('leave_room', async ({ roomId, playerName }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    // Remove player
    room.players = room.players.filter(p => p.name !== playerName);
    socket.leave(roomId);

    if (room.players.length === 0) {
      activeRooms.delete(roomId);
      try {
        const db = await connectDB();
        await db.collection('active_rooms').deleteOne({ _id: roomId });
      } catch (err) {
        console.error(`Error deleting room ${roomId} from DB:`, err);
      }
      console.log(`🏠 Room ${roomId} is empty and has been removed.`);
    } else {
      // Re-assign owner if owner left
      const hasOwner = room.players.some(p => p.isOwner);
      if (!hasOwner && room.players.length > 0) {
        room.players[0].isOwner = true;
      }

      await saveRoomToDB(roomId, room);
      broadcastRoomUpdate(roomId);
      
      // Let others know someone left
      io.to(roomId).emit('error_message', `👋 玩家 ${playerName} 已離開房間。`);
    }
  });

  // 12. Disconnect Event
  socket.on('disconnect', async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    // Find rooms containing the player and mark them as offline
    for (const [roomId, room] of activeRooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.isOnline = false;
        console.log(`👤 Player ${player.name} went offline in Room ${roomId}`);
        await saveRoomToDB(roomId, room);
        broadcastRoomUpdate(roomId);
      }
    }
  });
});

// Run server
server.listen(port, () => {
  console.log(`🚀 NBA Draft Showdown Server running on port ${port}`);
});
