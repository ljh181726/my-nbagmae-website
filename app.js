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

const _savedProfile = (() => {
  try { return JSON.parse(sessionStorage.getItem('nba_user_profile')); } catch { return null; }
})();

const state = {
  roomId: sessionStorage.getItem('nba_room_id') || null,
  playerName: sessionStorage.getItem('nba_player_name') || (_savedProfile ? _savedProfile.name : null),
  isOwner: false,
  room: null,
  activeRosterView: 'normal', // 'normal' | 'legend'
  wheel: null,
  wheelSpinning: false,       // true while wheel animation is running
  selectedTeamRoster: [], // Current roster available for drafting in Pick phase
  selectedTeamLegends: [], // Legends list for Relocated franchises / Legend mode
  isEvaluating: false,
  user: _savedProfile || null,
  unlockedLevel: _savedProfile ? (_savedProfile.unlockedLevel || 1) : parseInt(localStorage.getItem('pve_unlocked_level') || '1'),
  isPVE: false,
  currentPVELevelId: null,
  typewriterInterval: null,
  isProcessingPick: false
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
    // Hide the mask during wheel spinning so spectators can watch the animation
    if (room.roomState === 'WHEEL_SPINNING' || state.wheelSpinning) {
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

  sessionStorage.setItem('nba_room_id', roomId);
  sessionStorage.setItem('nba_player_name', state.playerName);

  if (room.isPVE) {
    socket.emit('start_game', { roomId });
  } else {
    showScreen('screen-lobby');
    updateLobbyUI();
  }
});

socket.on('room_update', (room) => {
  state.isProcessingPick = false;
  const oldRoom = state.room;
  state.room = room;
  
  // Find self to check ownership and recover/store name
  const me = room.players.find(p => p.socketId === socket.id || p.name === state.playerName);
  if (me) {
    state.isOwner = me.isOwner;
    state.playerName = me.name;
    state.roomId = room.id;
    sessionStorage.setItem('nba_room_id', room.id);
    sessionStorage.setItem('nba_player_name', me.name);
  }

  // Update timer countdown anyway
  if (room.phase === 'draft' || room.phase === 'wheel' || room.phase === 'pick') {
    startLocalCountdown();
  }

  // If draftIndex has changed or phase transitioned, any local wheel spinning state is obsolete
  const turnChanged = oldRoom && (oldRoom.draftIndex !== room.draftIndex || oldRoom.phase !== room.phase);
  if ((turnChanged || room.phase === 'pick') && state.wheelSpinning) {
    state.wheelSpinning = false;
    if (state.wheel) {
      state.wheel.destroy();
      state.wheel.spinning = false;
    }
    const canvas = $('#wheel-canvas');
    if (canvas) canvas.classList.remove('spinning');
  }

  // If wheel is currently animating, don't let room_update switch the UI layout
  if (state.wheelSpinning) {
    syncTurnUI();
    return;
  }

  if (room.phase === 'lobby') {
    if (state.typewriterInterval) {
      clearInterval(state.typewriterInterval);
      state.typewriterInterval = null;
    }
    showScreen('screen-lobby');
    updateLobbyUI();
  } else if (room.phase === 'draft' || room.phase === 'wheel' || room.phase === 'pick') {
    showScreen('screen-draft');
    updateDraftUI();
  } else if (room.phase === 'eval') {
    showScreen('screen-eval');
    updateEvalUI();
    if (state.user && state.user.provider !== 'guest') {
      if (state.processedRoomId !== room.id) {
        state.processedRoomId = room.id;
        handleGameEndStats(room);
      }
    }
  }
});


socket.on('game_started', (room) => {
  state.isProcessingPick = false;
  state.room = room;
  showScreen('screen-draft');
  updateDraftUI();
  showToast('🎮 遊戲開始！排好你的選秀順序！');

  // Display pre-ban results if applicable
  if (state.user && room.preBanResults && room.preBanResults[state.playerName]) {
    const res = room.preBanResults[state.playerName];
    if (res.balance !== undefined) {
      state.user.virtual_currency = res.balance;
      updateOAuthUI();
    }
    if (res.successful && res.successful.length > 0) {
      showToast(`⚔️ 成功禁用球員：${res.successful.join('、')}，扣除 💰 ${res.spent} 元。`);
    }
    if (res.failed && res.failed.length > 0) {
      showToast(`⚠️ 餘額不足以禁用：${res.failed.join('、')}。`);
      // Update coach settings critique to show poverty roast
      const roasts = [
        "連全明星的禁用費都付不起？看來你除了球技不及格，連錢包都很骨感，還不快滾去多刷幾場 PVE 賺錢！",
        "想要預防針卻買不起？錢包空空還想學人家玩禁用。老老實實去 PVE 模式搬磚刷幣吧，別在這裡丟人現眼了！",
        "沒錢還敢設定預先禁用？當這裡是慈善機構？回去看看你的餘額，連一個一般球員的禁用費都快出不起了！"
      ];
      state.user.coach_critique = roasts[0];
      const critiqueEl = $('#coach-settings-critique');
      if (critiqueEl) {
        critiqueEl.textContent = roasts[0];
      }
    }
  }
});

