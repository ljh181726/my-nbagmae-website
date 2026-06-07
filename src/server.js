const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { connectDB } = require('./db');
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

const fs = require('fs');
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

  // Set expiration time
  room.turnExpiresAt = Date.now() + 30000;

  // Setup timeout callback
  const timer = setTimeout(async () => {
    try {
      console.log(`🚨 AFK timeout for Room ${roomId}. Running penalty draft...`);
      await triggerAFKPenalty(roomId);
    } catch (err) {
      console.error(`Error in AFK Penalty for Room ${roomId}:`, err);
    }
  }, 30000);

  roomTimers.set(roomId, timer);
}

// Helper: Clear timer
function clearRoomTurnTimer(roomId) {
  if (roomTimers.has(roomId)) {
    clearTimeout(roomTimers.get(roomId));
    roomTimers.delete(roomId);
  }
}

// Helper: Trigger AFK Penalty Auto-Draft
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
    
    const spent = activePlayer.roster.reduce((sum, p) => sum + (p.salary || 0), 0);
    const remainingBudget = 15 - spent;
    
    if (availableGridPlayers && availableGridPlayers.length > 0) {
      let candidates = availableGridPlayers.filter(p => !room.draftedIds.includes(p.name) && p.price <= remainingBudget);
      let penaltyCandidates = candidates.filter(p => !p.is_allstar);
      if (penaltyCandidates.length === 0) penaltyCandidates = candidates;
      penaltyCandidates.sort((a, b) => (a.pts || 0) - (b.pts || 0));
      if (penaltyCandidates.length > 0) {
        selectedPlayer = penaltyCandidates[0];
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
      salary: selectedPlayer.salary || 0,
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
    room.phase = 'eval';
    room.roomState = 'GAME_OVER';
    console.log(`🏁 Draft completed via AFK for room ${roomId}. Entering evaluation...`);
    clearRoomTurnTimer(roomId);
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
  const allPlayers = await getYearPlayers(room.settings.year);
  const targetAbbr = getHistoricalTeamAbbr(teamAbbr, room.settings.year);

  return allPlayers.some(p => {
    // Must match team
    if (p.team !== targetAbbr) return false;
    // Exclude drafted players
    if (room.draftedIds.includes(p.name)) return false;
    // Apply Star Bans
    if (room.settings.banAllStars && p.is_allstar) return false;
    // Apply Rookie Only filter
    if (room.settings.rookieOnly && !p.is_rookie) return false;
    return true;
  });
}

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // 1. Create Room Event
  socket.on('create_room', async ({ settings, playerName }) => {
    const roomId = generateRoomId();
    const room = {
      id: roomId,
      settings: {
        year: parseInt(settings.year) || 2026,
        banAllStars: !!settings.banAllStars,
        rookieOnly: !!settings.rookieOnly,
        mode: settings.mode || 'wheel', // 'wheel', 'legend_wheel', '15usd', ...
        blindSubmode: settings.blindSubmode || 'single',
        decade: settings.decade || '1990s'
      },
      players: [{
        socketId: socket.id,
        name: playerName || 'Host',
        roster: [],
        isOwner: true,
        isOnline: true
      }],
      draftOrder: [],
      draftIndex: 0,
      draftedIds: [],
      currentTeam: null,
      blindPool: [],
      phase: 'lobby',
      evalResult: null,
      availableTeams: [],
      sheetIndex: null // For 15 USD modes, tells clients which pregenerated 5x5 grid to render
    };

    activeRooms.set(roomId, room);
    socket.join(roomId);
    await saveRoomToDB(roomId, room);

    socket.emit('room_created', { roomId, room });
    console.log(`🏠 Room ${roomId} created by ${playerName}`);
  });

  // 2. Join Room Event
  socket.on('join_room', async ({ roomId, playerName }) => {
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

    // Check if player is already in this room (reconnect case)
    const existingPlayer = room.players.find(p => p.name === playerName);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.isOnline = true;
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
        isOnline: true
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
        room.dynamicGrid = await generateDynamic15UsdGrid(year);
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

    room.phase = 'pick';
    room.roomState = 'DRAFTING'; // Allow picking
    await saveRoomToDB(roomId, room);
    broadcastRoomUpdate(roomId);
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

      // Check budget
      const currentSpent = activePlayer.roster.reduce((sum, p) => sum + p.salary, 0);
      if (currentSpent + draftedPlayerDoc.salary > 15) {
        socket.emit('error_message', `預算超出限制！目前已花費 $${currentSpent}，該球員需要 $${draftedPlayerDoc.salary}，但上限只有 $15。`);
        return;
      }

      if (room.draftedIds.includes(draftedPlayerDoc.name)) {
        socket.emit('error_message', '該球員已被其他人選走！');
        return;
      }

      activePlayer.roster.push(draftedPlayerDoc);
      room.draftedIds.push(draftedPlayerDoc.name);

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

      activePlayer.roster.push(draftedPlayerDoc);
      room.draftedIds.push(draftedPlayerDoc.name);

      // Tell players who was just revealed!
      io.to(roomId).emit('blind_reveal', {
        playerName: activePlayer.name,
        realName: draftedPlayerDoc.name,
        realTeam: draftedPlayerDoc.team,
        blindId: poolItem.blindId
      });

    } else {
      // Wheel or Salary Cap Modes (Roster database)
      // Can be a standard player or legend player (relocated franchise or legendary peak sharding)
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

      activePlayer.roster.push(draftedPlayerDoc);
      room.draftedIds.push(draftedPlayerDoc.name);
    }

    // Clear turn timer
    clearRoomTurnTimer(roomId);

    // Move to next turn
    room.draftIndex++;
    room.currentTeam = null;

    if (room.draftIndex >= room.draftOrder.length) {
      room.phase = 'eval';
      room.roomState = 'GAME_OVER';
      console.log(`🏁 Draft completed for room ${roomId}. Entering evaluation...`);
      clearRoomTurnTimer(roomId);
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
    room.sheetIndex = null;
    room.availableTeams = [];
    room.currentTurnPlayerId = null;
    room.turnExpiresAt = null;

    // Clear timers
    clearRoomTurnTimer(roomId);

    // Clear rosters
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

    if (mode === 'legend_wheel') {
      try {
        const legends = await getFranchiseLegendsFromDB(teamAbbr);
        const filtered = legends.filter(p => {
          // Exclude drafted players
          if (room.draftedIds.includes(p.name)) return false;
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
