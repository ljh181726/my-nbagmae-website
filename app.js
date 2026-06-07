import { LuckyWheel } from './wheel.js';
import { ACTIVE_5X5_GRIDS, LEGENDS_5X5_GRIDS, NBA_TEAMS, SALARY_CAPS } from './data.js';

function dbToStdAbbr(abbr) {
  if (abbr === 'BRK') return 'BKN';
  if (abbr === 'PHO') return 'PHX';
  if (abbr === 'CHO') return 'CHA';
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

// Initialize Socket.io client
const socket = io();

const state = {
  roomId: localStorage.getItem('nba_room_id') || null,
  playerName: localStorage.getItem('nba_player_name') || null,
  isOwner: false,
  room: null,
  activeRosterView: 'normal', // 'normal' | 'legend'
  wheel: null,
  wheelSpinning: false,       // true while wheel animation is running
  selectedTeamRoster: [], // Current roster available for drafting in Pick phase
  selectedTeamLegends: [], // Legends list for Relocated franchises / Legend mode
  isEvaluating: false
};


const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let draftTimerInterval = null;

function startLocalCountdown() {
  // Clear any existing interval
  if (draftTimerInterval) {
    clearInterval(draftTimerInterval);
    draftTimerInterval = null;
  }

  const room = state.room;
  if (!room || !room.turnExpiresAt || room.phase === 'lobby' || room.phase === 'eval') {
    const timerContainer = $('#draft-timer-container');
    if (timerContainer) timerContainer.classList.add('hidden');
    return;
  }

  const timerSecondsEl = $('#draft-timer-seconds');
  const timerContainer = $('#draft-timer-container');
  if (timerContainer) timerContainer.classList.remove('hidden');

  function updateSecs() {
    const now = Date.now();
    const remainingMs = room.turnExpiresAt - now;
    const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
    
    if (timerSecondsEl) {
      timerSecondsEl.textContent = remainingSecs;
    }

    if (remainingSecs <= 5) {
      if (timerContainer) {
        timerContainer.classList.remove('bg-red-950/40', 'border-red-500/30', 'text-red-400');
        timerContainer.classList.add('bg-red-600', 'border-red-700', 'text-white', 'animate-pulse');
      }
    } else {
      if (timerContainer) {
        timerContainer.classList.add('bg-red-950/40', 'border-red-500/30', 'text-red-400');
        timerContainer.classList.remove('bg-red-600', 'border-red-700', 'text-white', 'animate-pulse');
      }
    }

    if (remainingSecs <= 0) {
      clearInterval(draftTimerInterval);
      draftTimerInterval = null;
    }
  }

  // Run immediately once
  updateSecs();
  // Tick every 200ms
  draftTimerInterval = setInterval(updateSecs, 200);
}

function syncTurnUI() {
  const room = state.room;
  if (!room) return;

  const mask = $('#spectator-mask');
  const timerContainer = $('#draft-timer-container');

  if (room.phase === 'lobby' || room.phase === 'eval') {
    if (mask) mask.classList.add('hidden');
    if (timerContainer) timerContainer.classList.add('hidden');
    return;
  }

  // Under drafting phase
  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  const isMyTurn = activePlayer && (activePlayer.socketId === socket.id || activePlayer.name === state.playerName);

  if (isMyTurn) {
    if (mask) mask.classList.add('hidden');
  } else {
    if (mask) {
      mask.classList.remove('hidden');
      const maskTitle = $('#spectator-mask-title');
      const maskDesc = $('#spectator-mask-desc');
      
      const activeName = activePlayer ? activePlayer.name : '對手';
      
      if (room.roomState === 'WHEEL_SPINNING' || room.phase === 'wheel') {
        if (maskTitle) maskTitle.textContent = '等待轉盤旋轉...';
        if (maskDesc) maskDesc.textContent = `當前行動者 ${activeName} 正在旋轉轉盤以決定球隊。`;
      } else {
        if (maskTitle) maskTitle.textContent = '等待選取球員...';
        if (maskDesc) maskDesc.textContent = `當前行動者 ${activeName} 正在選秀或挑選球員。`;
      }
    }
  }

  if (timerContainer) {
    timerContainer.classList.remove('hidden');
  }
}

// ── Screen Management ──────────────────────
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const target = $(`#${id}`);
  if (target) target.classList.add('active');
}