socket.on('wheel_start_spin', ({ team, roomSnapshot }) => {
  state.room = roomSnapshot;
  state.wheelSpinning = true; // Block room_update from switching UI during animation
  
  // Sync the mask overlay immediately to show spinning state
  syncTurnUI();

  // Locate the canvas Lucky Wheel instance and trigger spinning
  const canvas = $('#wheel-canvas');
  
  // Always recreate the LuckyWheel instance to ensure we use the latest available teams list
  if (state.wheel) {
    state.wheel.destroy();
  }
  
  state.wheel = new LuckyWheel(canvas, roomSnapshot.availableTeams, (t) => onSpinStopped(t));
  state.wheel._teamsKey = (roomSnapshot.availableTeams || []).map(t => t.abbreviation).join(',');
  
  const btnSpin = $('#btn-spin');
  if (btnSpin) btnSpin.disabled = true;
  canvas.classList.add('spinning');
  
  // Safety check: if the team is missing in the available teams, trigger fallback
  const targetIndex = roomSnapshot.availableTeams.findIndex(t => t.abbreviation === team.abbreviation);
  if (targetIndex === -1) {
    console.warn(`⚠️ Team ${team.abbreviation} not found in availableTeams! Ending spin...`);
    setTimeout(() => {
      onSpinStopped(team);
    }, 500);
  } else {
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
  resultDiv.innerHTML = '';
  resultDiv.classList.remove('hidden');
  
  const btnReplay = $('#btn-replay');
  const btnLeaveEval = $('#btn-leave-eval');
  if (btnReplay) btnReplay.classList.add('hidden');
  if (btnLeaveEval) btnLeaveEval.classList.add('hidden');

  if (state.typewriterInterval) {
    clearInterval(state.typewriterInterval);
    state.typewriterInterval = null;
  }

  let i = 0;
  const speed = 20; // ms per tick
  const stepSize = 4; // characters per tick for smooth yet fast typing
  
  state.typewriterInterval = setInterval(() => {
    i += stepSize;
    if (i >= evaluationText.length) {
      i = evaluationText.length;
      clearInterval(state.typewriterInterval);
      state.typewriterInterval = null;
      
      resultDiv.innerHTML = window.marked.parse(evaluationText);
      if (btnReplay) btnReplay.classList.remove('hidden');
      if (btnLeaveEval) btnLeaveEval.classList.remove('hidden');
      fireConfetti();
    } else {
      resultDiv.innerHTML = window.marked.parse(evaluationText.substring(0, i));
    }
    // Scroll container/window to the bottom smoothly
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, speed);
});

socket.on('eval_error', (errorMsg) => {
  state.isEvaluating = false;
  $('#eval-loading').classList.add('hidden');
  $('#eval-actions').classList.remove('hidden');
  showToast(`❌ ${errorMsg}`);
});

socket.on('error_message', (msg) => {
  state.isProcessingPick = false;
  showToast(msg);
});

socket.on('user_update', (user) => {
  if (state.user && state.user.uid === user.uid) {
    state.user = user;
    updateOAuthUI();
  }
});

socket.on('rejoin_failed', () => {
  sessionStorage.removeItem('nba_room_id');
  sessionStorage.removeItem('nba_player_name');
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
  const allStarCapInput = $('#create-allstar-cap');
  const rookieFloorInput = $('#create-rookie-floor');

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
      decade: decadeSelect.value,
      allStarCap: parseInt(allStarCapInput.value) !== undefined ? parseInt(allStarCapInput.value) : 5,
      rookieFloor: parseInt(rookieFloorInput.value) !== undefined ? parseInt(rookieFloorInput.value) : 0
    },
    playerName,
    uid: state.user ? state.user.uid : null
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

  socket.emit('join_room', { roomId, playerName, uid: state.user ? state.user.uid : null });
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
  let starsText = room.settings.banAllStars ? '禁止明星賽球員' : '無限制';
  if (room.settings.allStarCap !== undefined && room.settings.allStarCap !== 5) {
    starsText = `上限 ${room.settings.allStarCap} 人`;
  }
  $('#lobby-setting-stars').textContent = starsText;

  let rookieText = room.settings.rookieOnly ? '僅限新秀合約' : '無限制';
  if (room.settings.rookieFloor !== undefined && room.settings.rookieFloor !== 0) {
    rookieText = `下限 ${room.settings.rookieFloor} 人`;
  }
  $('#lobby-setting-rookie').textContent = rookieText;

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

  // Render PVE year / draft settings summary badge
  const settingsSummary = $('#draft-settings-summary');
  if (settingsSummary) {
    let year = room.settings.year || "未知年份";
    let allStarCapText = "無限制";
    let rookieFloorText = "0 人";
    
    if (room.isPVE && room.levelId) {
      const lvl = room.levelId;
      if (lvl >= 1 && lvl <= 10) {
        allStarCapText = "無上限";
        rookieFloorText = "0 人";
      } else if (lvl >= 11 && lvl <= 30) {
        allStarCapText = "最多 2 人";
        rookieFloorText = "至少 1 人";
      } else if (lvl >= 31 && lvl <= 45) {
        allStarCapText = "最多 3 人";
        rookieFloorText = "至少 1 人";
      } else if (lvl >= 46 && lvl <= 55) {
        allStarCapText = "最多 4 人";
        rookieFloorText = "至少 1 人";
      } else if (lvl >= 56 && lvl <= 60) {
        allStarCapText = "最多 5 人";
        rookieFloorText = "至少 1 人";
      }
    } else {
      const cap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
      const floor = room.settings.rookieFloor || 0;
      allStarCapText = cap >= 5 ? "無上限" : `最多 ${cap} 人`;
      rookieFloorText = floor === 0 ? "0 人" : `至少 ${floor} 人`;
    }
    settingsSummary.textContent = `📅 時空年份: ${year} 年 | ⭐ 全明星限制: ${allStarCapText} | 👶 新秀限制: ${rookieFloorText}`;
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
        } else {
          state.wheel.draw();
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

  // Notify server: animation done, switch to pick phase (with 1.5s delay to view the result)
  if (isMyTurn) {
    setTimeout(() => {
      socket.emit('spin_done', { roomId: state.roomId });
    }, 1500);
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

// ── Check Player Draft Eligibility ──────────
function checkPlayerDraftEligibility(room, activePlayer, p, priceOrSalary) {
  const isDrafted = room.draftedIds.includes(p.name);
  if (isDrafted) return { isDisabled: true, isConstraintDisabled: false };

  // Calculate constraints
  const remainingPicks = 5 - activePlayer.roster.length;
  const currentRookies = activePlayer.roster.filter(pr => pr.is_rookie).length;
  const rookieFloor = room.settings.rookieFloor || 0;
  const rookieDeficit = rookieFloor - currentRookies;
  const mustPickRookie = rookieDeficit > 0 && remainingPicks <= rookieDeficit;

  const currentAllStars = activePlayer.roster.filter(pr => pr.is_allstar).length;
  const allStarCap = room.settings.allStarCap !== undefined ? room.settings.allStarCap : 5;
  const cannotPickAllStar = currentAllStars >= allStarCap;

  // Check rookie constraint
  if (mustPickRookie && !p.is_rookie) {
    return { isDisabled: true, isConstraintDisabled: true };
  }

  // Check all-star constraint
  if (cannotPickAllStar && p.is_allstar) {
    return { isDisabled: true, isConstraintDisabled: true };
  }

  // Check budget constraint (only for 15usd modes)
  const mode = room.settings.mode;
  if (mode === '15usd' || mode === 'legend_15usd') {
    const spent = activePlayer.roster.reduce((sum, pr) => sum + pr.salary, 0);
    const maxAffordable = (15 - spent) - (remainingPicks - 1);
    
    // Check if safety net is active
    const gridsPool = mode === 'legend_15usd' ? LEGENDS_5X5_GRIDS : ACTIVE_5X5_GRIDS;
    const gridData = room.dynamicGrid || (room.sheetIndex !== null ? gridsPool[room.sheetIndex] : null);
    const affordableCount = gridData ? gridData.filter(pr => !room.draftedIds.includes(pr.name) && pr.price <= maxAffordable).length : 0;
    const isSafetyNetActive = (affordableCount < remainingPicks);

    if (!isSafetyNetActive && priceOrSalary > maxAffordable) {
      return { isDisabled: true, isConstraintDisabled: false };
    }
  } else if (mode.includes('salary_cap')) {
    // Salary cap mode budget
    const teamCap = SALARY_CAPS[room.settings.year] || 154647000;
    const spent = activePlayer.roster.reduce((sum, pr) => sum + pr.salary, 0);
    if (spent + priceOrSalary > teamCap) {
      return { isDisabled: true, isConstraintDisabled: false };
    }
  }

  return { isDisabled: false, isConstraintDisabled: false };
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
    card.className = 'player-btn relative flex flex-col items-center justify-between text-center min-h-[82px] py-3 px-2';
    const eligible = checkPlayerDraftEligibility(room, activePlayer, p, p.salary || 0);
    let isDisabled = eligible.isDisabled || !isMyTurn;
    card.disabled = isDisabled;
    if (eligible.isConstraintDisabled) {
      card.style.textDecoration = 'none';
      card.classList.add('opacity-40');
    }

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

    if (!isDisabled && isMyTurn) {
      card.addEventListener('click', () => {
        if (state.isProcessingPick) return;
        state.isProcessingPick = true;
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

  // Check safety net
  const remainingPicks = me ? 5 - me.roster.length : 5;
  const maxAffordable = (15 - spent) - (remainingPicks - 1);
  const affordableCount = gridData.filter(pr => !room.draftedIds.includes(pr.name) && pr.price <= maxAffordable).length;
  const isSafetyNetActive = (affordableCount < remainingPicks);

  const safetyAlert = $('#grid-safety-net-alert');
  if (safetyAlert) {
    if (isSafetyNetActive && isMyTurn) {
      safetyAlert.textContent = `⚠️ 剩餘低價球員不足，已啟動低保補貼機制（所有剩餘球員價格降為 $1）`;
      safetyAlert.classList.remove('hidden');
    } else {
      safetyAlert.classList.add('hidden');
    }
  }

  const rowsContainer = $('#grid-rows-container');
  rowsContainer.innerHTML = '';

  // Render prices $5 down to $1
  for (let price = 5; price >= 1; price--) {
    const rowPlayers = gridData.filter(p => p.price === price);
    
    const rowEl = document.createElement('div');
    rowEl.className = 'grid grid-cols-6 gap-2 items-stretch';

    const priceBadge = document.createElement('div');
    priceBadge.className = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-display font-black text-center rounded-lg text-sm flex items-center justify-center';
    priceBadge.textContent = `$${price}`;
    rowEl.appendChild(priceBadge);

    rowPlayers.forEach(p => {
      const isDrafted = room.draftedIds.includes(p.name);
      const isBanned = room.bannedPlayerNames && room.bannedPlayerNames.includes(p.name);
      
      const btn = document.createElement('button');
      btn.className = 'player-btn py-2 px-1 text-xs flex flex-col justify-center items-center h-full min-h-[58px]';

      if (isBanned) {
        btn.disabled = true;
        btn.classList.add('opacity-30');
        btn.innerHTML = `
          <div class="font-bold text-red-400 leading-tight">❌ 已禁用</div>
          <div class="text-[9px] text-gray-600 uppercase mt-0.5">${p.team} · ${p.positions ? p.positions.join('/') : ''}</div>
          <div class="tooltip">
            <div class="font-bold mb-1">${p.name}</div>
            <div class="text-red-400 font-bold">此球員已在帳號設定中被預先禁用</div>
          </div>
        `;
        rowEl.appendChild(btn);
        return;
      }

      const eligible = checkPlayerDraftEligibility(room, activePlayer, p, price);
      let isDisabled = eligible.isDisabled || !isMyTurn;
      btn.disabled = isDisabled;
      if (eligible.isConstraintDisabled) {
        btn.style.textDecoration = 'none';
        btn.classList.add('opacity-40');
      }

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

      if (!isDisabled && isMyTurn) {
        btn.addEventListener('click', () => {
          if (state.isProcessingPick) return;
          state.isProcessingPick = true;
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
          if (state.isProcessingPick) return;
          state.isProcessingPick = true;
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

  let playersToRender = [...room.players];
  if (room.isPVE && !playersToRender.some(p => p.isCPU)) {
    const levelConfig = pveLevels[room.levelId - 1];
    if (levelConfig) {
      playersToRender.push({
        socketId: 'cpu_bot',
        name: `電腦 (${levelConfig.cpuTeamName})`,
        roster: levelConfig.cpuRoster,
        isOnline: true,
        isCPU: true
      });
    }
  }

  playersToRender.forEach((player, idx) => {
    const isSelf = player.name === state.playerName;
    const activePlayerIdx = room.draftOrder[room.draftIndex];
    const isCurrentTurn = room.isPVE ? (!player.isCPU) : (idx === activePlayerIdx);

    const panel = document.createElement('div');
    panel.className = `roster-panel glass-panel p-4 border transition-all ${isCurrentTurn ? 'border-purple-500 ring-1 ring-purple-500/20' : 'border-purple-950/60'}`;
    
    // Header labels (spent budgets or salaries)
    let extraHeaderHTML = '';
    if (player.isCPU) {
      extraHeaderHTML = `<span class="ml-auto text-xs font-bold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20">💻 電腦挑戰者</span>`;
    } else if (mode === '15usd' || mode === 'legend_15usd') {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      const limit = room.settings.budget || 15;
      extraHeaderHTML = `<span class="ml-auto text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/20">預算: $${spent} / $${limit}</span>`;
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
        <span class="text-lg">${player.isCPU ? '🤖' : (player.isOnline ? '🟢' : '⚪')}</span>
        <div>
          <div class="font-bold text-sm ${isSelf ? 'text-purple-400' : 'text-gray-200'}">${player.name}</div>
          <div class="text-[10px] text-gray-500">${player.isCPU ? '已準備就緒' : (isCurrentTurn ? '🔥 選擇中...' : '已就緒')}</div>
        </div>
        ${extraHeaderHTML}
      </div>
    `;

    let slotsHTML = '';
    for (let s = 0; s < 5; s++) {
      if (s < player.roster.length) {
        const p = player.roster[s];
        const teamLogo = NBA_TEAMS.find(t => t.abbreviation === getModernEquivalent(p.team))?.logo || '🏀';
        
        const priceText = (!player.isCPU && (mode === '15usd' || mode === 'legend_15usd'))
          ? `<span class="text-[10px] font-black text-yellow-400">$${p.salary}</span>`
          : (!player.isCPU && mode.includes('salary_cap') && p.salary)
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

  // Render PVE result banner
  const existingBanner = $('#pve-result-banner');
  if (existingBanner) existingBanner.remove();

  if (room.isPVE) {
    const banner = document.createElement('div');
    banner.id = 'pve-result-banner';
    banner.className = `w-full max-w-4xl text-center py-4 mb-6 rounded-xl font-display font-black text-xl border ${room.pveWin ? 'bg-green-500/20 border-green-500/40 text-green-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'bg-red-500/20 border-red-500/40 text-red-400 shadow-[0_0_15px_rgba(244,63,94,0.3)]'}`;
    
    let resultText = room.pveWin ? '🏆 挑戰成功 (VICTORY)！解鎖下一關卡' : '❌ 挑戰失敗 (DEFEAT)！請重試';
    if (room.pveWin && room.pveFirstClearAward) {
      resultText = `🏆 挑戰成功 (VICTORY)！解鎖下一關卡 (首通獲得 💰 ${room.pveFirstClearAward.coinsAwarded} 元虛擬幣！)`;
    }
    banner.textContent = resultText;
    container.parentNode.insertBefore(banner, container);

    // Save PVE level unlock
    if (room.pveWin) {
      const currentLevel = room.levelId;
      const nextLevel = currentLevel + 1;
      if (nextLevel > state.unlockedLevel) {
        state.unlockedLevel = nextLevel;
        localStorage.setItem('pve_unlocked_level', nextLevel);
        const pveProgressEl = $('#pve-user-progress');
        if (pveProgressEl) {
          pveProgressEl.textContent = `解鎖進度: ${state.unlockedLevel} / 60 關`;
        }
      }
    }
  }

  const animationTargets = [];

  room.players.forEach(player => {
    const col = document.createElement('div');
    col.className = 'glass-panel p-5 border border-purple-950/60 bg-card/30 flex flex-col justify-between';
    
    let statsSummaryHTML = '';
    if (player.isCPU) {
      statsSummaryHTML = `<div class="text-xs text-red-400 mt-1 font-semibold">💻 電腦關卡陣容</div>`;
    } else if (mode === '15usd' || mode === 'legend_15usd') {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      const limit = room.settings.budget || 15;
      statsSummaryHTML = `<div class="text-xs text-yellow-400 mt-1 font-semibold">總金額：$${spent} / $${limit}</div>`;
    } else if (mode.includes('salary_cap')) {
      const spent = player.roster.reduce((sum, p) => sum + p.salary, 0);
      statsSummaryHTML = `<div class="text-xs text-yellow-500 mt-1 font-semibold">總薪資：$${spent.toLocaleString()}</div>`;
    }

    const ratings = (room.ratings && room.ratings[player.name]) || { offense: 0, defense: 0, overall: 0 };
    
    function getRingHTML(score, label, strokeColor, key) {
      const radius = 20;
      const strokeWidth = 3;
      const circumference = 2 * Math.PI * radius;
      const safeName = player.name.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      const uniqueId = `${safeName}-${key}`;
      
      animationTargets.push({
        id: uniqueId,
        score
      });
      
      return `
        <div class="flex flex-col items-center">
          <div class="relative w-11 h-11 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90">
              <circle cx="22" cy="22" r="${radius}" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" fill="transparent" />
              <circle id="ring-${uniqueId}" cx="22" cy="22" r="${radius}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="transparent"
                      stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" stroke-linecap="round"
                      style="transition: stroke-dashoffset 1.5s cubic-bezier(0.1, 1, 0.1, 1);" />
            </svg>
            <span id="score-${uniqueId}" class="absolute text-[10px] font-black text-white">0</span>
          </div>
          <span class="text-[9px] text-gray-400 mt-1 font-semibold">${label}</span>
        </div>
      `;
    }

    const ratingsHTML = `
      <div class="flex items-center justify-around bg-purple-950/15 border border-purple-900/10 rounded-xl p-2.5 mb-4">
        ${getRingHTML(ratings.offense, '進攻', '#f43f5e', 'offense')}
        ${getRingHTML(ratings.defense, '防守', '#34d399', 'defense')}
        ${getRingHTML(ratings.overall, '總評', '#f59e0b', 'overall')}
      </div>
    `;

    col.innerHTML = `
      <div>
        <div class="flex items-center gap-2.5 mb-4 pb-2 border-b border-purple-950">
          <span class="text-2xl">${player.isCPU ? '🤖' : '🏀'}</span>
          <div>
            <div class="font-bold text-white text-base">${player.name}</div>
            ${statsSummaryHTML}
          </div>
        </div>
        ${ratingsHTML}
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

  // Trigger Ring & Score loading animations
  setTimeout(() => {
    animationTargets.forEach(target => {
      const circle = document.getElementById(`ring-${target.id}`);
      const text = document.getElementById(`score-${target.id}`);
      if (circle) {
        const circumference = 2 * Math.PI * 20;
        circle.style.strokeDashoffset = circumference * (1 - target.score / 100);
      }
      if (text) {
        let curr = 0;
        const step = Math.ceil(target.score / 30);
        const interval = setInterval(() => {
          curr += step;
          if (curr >= target.score) {
            curr = target.score;
            clearInterval(interval);
          }
          text.textContent = curr;
        }, 30);
      }
    });
  }, 100);

  const evalActions = $('#eval-actions');
  const evalResult = $('#eval-result');
  const btnReplay = $('#btn-replay');
  const btnLeaveEval = $('#btn-leave-eval');

  if (room.evalResult) {
    evalActions.classList.add('hidden');
    if (!state.typewriterInterval) {
      evalResult.innerHTML = window.marked.parse(room.evalResult);
      evalResult.classList.remove('hidden');
      btnReplay.classList.remove('hidden');
      btnLeaveEval.classList.remove('hidden');
    }
  } else {
    evalActions.classList.remove('hidden');
    evalResult.classList.add('hidden');
    btnReplay.classList.add('hidden');
    btnLeaveEval.classList.add('hidden');

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
    sessionStorage.removeItem('nba_room_id');
    sessionStorage.removeItem('nba_player_name');
    state.roomId = null;
    state.playerName = null;
    state.room = null;
    state.isOwner = false;
    
    if (draftTimerInterval) {
      clearInterval(draftTimerInterval);
      draftTimerInterval = null;
    }
    if (state.typewriterInterval) {
      clearInterval(state.typewriterInterval);
      state.typewriterInterval = null;
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

// ── Firebase Auth + Guest Mode ──────────────
let _firebaseApp = null;
let _firebaseAuth = null;
let _firestoreDb = null;

async function initFirebase() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    if (config.apiKey && typeof firebase !== 'undefined') {
      if (!_firebaseApp) {
        _firebaseApp = firebase.initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
          measurementId: config.measurementId
        });
      }
      _firebaseAuth = firebase.auth();
      _firestoreDb = firebase.firestore();
      console.log('✅ Firebase client and Firestore initialized');
    } else {
      console.warn('⚠️ Firebase config not available or SDK not loaded');
    }
  } catch (err) {
    console.error('Firebase init error:', err);
  }
}

async function loginWithGoogle() {
  if (!_firebaseAuth) {
    showToast('⚠️ 正在初始化 Firebase，請稍後再試...');
    await initFirebase();
    if (!_firebaseAuth) {
      showToast('❌ Firebase 尚未設定，請聯絡管理員。');
      return;
    }
  }

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    const result = await _firebaseAuth.signInWithPopup(provider);
    const idToken = await result.user.getIdToken();

    const res = await fetch('/api/auth/firebase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(`❌ 登入失敗：${data.error || '伺服器錯誤'}`);
      return;
    }

    state.user = data.user;
    loginSuccessActions();
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      showToast('ℹ️ 已取消 Google 登入');
    } else if (err.code === 'auth/popup-blocked') {
      showToast('⚠️ 彈窗被封鎖，請允許此網站開啟彈窗後再試。');
    } else {
      console.error('Google login error:', err);
      showToast(`❌ Google 登入失敗：${err.message}`);
    }
  }
}

async function loginAsGuest() {
  const guestName = '訪客_' + Math.floor(Math.random() * 9000 + 1000);
  try {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: guestName })
    });
    const data = await res.json();
    state.user = data.user;
    state.playerName = guestName;
    sessionStorage.setItem('nba_player_name', guestName);
    // Guests do NOT get saved to sessionStorage nba_user_profile
    const createNameEl = $('#create-player-name');
    const joinNameEl = $('#join-player-name');
    if (createNameEl) createNameEl.value = guestName;
    if (joinNameEl) joinNameEl.value = guestName;
    state.unlockedLevel = 1;
    updateOAuthUI();
    showToast(`👤 以訪客身份進入遊戲，進度不會儲存`);
  } catch (err) {
    console.error('Guest login error:', err);
    showToast('❌ 訪客模式初始化失敗');
  }
}

function loginSuccessActions() {
  state.playerName = state.user.name;
  sessionStorage.setItem('nba_player_name', state.playerName);
  sessionStorage.setItem('nba_user_profile', JSON.stringify(state.user));

  const createNameEl = $('#create-player-name');
  const joinNameEl = $('#join-player-name');
  if (createNameEl) createNameEl.value = state.playerName;
  if (joinNameEl) joinNameEl.value = state.playerName;

  state.unlockedLevel = state.user.unlockedLevel || 1;

  updateOAuthUI();
  showToast(`✅ 歡迎回來，${state.user.name}！`);
  triggerCheckIn();
}

// Auto-restore UI if session already has a profile
if (state.user) {
  setTimeout(() => {
    updateOAuthUI();
    const createNameEl = $('#create-player-name');
    const joinNameEl = $('#join-player-name');
    if (createNameEl) createNameEl.value = state.playerName;
    if (joinNameEl) joinNameEl.value = state.playerName;
  }, 100);
}

// Initialize Firebase and UI on load
initFirebase();
updateOAuthUI();



function updateOAuthUI() {
  const loggedOutEl = $('#oauth-logged-out');
  const loggedInEl = $('#oauth-logged-in');
  const settingsPanel = $('#account-settings-panel');
  if (state.user) {
    loggedOutEl.classList.add('hidden');
    loggedInEl.classList.remove('hidden');
    if (settingsPanel) settingsPanel.classList.remove('hidden');
    
    const guestLock = $('#guest-lock-overlay');
    const memberContent = $('#member-settings-content');
    const checkinGuestLock = $('#checkin-guest-lock');
    
    if (state.user.provider === 'guest') {
      if (guestLock) guestLock.classList.remove('hidden');
      if (memberContent) memberContent.classList.add('hidden');
      if (checkinGuestLock) checkinGuestLock.classList.remove('hidden');
      
      $('#user-avatar').src = state.user.avatar;
      $('#user-name').textContent = state.user.name;
      $('#badge-streak').textContent = `🔥 0天`;
      $('#user-points').textContent = `👤 訪客帳號`;
    } else {
      if (guestLock) guestLock.classList.add('hidden');
      if (memberContent) memberContent.classList.remove('hidden');
      if (checkinGuestLock) checkinGuestLock.classList.add('hidden');
      
      $('#user-avatar').src = state.user.avatar;
      $('#user-name').textContent = state.user.name;
      $('#badge-streak').textContent = `🔥 ${state.user.continuous_days || 0}天`;
      $('#user-points').textContent = `🪙 ${state.user.points || 0} 積分 | 💰 ${state.user.virtual_currency || 0} 元`;
      
      // Settings panel updates
      const coinsDisplay = $('#user-coins-display');
      const streakDisplay = $('#user-streak-display');
      if (coinsDisplay) coinsDisplay.textContent = `${state.user.virtual_currency || 0} 元`;
      if (streakDisplay) streakDisplay.textContent = `🔥 ${state.user.continuous_days || 0} 天`;
      
      // Generate sign-in streak progress bar (7 bubbles)
      const streakBar = $('#signin-streak-bar');
      if (streakBar) {
        streakBar.innerHTML = '';
        const currentStreak = state.user.continuous_days || 0;
        const todayStr = new Date().toISOString().split('T')[0];
        const isAlreadyCheckedIn = state.user.last_sign_in_date === todayStr;
        
        for (let day = 1; day <= 7; day++) {
          const bubble = document.createElement('div');
          bubble.className = 'streak-bubble';
          bubble.textContent = `D${day}`;
          if (day <= currentStreak) {
            bubble.classList.add('active');
          }
          if (day === currentStreak && isAlreadyCheckedIn) {
            bubble.classList.add('today');
          }
          if (day === currentStreak + 1 && !isAlreadyCheckedIn) {
            bubble.classList.add('today');
          }
          streakBar.appendChild(bubble);
        }
      }

      // Populate pre-bans inputs
      const prebans = state.user.pre_banned_players || [];
      for (let i = 0; i < 3; i++) {
        const teamInput = $(`#preban-team-${i+1}`);
        const jerseyInput = $(`#preban-jersey-${i+1}`);
        if (teamInput && (document.activeElement !== teamInput)) {
          teamInput.value = (prebans[i] && prebans[i].team) || '';
        }
        if (jerseyInput && (document.activeElement !== jerseyInput)) {
          jerseyInput.value = (prebans[i] && prebans[i].jersey) || '';
        }
      }

      // Update coach critique
      const critiqueEl = $('#coach-settings-critique');
      if (critiqueEl) {
        critiqueEl.textContent = state.user.coach_critique || '“你一個人都沒禁用？是準備空手套白狼，還是對自己的垃圾防守太有自信了？”';
      }
      
      const pveProgressEl = $('#pve-user-progress');
      if (pveProgressEl) {
        pveProgressEl.textContent = `解鎖進度: ${state.unlockedLevel} / 60 關`;
      }

      // Load Firestore career stats and highlights
      loadCareerStats();
      loadHighlights();
    }
  } else {
    loggedOutEl.classList.remove('hidden');
    loggedInEl.classList.add('hidden');
    if (settingsPanel) settingsPanel.classList.add('hidden');
  }
}

function logout() {
  state.user = null;
  state.playerName = 'Player 1';
  sessionStorage.removeItem('nba_player_name');
  sessionStorage.removeItem('nba_user_profile');
  
  const createNameEl = $('#create-player-name');
  const joinNameEl = $('#join-player-name');
  if (createNameEl) createNameEl.value = 'Player 1';
  if (joinNameEl) joinNameEl.value = 'Player 2';
  
  state.unlockedLevel = parseInt(localStorage.getItem('pve_unlocked_level') || '1');
  
  updateOAuthUI();
  
  // Clear preban inputs manually when logged out
  for (let i = 1; i <= 3; i++) {
    const t = $(`#preban-team-${i}`);
    const j = $(`#preban-jersey-${i}`);
    if (t) t.value = '';
    if (j) j.value = '';
  }
  
  showToast('👋 已成功登出。');
}

// ── Career Stats & Highlights & Leaderboard ──
async function loadCareerStats() {
  if (!state.user || state.user.provider === 'guest' || !_firestoreDb) return;
  try {
    const doc = await _firestoreDb.collection('users').doc(state.user.uid).get();
    let data = doc.exists ? doc.data() : {};
    
    const pve_games = data.pve_games || 0;
    const pve_wins = data.pve_wins || 0;
    const pvp_games = data.pvp_games || 0;
    const pvp_wins = data.pvp_wins || 0;
    const wheel_games = data.wheel_games || 0;
    const wheel_wins = data.wheel_wins || 0;

    const total_games = pve_games + pvp_games + wheel_games;
    const total_wins = pve_wins + pvp_wins + wheel_wins;
    const total_rate = total_games > 0 ? Math.round((total_wins / total_games) * 100) : 0;
    
    const pve_rate = pve_games > 0 ? Math.round((pve_wins / pve_games) * 100) : 0;
    const pvp_rate = pvp_games > 0 ? Math.round((pvp_wins / pvp_games) * 100) : 0;
    const wheel_rate = wheel_games > 0 ? Math.round((wheel_wins / wheel_games) * 100) : 0;

    const pveGamesEl = $('#stats-pve-games');
    const pveRateEl = $('#stats-pve-rate');
    const pvpGamesEl = $('#stats-pvp-games');
    const pvpRateEl = $('#stats-pvp-rate');
    const wheelGamesEl = $('#stats-wheel-games');
    const wheelRateEl = $('#stats-wheel-rate');
    const totalGamesEl = $('#stats-total-games');
    const totalRateEl = $('#stats-total-rate');

    if (pveGamesEl) pveGamesEl.textContent = `${pve_games} 場`;
    if (pveRateEl) pveRateEl.textContent = `(勝率 ${pve_rate}%)`;
    if (pvpGamesEl) pvpGamesEl.textContent = `${pvp_games} 場`;
    if (pvpRateEl) pvpRateEl.textContent = `(勝率 ${pvp_rate}%)`;
    if (wheelGamesEl) wheelGamesEl.textContent = `${wheel_games} 場`;
    if (wheelRateEl) wheelRateEl.textContent = `(勝率 ${wheel_rate}%)`;
    if (totalGamesEl) totalGamesEl.textContent = `${total_games} 場`;
    if (totalRateEl) totalRateEl.textContent = `(勝率 ${total_rate}%)`;
  } catch (err) {
    console.error('Error loading career stats:', err);
  }
}

async function loadHighlights() {
  if (!state.user || state.user.provider === 'guest' || !_firestoreDb) return;
  const container = $('#highlights-container');
  if (!container) return;
  
  try {
    const snapshot = await _firestoreDb.collection('users').doc(state.user.uid).collection('highlights').orderBy('timestamp', 'desc').limit(20).get();
    container.innerHTML = '';
    
    if (snapshot.empty) {
      container.innerHTML = '<p class="text-[10px] text-gray-500 italic">暫無 90分以上傳奇陣容存檔</p>';
      return;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const card = document.createElement('div');
      card.className = 'bg-purple-950/40 p-2 text-left rounded border border-purple-500/10 hover:border-purple-500/30 transition cursor-pointer space-y-1';
      card.onclick = () => showHighlightDetails(data);
      
      const rosterStr = (data.roster || []).map(p => p.name).join('、');
      card.innerHTML = `
        <div class="flex justify-between items-center text-[9px]">
          <span class="font-black text-yellow-400">🏆 傳奇得分: ${data.overall} 分</span>
          <span class="bg-purple-900 text-purple-300 px-1 rounded">${data.year}年</span>
        </div>
        <p class="text-[9px] text-gray-300 truncate">${rosterStr}</p>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading highlights:', err);
  }
}

async function saveHighlight(overall, roster, critique, year) {
  if (!state.user || state.user.provider === 'guest' || !_firestoreDb) return;
  try {
    await _firestoreDb.collection('users').doc(state.user.uid).collection('highlights').add({
      overall,
      roster,
      critique,
      year,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(`🌟 傳奇陣容存檔成功！已寫入 HOF 高光時刻 (總分 ${overall}分)。`);
    loadHighlights();
  } catch (err) {
    console.error('Error saving highlight:', err);
  }
}

function showHighlightDetails(data) {
  showScreen('screen-eval');
  const evalLoading = $('#eval-loading');
  const evalActions = $('#eval-actions');
  const btnReplay = $('#btn-replay');
  const btnLeaveEval = $('#btn-leave-eval');
  const resultDiv = $('#eval-result');

  if (evalLoading) evalLoading.classList.add('hidden');
  if (evalActions) evalActions.classList.add('hidden');
  if (btnReplay) btnReplay.classList.add('hidden');
  
  if (btnLeaveEval) {
    btnLeaveEval.classList.remove('hidden');
    btnLeaveEval.onclick = () => showScreen('screen-setup');
  }

  if (resultDiv) {
    resultDiv.innerHTML = '';
    resultDiv.classList.remove('hidden');
    
    const rosterStr = (data.roster || []).map(p => {
      return `* **${p.name}** (${p.position.join('/')}) [Team: ${p.team}] — PTS: ${p.pts}, TRB: ${p.trb}, AST: ${p.ast}`;
    }).join('\n');

    const content = `### 🌟 榮譽重播：總分 ${data.overall} 分傳奇高光
  
時空背景：西元 ${data.year} 年

#### 🏀 傳奇陣容球員：
${rosterStr}

---

#### 👨‍💼 總教練無情毒舌點評：
${data.critique}`;
    
    resultDiv.innerHTML = window.marked.parse(content);
  }
}

async function handleGameEndStats(room) {
  if (!_firestoreDb || !state.user || state.user.provider === 'guest') return;
  
  const myName = state.playerName;
  const isPVE = !!room.isPVE;
  let isWin = false;
  
  if (isPVE) {
    const player = room.players.find(p => p.socketId !== 'cpu_bot');
    const cpu = room.players.find(p => p.socketId === 'cpu_bot');
    if (player && cpu) {
      const playerOverall = room.ratings[player.name]?.overall || 0;
      const cpuOverall = room.ratings[cpu.name]?.overall || 0;
      isWin = playerOverall > cpuOverall;
    }
  } else {
    const maxOverall = Math.max(...room.players.map(p => room.ratings[p.name]?.overall || 0));
    isWin = (room.ratings[myName]?.overall || 0) === maxOverall;
  }
  
  try {
    const userRef = _firestoreDb.collection('users').doc(state.user.uid);
    const updateFields = {};
    if (isPVE) {
      updateFields.pve_games = firebase.firestore.FieldValue.increment(1);
      if (isWin) updateFields.pve_wins = firebase.firestore.FieldValue.increment(1);
    } else if (room.settings.mode === 'wheel' || room.settings.mode === 'legend_wheel') {
      updateFields.wheel_games = firebase.firestore.FieldValue.increment(1);
      if (isWin) updateFields.wheel_wins = firebase.firestore.FieldValue.increment(1);
    } else {
      updateFields.pvp_games = firebase.firestore.FieldValue.increment(1);
      if (isWin) updateFields.pvp_wins = firebase.firestore.FieldValue.increment(1);
    }
    
    await userRef.set(updateFields, { merge: true });
    console.log('✅ Career stats updated in Firestore');
    
    const myRatingObj = room.ratings[myName];
    if (myRatingObj && myRatingObj.overall >= 90) {
      const myRoster = room.players.find(p => p.name === myName)?.roster || [];
      setTimeout(() => {
        const critique = state.room?.evalResult || room.evalResult || '無點評資料';
        saveHighlight(myRatingObj.overall, myRoster, critique, room.settings.year || '跨時空');
      }, 3000);
    }
    
    setTimeout(() => {
      syncLeaderboardData();
      loadCareerStats();
    }, 2000);
    
  } catch (err) {
    console.error('Error handling game end stats:', err);
  }
}

async function syncLeaderboardData() {
  if (!state.user || state.user.provider === 'guest' || !_firestoreDb) return;
  try {
    const statsDoc = await _firestoreDb.collection('users').doc(state.user.uid).get();
    const statsData = statsDoc.exists ? statsDoc.data() : {};
    
    const pve_games = statsData.pve_games || 0;
    const pve_wins = statsData.pve_wins || 0;
    const pvp_games = statsData.pvp_games || 0;
    const pvp_wins = statsData.pvp_wins || 0;
    const wheel_games = statsData.wheel_games || 0;
    const wheel_wins = statsData.wheel_wins || 0;

    const total_games = pve_games + pvp_games + wheel_games;
    const total_wins = pve_wins + pvp_wins + wheel_wins;
    const win_rate = total_games > 0 ? (total_wins / total_games) : 0;
    
    const pve_clear_count = state.user.pve_cleared_stages ? state.user.pve_cleared_stages.length : 0;

    await _firestoreDb.collection('global_leaderboards').doc(state.user.uid).set({
      uid: state.user.uid,
      name: state.user.name || 'Anonymous',
      avatar: state.user.avatar || '',
      win_rate,
      virtual_currency: state.user.virtual_currency || 0,
      total_games,
      pve_clear_count,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log('✅ Leaderboard data synchronized');
  } catch (err) {
    console.error('Error syncing leaderboard data:', err);
  }
}

let currentLeaderboardMetric = 'win_rate';

async function openLeaderboard() {
  const modal = $('#modal-leaderboard');
  if (modal) modal.classList.remove('hidden');
  
  const guestLock = $('#leaderboard-guest-lock');
  if (state.user && state.user.provider === 'guest') {
    if (guestLock) guestLock.classList.remove('hidden');
    return;
  } else {
    if (guestLock) guestLock.classList.add('hidden');
  }
  
  switchLeaderboardTab('win_rate');
}

function closeLeaderboard() {
  const modal = $('#modal-leaderboard');
  if (modal) modal.classList.add('hidden');
}

async function switchLeaderboardTab(metric) {
  currentLeaderboardMetric = metric;
  
  const tabs = ['win_rate', 'virtual_currency', 'total_games', 'pve_clear_count'];
  const tabIds = {
    win_rate: 'winrate',
    virtual_currency: 'coins',
    total_games: 'games',
    pve_clear_count: 'pve'
  };
  
  tabs.forEach(t => {
    const btn = $(`#leaderboard-tab-${tabIds[t]}`);
    if (btn) {
      if (t === metric) {
        btn.className = 'flex-1 py-2 border-b-2 border-cyan-500 text-cyan-400';
      } else {
        btn.className = 'flex-1 py-2 border-b-2 border-transparent text-gray-400';
      }
    }
  });
  
  const listEl = $('#leaderboard-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="text-center py-6 text-gray-400 animate-pulse text-xs">⚡ 正在加載排行榜...</div>';
  
  try {
    const snapshot = await _firestoreDb.collection('global_leaderboards')
      .orderBy(metric, 'desc')
      .limit(50)
      .get();
      
    listEl.innerHTML = '';
    if (snapshot.empty) {
      listEl.innerHTML = '<p class="text-center text-gray-500 italic text-xs py-6">暫無排行榜數據</p>';
      return;
    }
    
    let rank = 1;
    snapshot.forEach(doc => {
      const data = doc.data();
      const div = document.createElement('div');
      
      let valStr = '';
      if (metric === 'win_rate') {
        valStr = `勝率 ${Math.round((data.win_rate || 0) * 100)}%`;
      } else if (metric === 'virtual_currency') {
        valStr = `💰 ${data.virtual_currency || 0} 元`;
      } else if (metric === 'total_games') {
        valStr = `${data.total_games || 0} 場`;
      } else if (metric === 'pve_clear_count') {
        valStr = `⚔️ ${data.pve_clear_count || 0} 關`;
      }
      
      const avatar = data.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(data.uid)}`;
      const isMe = state.user && state.user.uid === data.uid;
      
      div.className = `flex items-center justify-between p-2.5 rounded-lg border ${isMe ? 'bg-cyan-950/20 border-cyan-500/40' : 'bg-purple-950/20 border-purple-500/5'} text-xs`;
      
      let rankBadge = `<span class="w-5 font-black text-gray-400">${rank}</span>`;
      if (rank === 1) rankBadge = `<span class="w-5 text-lg">🥇</span>`;
      else if (rank === 2) rankBadge = `<span class="w-5 text-lg">🥈</span>`;
      else if (rank === 3) rankBadge = `<span class="w-5 text-lg">🥉</span>`;
      
      div.innerHTML = `
        <div class="flex items-center gap-2">
          ${rankBadge}
          <img class="w-6 h-6 rounded-full border border-purple-500/20 bg-purple-950/60" src="${avatar}" alt="" />
          <span class="font-bold text-gray-200 ${isMe ? 'text-cyan-300 font-extrabold' : ''}">${data.name}</span>
        </div>
        <span class="font-bold text-cyan-400">${valStr}</span>
      `;
      listEl.appendChild(div);
      rank++;
    });
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    listEl.innerHTML = '<p class="text-center text-red-400 text-xs py-6">❌ 排行榜載入失敗，請稍後重試。</p>';
  }
}


function triggerCheckIn() {
  if (!state.user) return;
  
  const checkinGuestLock = $('#checkin-guest-lock');
  if (state.user.provider === 'guest') {
    if (checkinGuestLock) checkinGuestLock.classList.remove('hidden');
    const modal = $('#modal-checkin');
    if (modal) modal.classList.remove('hidden');
    return;
  } else {
    if (checkinGuestLock) checkinGuestLock.classList.add('hidden');
  }
  
  const gridEl = $('#checkin-grid');
  gridEl.innerHTML = '';
  
  const currentStreak = state.user.continuous_days || 0;
  const todayStr = new Date().toISOString().split('T')[0];
  const isAlreadyCheckedIn = state.user.last_sign_in_date === todayStr;
  
  for (let day = 1; day <= 7; day++) {
    const card = document.createElement('div');
    card.className = 'checkin-day';
    
    let icon = '🪙';
    let reward = 3;
    if (day === 7) {
      icon = '🎁';
      reward += 10;
    }
    
    let status = 'locked';
    if (isAlreadyCheckedIn) {
      if (day <= currentStreak) status = 'claimed';
    } else {
      if (day <= currentStreak) status = 'claimed';
      else if (day === currentStreak + 1) status = 'ready';
    }
    
    if (status === 'claimed') {
      card.classList.add('claimed');
      card.innerHTML = `
        <span class="text-xs font-semibold text-gray-400">第 ${day} 天</span>
        <span class="text-xl my-1">✅</span>
        <span class="text-[10px] text-green-400">+${reward} 元</span>
      `;
    } else if (status === 'ready') {
      card.classList.add('ready');
      card.innerHTML = `
        <span class="text-xs font-bold text-yellow-400">第 ${day} 天</span>
        <span class="text-xl my-1 animate-bounce">${icon}</span>
        <span class="text-[10px] font-bold text-yellow-400">+${reward} 元</span>
      `;
    } else {
      card.innerHTML = `
        <span class="text-xs text-gray-500">第 ${day} 天</span>
        <span class="text-xl my-1 opacity-50">${icon}</span>
        <span class="text-[10px] text-gray-500">+${reward} 元</span>
      `;
    }
    
    gridEl.appendChild(card);
  }
  
  const statusMsgEl = $('#checkin-status-msg');
  const btnActionEl = $('#btn-checkin-action');
  
  // Display permanent passive status if cleared all 60 stages
  let passiveMsg = "";
  if (state.user.pve_cleared_stages && state.user.pve_cleared_stages.length >= 60) {
    passiveMsg = " (已解鎖全通關每日加成福利 +5 元！)";
  }

  if (isAlreadyCheckedIn) {
    statusMsgEl.textContent = `🎉 今日簽到成功！連續簽到第 ${currentStreak} 天${passiveMsg}`;
    btnActionEl.disabled = true;
    btnActionEl.textContent = '今日已領取';
    btnActionEl.className = 'w-full py-3 bg-gray-700 text-gray-400 font-bold rounded-xl cursor-not-allowed';
  } else {
    statusMsgEl.textContent = `💡 今日可簽到領取第 ${currentStreak + 1} 天獎勵！${passiveMsg}`;
    btnActionEl.disabled = false;
    btnActionEl.textContent = '🪙 立即簽到領取獎勵';
    btnActionEl.className = 'w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold rounded-xl shadow-lg transition';
  }
  
  $('#modal-checkin').classList.remove('hidden');
}

async function claimCheckIn() {
  if (!state.user) return;
  if (state.isCheckInRequesting) return;
  state.isCheckInRequesting = true;

  const btnActionEl = $('#btn-checkin-action');
  if (btnActionEl) {
    btnActionEl.disabled = true;
    btnActionEl.textContent = '⌛ 正在處理簽到...';
  }

  try {
    const res = await fetch('/api/users/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.user.uid })
    });
    const data = await res.json();
    if (data.success) {
      state.user = data.user;
      updateOAuthUI();
      triggerCheckIn();
      let passiveAlert = data.hasAllClearPassive ? " (包含全通關福利 +5 元)" : "";
      showToast(`🎁 簽到成功！獲得 💰 ${data.coinsGained} 元虛擬幣！${passiveAlert}`);
      fireConfetti();
      setTimeout(() => { syncLeaderboardData(); }, 1000);
    } else {
      showToast(`⚠️ ${data.message || '簽到失敗'}`);
      if (btnActionEl) {
        btnActionEl.disabled = false;
        btnActionEl.textContent = '🪙 立即簽到領取獎勵';
      }
    }
  } catch (err) {
    console.error('Check-in error:', err);
    showToast('❌ 簽到連線失敗');
    if (btnActionEl) {
      btnActionEl.disabled = false;
      btnActionEl.textContent = '🪙 立即簽到領取獎勵';
    }
  } finally {
    state.isCheckInRequesting = false;
  }
}

function closeCheckInModal() {
  $('#modal-checkin').classList.add('hidden');
}

let pveLevels = [];
async function showPVEMap() {
  state.isPVE = true;
  showScreen('screen-pve');
  
  const pveProgressEl = $('#pve-user-progress');
  if (pveProgressEl) {
    pveProgressEl.textContent = `解鎖進度: ${state.unlockedLevel} / 60 關`;
  }
  
  if (pveLevels.length === 0) {
    try {
      const res = await fetch('/api/pve/levels');
      const data = await res.json();
      pveLevels = data.levels;
    } catch (err) {
      console.error('Error fetching PVE levels:', err);
      showToast('❌ 無法加載關卡資料');
      return;
    }
  }
  
  renderPVEMap();
}

function renderPVEMap() {
  const container = $('#pve-chapters-container');
  container.innerHTML = '';
  
  const chapterNames = [
    "第一章：新手試煉 (1-10 關)",
    "第二章：分區季後挑戰 (11-20 關)",
    "第三章：白銀爭霸 (21-30 關)",
    "第四章：黃金沙場對決 (31-40 關)",
    "第五章：強權崛起 (41-50 關)",
    "第六章：名人堂傳奇王朝 (51-60 關)"
  ];
  
  for (let ch = 0; ch < 6; ch++) {
    const chapterCard = document.createElement('div');
    chapterCard.className = 'pve-chapter-card mb-6';
    
    const title = document.createElement('h3');
    title.className = 'text-base font-black text-purple-300 mb-4 border-b border-purple-950 pb-2';
    title.textContent = chapterNames[ch];
    chapterCard.appendChild(title);
    
    const grid = document.createElement('div');
    grid.className = 'pve-level-grid';
    
    const startLvl = ch * 10 + 1;
    const endLvl = (ch + 1) * 10;
    
    for (let l = startLvl; l <= endLvl; l++) {
      const levelData = pveLevels[l - 1];
      if (!levelData) continue;
      
      const node = document.createElement('div');
      node.className = 'pve-level-node';
      
      const isUnlocked = l <= state.unlockedLevel;
      const isCompleted = l < state.unlockedLevel;
      const isCurrent = l === state.unlockedLevel;
      
      node.textContent = l;
      
      if (isUnlocked) {
        node.classList.add('unlocked');
        if (isCompleted) {
          node.classList.add('completed');
          node.innerHTML = `<span>${l}</span><span class="text-[8px] text-green-400">★</span>`;
        } else if (isCurrent) {
          node.classList.add('current');
          node.innerHTML = `<span>${l}</span><span class="text-[8px] text-yellow-400 animate-pulse">⚔️</span>`;
        }
        node.onclick = () => openPVEModal(levelData);
      } else {
        node.classList.add('locked');
        node.innerHTML = `<span>${l}</span><span class="text-[9px] text-gray-500">🔒</span>`;
      }
      
      grid.appendChild(node);
    }
    
    chapterCard.appendChild(grid);
    container.appendChild(chapterCard);
  }
}

function openPVEModal(levelData) {
  state.currentPVELevelId = levelData.level;
  
  const chapterNames = [
    "第一章：新手試煉 (1-10 關)",
    "第二章：分區季後挑戰 (11-20 關)",
    "第三章：白銀爭霸 (21-30 關)",
    "第四章：黃金沙場對決 (31-40 關)",
    "第五章：強權崛起 (41-50 關)",
    "第六章：名人堂傳奇王朝 (51-60 關)"
  ];
  const lvl = levelData.level;
  const chapterIdx = Math.floor((lvl - 1) / 10);
  $('#pve-level-chapter').textContent = `章節：${chapterNames[chapterIdx] || '未知章節'}`;

  $('#pve-level-title').textContent = levelData.name;
  const cleanTeamName = levelData.cpuTeamName.replace(/^\d{4}\s*/, '');
  $('#pve-level-cpu-team').textContent = `${levelData.year} 年 ${cleanTeamName}`;
  $('#pve-level-difficulty').textContent = `${levelData.difficulty.toUpperCase()} / ${getModeChineseName(levelData.mode)}`;
  $('#pve-level-cpu-overall').textContent = levelData.ratings.overall;
  
  const rosterEl = $('#pve-level-roster');
  rosterEl.innerHTML = levelData.cpuRoster.map(p => {
    return `<div class="flex justify-between items-center py-1 border-b border-purple-950/20">
      <span>${p.position.join('/')} - <strong>${p.name}</strong></span>
      <span class="text-gray-400">${p.pts} PTS / ${p.trb} TRB / ${p.ast} AST</span>
    </div>`;
  }).join('');
  
  const limitsEl = $('#pve-level-limits');
  let limitDesc = '無特殊選秀限制。';
  if (levelData.restrictions) {
    const r = levelData.restrictions;
    const parts = [];
    if (r.allStarCap !== undefined) parts.push(`全明星上限: <strong class="text-yellow-400">${r.allStarCap} 人</strong>`);
    if (r.rookieFloor !== undefined) parts.push(`新秀下限: <strong class="text-cyan-400">${r.rookieFloor} 人</strong>`);
    if (r.budget !== undefined) parts.push(`選秀預算限制: <strong class="text-green-400">$${r.budget}</strong>`);
    if (parts.length > 0) limitDesc = parts.join(' | ');
  }
  limitsEl.innerHTML = limitDesc;
  
  $('#modal-pve-level').classList.remove('hidden');
}

function getModeChineseName(mode) {
  const map = {
    'wheel': '轉盤選秀',
    'legend_wheel': '傳奇隊史轉盤',
    '15usd': '經典 15 元選秀',
    'legend_15usd': '歷史傳奇 15 元選秀',
    'salary_cap': '薪資上限模式',
    'salary_cap_legend': '薪資上限+傳奇球星',
    'blind': '盲選模式'
  };
  return map[mode] || mode;
}

function closePVEModal() {
  $('#modal-pve-level').classList.add('hidden');
}

function goBackFromPVE() {
  state.isPVE = false;
  showScreen('screen-setup');
}

function startPVEGame() {
  closePVEModal();
  const settings = {
    isPVE: true,
    levelId: state.currentPVELevelId
  };
  const payload = {
    settings,
    playerName: state.playerName || '挑戰者',
    uid: state.user ? state.user.uid : null
  };
  socket.emit('create_room', payload);
}

async function savePreBans() {
  if (!state.user) {
    showToast('⚠️ 請先登入帳號！');
    return;
  }
  
  const pre_banned_players = [];
  const teamRegex = /^[A-Za-z]{3}$/;
  const jerseyRegex = /^#\d+$/;
  
  for (let i = 1; i <= 3; i++) {
    const team = $(`#preban-team-${i}`).value.trim();
    const jersey = $(`#preban-jersey-${i}`).value.trim();
    
    if (team || jersey) {
      if (!teamRegex.test(team) || !jerseyRegex.test(jersey)) {
        showToast(`❌ 欄位 ${i} 格式有誤！球隊為3字代碼 (如 BOS)，背號包含井字號 (如 #0)`);
        return;
      }
      pre_banned_players.push({ team: team.toUpperCase(), jersey });
    } else {
      pre_banned_players.push({ team: '', jersey: '' });
    }
  }
  
  try {
    const res = await fetch('/api/users/preban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: state.user.uid, pre_banned_players })
    });
    const data = await res.json();
    if (data.error) {
      showToast(`❌ ${data.error}`);
    } else {
      state.user = data.user;
      updateOAuthUI();
      showToast('✅ 禁用設定儲存成功！已更新教練點評。');
      setTimeout(() => { syncLeaderboardData(); }, 1000);
    }
  } catch (err) {
    console.error('Error saving pre-bans:', err);
    showToast('❌ 儲存失敗，請檢查網路連線。');
  }
}

function showPVPForm() {
  const pvpSection = $('#pvp-section');
  if (pvpSection.classList.contains('hidden')) {
    pvpSection.classList.remove('hidden');
    pvpSection.scrollIntoView({ behavior: 'smooth' });
  } else {
    pvpSection.classList.add('hidden');
  }
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
  leaveRoom,
  loginWithGoogle,
  loginAsGuest,
  logout,
  triggerCheckIn,
  claimCheckIn,
  closeCheckInModal,
  showPVEMap,
  renderPVEMap,
  openPVEModal,
  closePVEModal,
  goBackFromPVE,
  startPVEGame,
  showPVPForm,
  savePreBans,
  openLeaderboard,
  closeLeaderboard,
  switchLeaderboardTab
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

  // Wheel constraint sliders (shown for wheel, legend_wheel, salary_cap, salary_cap_legend)
  const wheelConstraintSliders = $('#wheel-constraint-sliders');
  if (wheelConstraintSliders) {
    if (mode === 'wheel' || mode === 'legend_wheel' || mode === 'salary_cap' || mode === 'salary_cap_legend') {
      wheelConstraintSliders.classList.remove('hidden');
    } else {
      wheelConstraintSliders.classList.add('hidden');
    }
  }
}

// Bind change events
$('#create-mode').addEventListener('change', updateSetupVisibility);
$('#create-blind-submode').addEventListener('change', updateSetupVisibility);

// Initial visibility check
updateSetupVisibility();