// ── Toast Notification ─────────────────────
function showToast(message) {
  const toast = $('#toast');
  const msgText = $('#toast-message');
  msgText.textContent = message;
  toast.classList.remove('hidden');
  
  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  }, 10);

  // Fade out
  setTimeout(() => {
    toast.style.transform = 'translateY(-20px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 4000);
}

// ── Tab Switching ──────────────────────────
function switchTab(type) {
  if (type === 'create') {
    $('#tab-create').className = 'flex-1 py-3 text-sm font-bold border-b-2 border-purple-500 text-purple-400';
    $('#tab-join').className = 'flex-1 py-3 text-sm font-semibold border-b-2 border-transparent text-gray-400';
    $('#panel-create').classList.remove('hidden');
    $('#panel-join').classList.add('hidden');
  } else {
    $('#tab-join').className = 'flex-1 py-3 text-sm font-bold border-b-2 border-purple-500 text-purple-400';
    $('#tab-create').className = 'flex-1 py-3 text-sm font-semibold border-b-2 border-transparent text-gray-400';
    $('#panel-join').classList.remove('hidden');
    $('#panel-create').classList.add('hidden');
  }
}

// ── Socket Events ──────────────────────────
socket.on('connect', () => {
  console.log('🔌 Connected to server');
  // Auto session recovery
  if (state.roomId && state.playerName) {
    socket.emit('rejoin_room', { roomId: state.roomId, playerName: state.playerName });
  }
});

socket.on('room_created', ({ roomId, room }) => {
  state.roomId = roomId;
  state.playerName = room.players[0].name;
  state.isOwner = true;
  state.room = room;

  localStorage.setItem('nba_room_id', roomId);
  localStorage.setItem('nba_player_name', state.playerName);

  showScreen('screen-lobby');
  updateLobbyUI();
});

socket.on('room_update', (room) => {
  state.room = room;
  
  // Find self to check ownership
  const me = room.players.find(p => p.socketId === socket.id || p.name === state.playerName);
  if (me) {
    state.isOwner = me.isOwner;
    state.playerName = me.name;
  }

  // Update timer countdown anyway
  if (room.phase === 'draft' || room.phase === 'wheel' || room.phase === 'pick') {
    startLocalCountdown();
  }

  // If wheel is currently animating, don't let room_update switch the UI layout
  if (state.wheelSpinning) {
    syncTurnUI();
    return;
  }

  if (room.phase === 'lobby') {
    showScreen('screen-lobby');
    updateLobbyUI();
  } else if (room.phase === 'draft' || room.phase === 'wheel' || room.phase === 'pick') {
    showScreen('screen-draft');
    updateDraftUI();
  } else if (room.phase === 'eval') {
    showScreen('screen-eval');
    updateEvalUI();
  }
});


socket.on('game_started', (room) => {
  state.room = room;
  showScreen('screen-draft');
  updateDraftUI();
  showToast('🎮 遊戲開始！排好你的選秀順序！');
});

socket.on('wheel_start_spin', ({ team, roomSnapshot }) => {
  state.room = roomSnapshot;
  state.wheelSpinning = true; // Block room_update from switching UI during animation
  
  // Sync the mask overlay immediately to show spinning state
  syncTurnUI();

  // Locate the canvas Lucky Wheel instance and trigger spinning
  const canvas = $('#wheel-canvas');
  if (state.wheel) {
    const btnSpin = $('#btn-spin');
    if (btnSpin) btnSpin.disabled = true;
    canvas.classList.add('spinning');
    state.wheel.spinTo(team);
  } else {
    // Wheel not ready: init now then spin
    state.wheel = new LuckyWheel(canvas, roomSnapshot.availableTeams, (t) => onSpinStopped(t));
    state.wheel._teamsKey = (roomSnapshot.availableTeams || []).map(t => t.abbreviation).join(',');
    state.wheel.spinTo(team);
  }
});

socket.on('afk_penalty_trigger', ({ playerName, teamName, playerNameAssigned, logo }) => {
  showToast(`🚨 超時懲罰！${playerName} 超時未操作，自動指派 [${logo} ${teamName}] 中 PTS 最差球員：${playerNameAssigned}！`);
});

socket.on('auto_respin_alert', ({ teamName, logo }) => {
  showToast(`⚠️ ${logo} ${teamName} 已無可用球員，轉盤正在自動重轉...`);
});

socket.on('blind_reveal', ({ playerName, realName, realTeam, blindId }) => {
  // Find modern/legend logo
  const logo = NBA_TEAMS.find(t => t.abbreviation === getModernEquivalent(realTeam))?.logo || '🏀';
  showToast(`🕵️ 揭曉！${playerName} 盲選了：${logo} ${realName} (${realTeam})`);
});

socket.on('ai_evaluating', () => {
  state.isEvaluating = true;
  $('#eval-actions').classList.add('hidden');
  $('#eval-loading').classList.remove('hidden');
  $('#eval-result').classList.add('hidden');
  $('#btn-replay').classList.add('hidden');
});

socket.on('eval_result', (evaluationText) => {
  state.isEvaluating = false;
  $('#eval-loading').classList.add('hidden');
  
  const resultDiv = $('#eval-result');
  resultDiv.innerHTML = window.marked.parse(evaluationText);
  resultDiv.classList.remove('hidden');
  
  $('#btn-replay').classList.remove('hidden');
  fireConfetti();
});

socket.on('eval_error', (errorMsg) => {
  state.isEvaluating = false;
  $('#eval-loading').classList.add('hidden');
  $('#eval-actions').classList.remove('hidden');
  showToast(`❌ ${errorMsg}`);
});

socket.on('error_message', (msg) => {
  showToast(msg);
});

socket.on('rejoin_failed', () => {
  localStorage.removeItem('nba_room_id');
  localStorage.removeItem('nba_player_name');
  state.roomId = null;
  state.playerName = null;
  showScreen('screen-setup');
});

// ── Start Game Room Logic ──────────────────
function createRoom() {
  const nameInput = $('#create-player-name');
  const modeSelect = $('#create-mode');
  const yearInput = $('#create-year');
  const banStars = $('#create-ban-stars');
  const rookieOnly = $('#create-rookie-only');
  const blindSubmodeSelect = $('#create-blind-submode');
  const decadeSelect = $('#create-decade');

  const playerName = nameInput.value.trim();
  if (!playerName) {
    alert('請輸入玩家暱稱！');
    return;
  }

  socket.emit('create_room', {
    settings: {
      mode: modeSelect.value,
      year: yearInput.value,
      banAllStars: banStars.checked,
      rookieOnly: rookieOnly.checked,
      blindSubmode: blindSubmodeSelect.value,
      decade: decadeSelect.value
    },
    playerName
  });
}

function joinRoom() {
  const nameInput = $('#join-player-name');
  const roomInput = $('#join-room-id');

  const playerName = nameInput.value.trim();
  const roomId = roomInput.value.trim().toUpperCase();

  if (!playerName || !roomId) {
    alert('請輸入暱稱與4位數房號！');
    return;
  }

  socket.emit('join_room', { roomId, playerName });
}

function copyRoomCode() {
  if (!state.roomId) return;
  navigator.clipboard.writeText(state.roomId).then(() => {
    showToast('📋 房號複製成功！');
  });
}

function startDraft() {
  if (!state.roomId) return;
  socket.emit('start_game', { roomId: state.roomId });
}

// ── Lobby UI ───────────────────────────────
function updateLobbyUI() {
  const room = state.room;
  if (!room) return;

  $('#lobby-room-code').textContent = room.id;
  
  // Format settings text
  const modeLabels = {
    wheel: '🎪 轉盤選秀模式',
    legend_wheel: '🎪 傳奇隊史轉盤',
    '15usd': '💵 經典 15 元選秀',
    legend_15usd: '👑 歷史傳奇 15 元選秀',
    salary_cap: '⚖️ 薪資上限挑戰模式',
    salary_cap_legend: '🪐 薪資上限 + 傳奇球星模式',
    blind: '🕵️ 盲選數據模式'
  };

  $('#lobby-setting-mode').textContent = modeLabels[room.settings.mode] || room.settings.mode;

  if (room.settings.mode === 'legend_wheel') {
    $('#lobby-setting-year').textContent = '跨時空隊史';
  } else if (room.settings.mode === 'blind' && room.settings.blindSubmode === 'decade') {
    const decadeLabels = {
      '1980s': '1980 年代',
      '1990s': '1990 年代',
      '2000s': '2000 年代',
      '2010s': '2010 年代',
      '2020s': '2020 年代'
    };
    $('#lobby-setting-year').textContent = decadeLabels[room.settings.decade] || room.settings.decade;
  } else {
    $('#lobby-setting-year').textContent = `${room.settings.year} 年`;
  }
  $('#lobby-setting-stars').textContent = room.settings.banAllStars ? '禁止明星賽球員' : '無限制';
  $('#lobby-setting-rookie').textContent = room.settings.rookieOnly ? '僅限新秀合約' : '無限制';

  const container = $('#lobby-players-container');
  container.innerHTML = '';

  room.players.forEach(p => {
    const isSelf = p.name === state.playerName;
    container.innerHTML += `
      <div class="flex items-center justify-between p-3.5 bg-card/60 border ${isSelf ? 'border-purple-500' : 'border-purple-950'} rounded-lg">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">${p.isOnline ? '🟢' : '⚪'}</span>
          <div>
            <span class="font-bold text-sm ${isSelf ? 'text-purple-400' : 'text-gray-200'}">${p.name}</span>
            <span class="text-[10px] text-gray-500 block">${p.isOwner ? '👑 房主' : '👤 玩家'}</span>
          </div>
        </div>
        <span class="text-xs ${p.isOnline ? 'text-green-400 font-semibold' : 'text-gray-500'}">${p.isOnline ? '已連線' : '斷線中'}</span>
      </div>
    `;
  });

  $('#lobby-player-count').textContent = room.players.length;

  if (state.isOwner) {
    $('#lobby-owner-controls').classList.remove('hidden');
    $('#lobby-guest-message').classList.add('hidden');
    
    // Disable start button if room is empty (needs at least 1 player, though normally 1-4)
    $('#btn-lobby-start').disabled = room.players.length === 0;
  } else {
    $('#lobby-owner-controls').classList.add('hidden');
    $('#lobby-guest-message').classList.remove('hidden');
  }
}

// ── Draft UI ───────────────────────────────
function updateDraftUI() {
  const room = state.room;
  if (!room) return;

  const mode = room.settings.mode;

  // Active turn tracking
  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  if (!activePlayer) return;
  const isMyTurn = activePlayer.socketId === socket.id || activePlayer.name === state.playerName;

  // Render player name banner
  const turnBannerName = $('#draft-player-name');
  if (turnBannerName) {
    turnBannerName.textContent = activePlayer.name;
    turnBannerName.className = isMyTurn ? 'text-purple-400 font-black' : 'text-white';
  }

  const pickBadge = $('#draft-pick-badge');
  const currentPickNum = Math.floor(room.draftIndex / room.players.length) + 1;
  pickBadge.textContent = `${currentPickNum} / 5`;

  // Draw snake draft order list
  const flowOrderText = $('#draft-flow-order');
  flowOrderText.innerHTML = room.draftOrder.map((idx, orderIdx) => {
    const p = room.players[idx];
    const isCurrent = orderIdx === room.draftIndex;
    return `<span class="${isCurrent ? 'text-yellow-400 font-black underline' : 'text-gray-500'}">${p.name}</span>`;
  }).join(' → ');

  // Controls Visibility based on Mode & Phase
  const wheelPhasePanel = $('#draft-wheel-phase');
  const pickPhasePanel = $('#draft-pick-phase');
  const gridPhasePanel = $('#draft-grid-phase');
  const blindPhasePanel = $('#draft-blind-phase');

  wheelPhasePanel.classList.add('hidden');
  pickPhasePanel.classList.add('hidden');
  gridPhasePanel.classList.add('hidden');
  blindPhasePanel.classList.add('hidden');

  // Roster Panels Sidebar
  renderRosterPanels();

  if (mode === '15usd' || mode === 'legend_15usd') {
    gridPhasePanel.classList.remove('hidden');
    $('#draft-phase-label').textContent = isMyTurn ? '輪到你，挑選 5x5 表格球員！' : '等待對手挑選球員...';
    $('#draft-phase-label').style.color = 'var(--accent-hot)';
    render5x5Grid();
  } else if (mode === 'blind') {
    blindPhasePanel.classList.remove('hidden');
    $('#draft-phase-label').textContent = isMyTurn ? '輪到你，挑選盲選數據卡！' : '等待對手挑選數據卡...';
    $('#draft-phase-label').style.color = 'var(--accent-hot)';
    renderBlindResume();
  } else {
    // Wheel-based modes (wheel, salary_cap, salary_cap_legend)
    if (room.phase === 'draft' || room.phase === 'wheel') {
      wheelPhasePanel.classList.remove('hidden');
      $('#draft-phase-label').textContent = isMyTurn ? '輪到你，旋轉轉盤！' : '等待對手旋轉轉盤...';
      $('#draft-phase-label').style.color = 'var(--accent-hot)';

      $('#btn-spin').classList.remove('hidden');
      $('#btn-spin').disabled = !isMyTurn;
      $('#wheel-result').classList.add('hidden');

      // Setup/refresh LuckyWheel Canvas - only rebuild if teams changed or wheel not created
      const canvas = $('#wheel-canvas');
      const newTeamsKey = (room.availableTeams || []).map(t => t.abbreviation).join(',');
      const prevTeamsKey = state.wheel ? state.wheel._teamsKey : '';

      if (!state.wheelSpinning) {
        // Only touch the wheel when NOT animating
        if (!state.wheel || newTeamsKey !== prevTeamsKey) {
          if (state.wheel) state.wheel.destroy();
          state.wheel = new LuckyWheel(canvas, room.availableTeams, (team) => onSpinStopped(team));
          state.wheel._teamsKey = newTeamsKey;
        }
      }

    } else if (room.phase === 'pick') {
      pickPhasePanel.classList.remove('hidden');
      $('#draft-phase-label').textContent = `${room.currentTeam.logo} ${room.currentTeam.name}`;
      $('#draft-phase-label').style.color = room.currentTeam.secondaryColor;

      $('#pick-team-logo').textContent = room.currentTeam.logo;
      $('#pick-team-name').textContent = room.currentTeam.name;

      // Check if team legends selector toggle is available (Franchise Legends / Salary Cap Legend modes)
      const isLegendMode = mode === 'salary_cap_legend' || mode === 'wheel' && room.settings.mode === 'wheel'; // Wait, standard wheel doesn't toggle legends unless chosen Legendary Franchise Mode.
      
      // We will check: is it Legendary Franchise Mode?
      // Since Legendary Franchise Mode is represented by settings.mode === 'wheel' (wheel mode) OR settings.mode === 'salary_cap_legend', 
      // but standard wheel has no legends. 
      // Let's check: if mode is wheel, is it the Legendary Franchise Mode?
      // Yes, in our settings we had: mode: 'wheel' | 'salary_cap_legend' | '15usd' | 'legend_15usd' etc.
      // Wait, let's distinguish:
      // - Standard Wheel: settings.mode = 'wheel'
      // - Legendary Franchise Wheel: settings.mode = 'wheel' with a legend trigger? Or we had 'salary_cap_legend'?
      // Wait! The server had options: settings.mode = 'wheel', '15usd', 'legend_15usd', 'salary_cap', 'salary_cap_legend', 'blind'.
      // Wait, is there a "Legendary Franchise Wheel" mode distinct from "Standard Wheel"?
      // The user says:
      // "B. 傳奇球員模式 (Legendary Franchise Mode)
      //  - 包含轉盤與 15 元兩種玩法。"
      // So Legendary Franchise Mode has "15元傳奇版" (legend_15usd) and "傳奇轉盤" (which is legend wheel).
      // Let's check: in `create-mode` options, we have:
      // - `wheel`: 🎪 轉盤選秀模式
      // - `legend_15usd`: 👑 歷史傳奇 15 元選秀
      // - `salary_cap_legend`: 🪐 薪資上限 + 傳奇球星模式
      // Wait, where is the "Legendary Franchise Wheel"?
      // Let's add `legend_wheel` to the select option in `index.html` if it wasn't there. Ah! The select option in `index.html` is:
      // - `wheel`: 🎪 轉盤選秀模式 (標準年)
      // - `15usd`: 💵 經典 15 元選秀
      // - `legend_15usd`: 👑 歷史傳奇 15 元選秀
      // - `salary_cap`: ⚖️ 薪資上限挑戰模式
      // - `salary_cap_legend`: 🪐 薪資上限 + 傳奇球星模式
      // - `blind`: 🕵️ 盲選數據模式
      // If the mode is `salary_cap_legend` OR `wheel` (if chosen legendary franchise?), let's support toggling legends.
      // Wait, to support "Legendary Franchise Wheel", does standard `wheel` support legends?
      // "轉盤轉到某球隊時，可以選擇「任何歷史上曾經待過該球隊的球員」"
      // Wait, let's make it so that if mode is `salary_cap_legend` OR the mode is `wheel` (legend franchise wheel), we allow legends!
      // Actually, if we allow toggling legends in `salary_cap_legend` and standard `wheel` if the user wants legends, or we can treat standard `wheel` as standard year, and we can add a specific `legend_wheel` mode to support "Legendary Franchise Wheel" mode!
      // Yes! Let's check if the dropdown contains `legend_wheel`.
      // The dropdown options are: `wheel`, `15usd`, `legend_15usd`, `salary_cap`, `salary_cap_legend`, `blind`.
      // Wait! The dropdown says `wheel` (標準年) and `salary_cap_legend`. Let's support legends toggling in `salary_cap_legend` and if the mode is a legend mode.
      // What if we support legends toggling in BOTH `salary_cap_legend` and standard `wheel`? That way, if it is a wheel mode, players can toggle between standard roster and historical legends.
      // Yes, let's make the legend toggle container visible for `salary_cap_legend` and if the mode is a legendary franchise wheel mode.
      // Wait, let's look at `index.html`: `legend-toggle-container` is hidden. We can make it visible if the mode is `salary_cap_legend` or if the mode is `wheel` but they want legends. Actually, let's check:
      // If mode is `salary_cap_legend` or `wheel` (if chosen to include legends), we show the toggle!
      // Let's enable the legend toggle for `salary_cap_legend` and `wheel` mode. Wait, for standard `wheel` mode, is it legendary?
      // Yes! We can allow players to toggle in standard wheel mode too if they want legends, or we can just let them toggle. Let's make it visible for `salary_cap_legend` and `wheel`. That is extremely nice!
      
      const toggleContainer = $('#legend-toggle-container');
      if (mode === 'salary_cap_legend' || mode === 'wheel') {
        toggleContainer.classList.remove('hidden');
        // Retrieve rosters and legends for the spun team
        fetchTeamRosterAndLegends(room.currentTeam.abbreviation);
      } else {
        toggleContainer.classList.add('hidden');
        fetchTeamRosterOnly(room.currentTeam.abbreviation);
      }
    }
  }

  // Sync spectator mask and local countdown
  syncTurnUI();
  startLocalCountdown();
}

// ── Spin Stop Callback ─────────────────────
function onSpinStopped(team) {
  const room = state.room;
  if (!room) return;

  state.wheelSpinning = false; // Allow room_update to update UI again

  const canvas = $('#wheel-canvas');
  if (canvas) canvas.classList.remove('spinning');

  const btnSpin = $('#btn-spin');
  if (btnSpin) btnSpin.classList.add('hidden');
  const wheelResult = $('#wheel-result');
  if (wheelResult) wheelResult.classList.remove('hidden');
  
  const resultNameEl = $('#wheel-result-name');
  if (resultNameEl) {
    resultNameEl.textContent = `${team.logo} ${team.name}`;
    resultNameEl.style.color = team.secondaryColor || '#ffffff';
  }

  const phaseLabel = $('#draft-phase-label');
  if (phaseLabel) {
    phaseLabel.textContent = team.name;
    phaseLabel.style.color = team.secondaryColor || '#ffffff';
  }

  fireConfetti();

  // Active turn tracking
  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  const isMyTurn = activePlayer && (activePlayer.socketId === socket.id || activePlayer.name === state.playerName);

  // Notify server: animation done, switch to pick phase
  if (isMyTurn) {
    socket.emit('spin_done', { roomId: state.roomId });
  } else {
    // For spectators, if the server has already transitioned, update UI now
    if (room.phase === 'pick') {
      showScreen('screen-draft');
      updateDraftUI();
    }
  }
}

function spinWheel() {
  if (!state.roomId) return;
  socket.emit('spin_wheel_request', { roomId: state.roomId });
}

function enterPickPhase() {
  // Client transitions to pick phase locally and renders cards
  $('#draft-wheel-phase').classList.add('hidden');
  $('#draft-pick-phase').classList.remove('hidden');
  
  const room = state.room;
  if (room.settings.mode === 'salary_cap_legend' || room.settings.mode === 'wheel') {
    renderPickCards();
  } else {
    renderPickCards();
  }
}

// ── Fetch Roster Pools via Sockets ──────────
function fetchTeamRosterOnly(teamAbbr) {
  socket.emit('get_team_roster', { roomId: state.roomId, teamAbbr }, (roster) => {
    state.selectedTeamRoster = roster;
    state.selectedTeamLegends = [];
    state.activeRosterView = 'normal';
    renderPickCards();
  });
}

function fetchTeamRosterAndLegends(teamAbbr) {
  socket.emit('get_team_roster', { roomId: state.roomId, teamAbbr }, (roster) => {
    state.selectedTeamRoster = roster;
    
    // Fetch legends
    socket.emit('get_team_legends', { teamAbbr }, (legends) => {
      state.selectedTeamLegends = legends;
      renderPickCards();
    });
  });
}

function toggleRosterView(view) {
  state.activeRosterView = view;
  if (view === 'normal') {
    $('#btn-roster-normal').className = 'px-3 py-1.5 text-xs font-bold rounded bg-purple-600 text-white';
    $('#btn-roster-legend').className = 'px-3 py-1.5 text-xs font-semibold rounded text-gray-400';
  } else {
    $('#btn-roster-legend').className = 'px-3 py-1.5 text-xs font-bold rounded bg-purple-600 text-white';
    $('#btn-roster-normal').className = 'px-3 py-1.5 text-xs font-semibold rounded text-gray-400';
  }
  renderPickCards();
}

// ── Render standard list cards ─────────────
function renderPickCards() {
  const grid = $('#player-grid');
  grid.innerHTML = '';

  const activePool = state.activeRosterView === 'normal' ? state.selectedTeamRoster : state.selectedTeamLegends;
  const room = state.room;

  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  if (!activePlayer) return;
  const isMyTurn = activePlayer.socketId === socket.id || activePlayer.name === state.playerName;

  if (activePool.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 col-span-full text-center py-8">目前名單中無可用球員。</p>`;
    return;
  }

  activePool.forEach(p => {
    const isDrafted = room.draftedIds.includes(p.name);
    
    const card = document.createElement('button');
    card.className = 'player-btn relative flex flex-col items-center justify-between text-center';
    card.disabled = isDrafted || !isMyTurn;

    const posHTML = p.position.map(pos => `<span class="pos-badge">${pos}</span>`).join('');
    const allStarBadge = p.is_allstar ? `<span class="allstar-badge text-[10px] text-yellow-400 font-bold">⭐ All-Star</span>` : '';
    const rookieBadge = p.is_rookie ? `<span class="rookie-badge text-[10px] text-cyan-400 font-bold">👶 Rookie</span>` : '';
    
    const isLegend = !!p.is_legend;
    const statsHTML = `
      <div class="text-[10px] text-gray-400 mt-2 space-x-2">
        <span>場均: ${p.pts}分</span>
        <span>${p.trb}板</span>
        <span>${p.ast}助</span>
      </div>
    `;

    const salaryCap = SALARY_CAPS[room.settings.year] || 154647000;
    const salaryHTML = room.settings.mode.includes('salary_cap')
      ? `<div class="text-[11px] font-bold text-yellow-500 mt-1">薪資: $${p.salary.toLocaleString()}</div>`
      : '';

    card.innerHTML = `
      <div class="w-full">
        <div class="font-bold text-sm text-gray-200">${p.name}</div>
        <div class="text-[10px] text-gray-500 mt-0.5">${p.team} ${isLegend ? `(${p.year}巔峰)` : `(${room.settings.year}年)`}</div>
        <div class="flex items-center justify-center gap-1 mt-1 flex-wrap">
          ${posHTML} ${allStarBadge} ${rookieBadge}
        </div>
        ${statsHTML}
        ${salaryHTML}
      </div>
      <div class="tooltip">
        <div class="font-bold mb-1">${p.name}</div>
        <div>年度: ${isLegend ? p.year : room.settings.year}</div>
        <div>位置: ${p.position.join('/')}</div>
        ${p.is_allstar ? '<div>🌟 全明星球員</div>' : ''}
        ${p.is_rookie ? '<div>👶 新秀合約</div>' : ''}
        <div>🏀 PTS: ${p.pts} / TRB: ${p.trb} / AST: ${p.ast}</div>
        ${p.salary ? `<div>💰 薪水: $${p.salary.toLocaleString()}</div>` : ''}
      </div>
    `;

    if (!isDrafted && isMyTurn) {
      card.addEventListener('click', () => {
        socket.emit('draft_player_request', {
          roomId: state.roomId,
          playerSelection: {
            name: p.name,
            team: p.team,
            pts: p.pts,
            trb: p.trb,
            ast: p.ast,
            position: p.position,
            salary: p.salary,
            is_allstar: p.is_allstar,
            is_rookie: p.is_rookie,
            isLegend: isLegend,
            year: p.year
          }
        });
      });
    }

    grid.appendChild(card);
  });
}

// ── Render 5x5 Grid Mode ───────────────────
function render5x5Grid() {
  const room = state.room;
  if (!room || (room.sheetIndex === null && !room.dynamicGrid)) return;

  const gridsPool = room.settings.mode === 'legend_15usd' ? LEGENDS_5X5_GRIDS : ACTIVE_5X5_GRIDS;
  const gridData = room.dynamicGrid || gridsPool[room.sheetIndex];

  // Renders the 5x5 layout
  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  if (!activePlayer) return;
  const isMyTurn = activePlayer.socketId === socket.id || activePlayer.name === state.playerName;

  // Track budget
  const me = room.players.find(p => p.socketId === socket.id || p.name === state.playerName);
  const spent = me ? me.roster.reduce((sum, p) => sum + p.salary, 0) : 0;
  $('#grid-budget-display').textContent = `$${15 - spent} / $15`;

  const rowsContainer = $('#grid-rows-container');
  rowsContainer.innerHTML = '';

  // Render prices $5 down to $1
  for (let price = 5; price >= 1; price--) {
    const rowPlayers = gridData.filter(p => p.price === price);
    
    const rowEl = document.createElement('div');
    rowEl.className = 'grid grid-cols-6 gap-2 items-center';

    const priceBadge = document.createElement('div');
    priceBadge.className = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-display font-black text-center py-3 rounded-lg text-sm';
    priceBadge.textContent = `$${price}`;
    rowEl.appendChild(priceBadge);

    rowPlayers.forEach(p => {
      const isDrafted = room.draftedIds.includes(p.name);
      const btn = document.createElement('button');
      btn.className = 'player-btn py-2 text-xs flex flex-col justify-center items-center h-full';
      btn.disabled = isDrafted || !isMyTurn || (spent + price > 15);

      btn.innerHTML = `
        <div class="font-bold text-gray-200 leading-tight">${p.name}</div>
        <div class="text-[9px] text-gray-500 uppercase mt-0.5">${p.team} · ${p.positions.join('/')}</div>
        <div class="text-[9px] text-gray-400 mt-1">${p.pts}/${p.trb}/${p.ast}</div>
        <div class="tooltip">
          <div class="font-bold mb-1">${p.name}</div>
          <div>價格: $${price} / 位置: ${p.positions.join('/')}</div>
          <div>場均: ${p.pts}分 ${p.trb}板 ${p.ast}助</div>
          <div>球隊: ${p.team}</div>
        </div>
      `;

      if (!isDrafted && isMyTurn && (spent + price <= 15)) {
        btn.addEventListener('click', () => {
          socket.emit('draft_player_request', {
            roomId: state.roomId,
            playerSelection: p
          });
        });
      }

      rowEl.appendChild(btn);
    });

    rowsContainer.appendChild(rowEl);
  }
}

// ── Render Blind Resume Cards ─────────────
function renderBlindResume() {
  const room = state.room;
  if (!room || !room.blindPool) return;

  const activePlayerIdx = room.draftOrder[room.draftIndex];
  const activePlayer = room.players[activePlayerIdx];
  if (!activePlayer) return;
  const isMyTurn = activePlayer.socketId === socket.id || activePlayer.name === state.playerName;

  const container = $('#blind-cards-container');
  container.innerHTML = '';

  room.blindPool.forEach(p => {
    // Check if player realName has already been drafted
    const isDrafted = room.draftedIds.includes(p.realName);
    
    // Find who drafted him to reveal identity
    let draftedBy = null;
    room.players.forEach(player => {
      if (player.roster.some(r => r.name === p.realName)) {
        draftedBy = player.name;
      }
    });

    const card = document.createElement('button');
    card.className = `player-btn flex flex-col items-center justify-between text-center min-h-[140px] p-4 ${isDrafted ? 'border-purple-500/20' : 'border-purple-500/40'}`;
    card.disabled = isDrafted || !isMyTurn;

    if (isDrafted) {
      // Reveal name
      const logo = NBA_TEAMS.find(t => t.abbreviation === getModernEquivalent(p.realTeam))?.logo || '🏀';
      card.innerHTML = `
        <div class="w-full flex flex-col justify-center items-center h-full">
          <div class="text-2xl">${logo}</div>
          <div class="font-bold text-sm text-purple-400 mt-2">${p.realName}</div>
          <div class="text-[10px] text-gray-500 uppercase mt-0.5">${p.realTeam}</div>
          <div class="text-[10px] bg-purple-950/50 text-purple-300 border border-purple-500/10 px-2 py-0.5 rounded-full mt-2">被 ${draftedBy} 選擇</div>
        </div>
      `;
    } else {
      // Hide name, show statistics
      const posHTML = p.position.map(pos => `<span class="pos-badge">${pos}</span>`).join('');
      const starHTML = p.is_allstar ? '<span class="text-[10px] text-yellow-500 font-bold">⭐ Star</span>' : '';
      const rookieHTML = p.is_rookie ? '<span class="text-[10px] text-cyan-400 font-bold">👶 Rookie</span>' : '';

      const decadeTips = {
        '1980s': '1980年代球員',
        '1990s': '1990年代球員',
        '2000s': '2000年代球員',
        '2010s': '2010年代球員',
        '2020s': '2020年代球員'
      };
      const decadeText = p.decade ? `<div class="text-[10px] text-purple-400 mt-1 font-semibold">${decadeTips[p.decade] || p.decade}</div>` : '';

      card.innerHTML = `
        <div class="w-full flex flex-col justify-between h-full">
          <div class="text-xs font-semibold text-gray-400 tracking-wider">🕵️ 數據卡 ${p.blindId}</div>
          ${decadeText}
          <div class="flex flex-col my-3">
            <span class="text-lg font-black text-white">${p.pts} PTS</span>
            <span class="text-xs text-gray-400 mt-0.5">${p.trb} REB · ${p.ast} AST</span>
          </div>
          <div class="flex items-center justify-center gap-1 flex-wrap mt-1">
            ${posHTML} ${starHTML} ${rookieHTML}
          </div>
        </div>
      `;

      if (isMyTurn) {
        card.addEventListener('click', () => {
          socket.emit('draft_player_request', {
            roomId: state.roomId,
            playerSelection: { blindId: p.blindId }
          });
        });
      }
    }

    container.appendChild(card);
  });
}

// ── Render Live Sidebar Rosters ────────────
function renderRosterPanels() {
  const container = $('#roster-panels');
  container.innerHTML = '';

  const room = state.room;
  if (!room) return;

  const mode = room.settings.mode;

  room.players.forEach((player, idx) => {
    const isSelf = player.name === state.playerName;
    const activePlayerIdx = room.draftOrder[room.draftIndex];
    const isCurrentTurn = idx === activePlayerIdx;

    const panel = document.createElement('div');
    panel.className = `roster-panel glass-panel p-4 border transition-all ${isCurrentTurn ? 'border-purple-500 ring-1 ring-purple-500/20' : 'border-purple-950/60'}`;
    
    // Header labels (spent budgets or salaries)
    let extraHeaderHTML = '';
    if (mode === '15usd' || mode === 'legend_15usd') {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      extraHeaderHTML = `<span class="ml-auto text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">預算: $${spent} / $15</span>`;
    } else if (mode === 'salary_cap' || mode === 'salary_cap_legend') {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      const cap = SALARY_CAPS[room.settings.year] || 154647000;
      const pct = ((spent / cap) * 100).toFixed(0);
      extraHeaderHTML = `<span class="ml-auto text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">薪資: $${(spent / 1000000).toFixed(1)}M / ${(cap / 1000000).toFixed(1)}M (${pct}%)</span>`;
    } else {
      extraHeaderHTML = `<span class="ml-auto text-xs font-semibold px-2 py-1 rounded-lg bg-purple-950/50 text-purple-300 border border-purple-500/10">${player.roster.length} / 5</span>`;
    }

    const header = `
      <div class="flex items-center gap-2.5 mb-3">
        <span class="text-lg">${player.isOnline ? '🟢' : '⚪'}</span>
        <div>
          <div class="font-bold text-sm ${isSelf ? 'text-purple-400' : 'text-gray-200'}">${player.name}</div>
          <div class="text-[10px] text-gray-500">${isCurrentTurn ? '🔥 選擇中...' : '已就緒'}</div>
        </div>
        ${extraHeaderHTML}
      </div>
    `;

    let slotsHTML = '';
    for (let s = 0; s < 5; s++) {
      if (s < player.roster.length) {
        const p = player.roster[s];
        // Find team logo
        const teamLogo = NBA_TEAMS.find(t => t.abbreviation === getModernEquivalent(p.team))?.logo || '🏀';
        
        const priceText = (mode === '15usd' || mode === 'legend_15usd')
          ? `<span class="text-[10px] font-black text-yellow-400">$${p.salary}</span>`
          : (mode.includes('salary_cap') && p.salary)
          ? `<span class="text-[10px] text-yellow-500">$${(p.salary / 1000000).toFixed(1)}M</span>`
          : '';

        slotsHTML += `
          <div class="roster-card py-2.5 px-3 mb-2 flex items-center justify-between border border-purple-950 bg-card/40">
            <div>
              <div class="font-bold text-xs text-gray-200">${p.name}</div>
              <div class="text-[10px] text-gray-500 mt-0.5">${teamLogo} ${p.team} · ${p.position.join('/')} ${p.peak_year ? `(${p.peak_year}年)` : ''}</div>
            </div>
            <div class="text-right flex flex-col items-end gap-0.5">
              ${priceText}
              <span class="text-[10px] text-gray-400">${p.pts}/${p.trb}/${p.ast}</span>
            </div>
          </div>
        `;
      } else {
        slotsHTML += `<div class="roster-slot-empty py-4 text-xs">Pick ${s + 1}</div>`;
      }
    }

    panel.innerHTML = header + `<div class="space-y-1">${slotsHTML}</div>`;
    container.appendChild(panel);
  });
}

// ── Render Evaluation UI ───────────────────
function updateEvalUI() {
  const room = state.room;
  if (!room) return;

  const container = $('#eval-rosters');
  container.innerHTML = '';

  const mode = room.settings.mode;

  room.players.forEach(player => {
    const col = document.createElement('div');
    col.className = 'glass-panel p-5 border border-purple-950/60 bg-card/30 flex flex-col justify-between';
    
    let statsSummaryHTML = '';
    if (mode === '15usd' || mode === 'legend_15usd') {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      statsSummaryHTML = `<div class="text-xs text-yellow-400 mt-1 font-semibold">總金額：$${spent} / $15</div>`;
    } else if (mode.includes('salary_cap')) {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      statsSummaryHTML = `<div class="text-xs text-yellow-500 mt-1 font-semibold">總薪資：$${spent.toLocaleString()}</div>`;
    }

    col.innerHTML = `
      <div>
        <div class="flex items-center gap-2.5 mb-4 pb-2 border-b border-purple-950">
          <span class="text-2xl">🏀</span>
          <div>
            <div class="font-bold text-white text-base">${player.name}</div>
            ${statsSummaryHTML}
          </div>
        </div>
        <div class="space-y-2.5">
          ${player.roster.map(p => {
            const logo = NBA_TEAMS.find(t => t.abbreviation === getModernEquivalent(p.team))?.logo || '🏀';
            return `
              <div class="roster-card py-2.5 px-3 border border-purple-950 bg-card/40">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-bold text-xs text-white">${p.name}</span>
                  <span class="text-[10px] text-gray-400">${logo} ${p.team} ${p.peak_year ? `(${p.peak_year})` : ''}</span>
                </div>
                <div class="text-[10px] text-gray-500 flex justify-between">
                  <span>${p.position.join('/')}</span>
                  <span>場均: ${p.pts} / ${p.trb} / ${p.ast}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    container.appendChild(col);
  });

  const evalActions = $('#eval-actions');
  const evalResult = $('#eval-result');
  const btnReplay = $('#btn-replay');
  const btnLeaveEval = $('#btn-leave-eval');

  if (room.evalResult) {
    evalActions.classList.add('hidden');
    evalResult.innerHTML = window.marked.parse(room.evalResult);
    evalResult.classList.remove('hidden');
    btnReplay.classList.remove('hidden');
    btnLeaveEval.classList.remove('hidden');
  } else {
    evalActions.classList.remove('hidden');
    evalResult.classList.add('hidden');
    btnReplay.classList.add('hidden');
    btnLeaveEval.classList.add('hidden');

    // Only owners can request AI evaluation
    const btnEvaluate = $('#btn-evaluate');
    if (state.isOwner) {
      btnEvaluate.disabled = false;
      btnEvaluate.textContent = '🤖 啟動 Gemini AI 戰力分析';
    } else {
      btnEvaluate.disabled = true;
      btnEvaluate.textContent = '等待房主啟動 AI 評估...';
    }
  }
}

function requestEvaluation() {
  if (!state.roomId) return;
  socket.emit('request_evaluation', { roomId: state.roomId });
}

function playAgain() {
  if (!state.roomId) return;
  socket.emit('play_again', { roomId: state.roomId });
}

function leaveRoom() {
  if (confirm('確定要離開此房間嗎？')) {
    const roomId = state.roomId;
    const playerName = state.playerName;
    
    // Clear local storage session
    localStorage.removeItem('nba_room_id');
    localStorage.removeItem('nba_player_name');
    state.roomId = null;
    state.playerName = null;
    state.room = null;
    state.isOwner = false;
    
    if (draftTimerInterval) {
      clearInterval(draftTimerInterval);
      draftTimerInterval = null;
    }
    
    // Notify server to leave room
    socket.emit('leave_room', { roomId, playerName });
    
    // Go back to setup screen
    showScreen('screen-setup');
  }
}

// ── Confetti Particle Effect ────────────────
function fireConfetti() {
  const container = $('#confetti-container');
  const colors = ['#8b5cf6', '#f59e0b', '#ef4444', '#34d399', '#3b82f6', '#f472b6', '#fbbf24'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.width = `${6 + Math.random() * 8}px`;
    piece.style.height = `${6 + Math.random() * 8}px`;
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 3500);
}

// ── Global Interface Exposure ───────────────
window.__app = {
  switchTab,
  createRoom,
  joinRoom,
  copyRoomCode,
  startDraft,
  spinWheel,
  enterPickPhase,
  toggleRosterView,
  requestEvaluation,
  playAgain,
  leaveRoom
};

// ── Setup Page Visibility Toggles ───────────
function updateSetupVisibility() {
  const mode = $('#create-mode').value;
  const blindSubmode = $('#create-blind-submode').value;

  // Blind sub-mode container
  const blindSubmodeContainer = $('#blind-submode-container');
  if (mode === 'blind') {
    blindSubmodeContainer.classList.remove('hidden');
  } else {
    blindSubmodeContainer.classList.add('hidden');
  }

  // Decade selector container
  const decadeSelectorContainer = $('#decade-selector-container');
  if (mode === 'blind' && blindSubmode === 'decade') {
    decadeSelectorContainer.classList.remove('hidden');
  } else {
    decadeSelectorContainer.classList.add('hidden');
  }

  // Year slider container (hidden for legend_15usd, legend_wheel, and blind decade)
  const yearSliderContainer = $('#year-slider-container');
  if (mode === 'legend_15usd' || mode === 'legend_wheel' || (mode === 'blind' && blindSubmode === 'decade')) {
    yearSliderContainer.classList.add('hidden');
  } else {
    yearSliderContainer.classList.remove('hidden');
  }
}

// Bind change events
$('#create-mode').addEventListener('change', updateSetupVisibility);
$('#create-blind-submode').addEventListener('change', updateSetupVisibility);

// Initial visibility check
updateSetupVisibility();
