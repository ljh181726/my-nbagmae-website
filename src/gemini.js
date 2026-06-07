const dotenv = require('dotenv');
dotenv.config();

// Queue for Gemini API requests to prevent HTTP 429 Rate Limit
const apiQueue = [];
let isProcessingQueue = false;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Minimal spacing between requests (in ms) - Reduced to 1500ms for gemini-3.1-flash-lite
const REQUEST_SPACING = 1500;

async function processQueue() {
  if (isProcessingQueue || apiQueue.length === 0) return;
  isProcessingQueue = true;

  while (apiQueue.length > 0) {
    const { room, resolve, reject } = apiQueue.shift();
    try {
      const result = await executeEvaluationWithFallback(room);
      resolve(result);
    } catch (err) {
      reject(err);
    }
    // Delay before the next request in queue
    if (apiQueue.length > 0) {
      await new Promise(r => setTimeout(r, REQUEST_SPACING));
    }
  }

  isProcessingQueue = false;
}

function queueEvaluation(room) {
  return new Promise((resolve, reject) => {
    apiQueue.push({ room, resolve, reject });
    processQueue();
  });
}

// Heuristic fallback that runs locally on the server without any API calls
function executeHeuristicEvaluation(room) {
  console.log(`🔌 Heuristic local evaluation fallback triggered for Room ${room.id}`);
  
  const summaries = room.players.map(player => {
    // Score based on stats: PTS + 1.2 * TRB + 1.5 * AST
    const score = player.roster.reduce((sum, p) => {
      return sum + (p.pts || 0) + 1.2 * (p.trb || 0) + 1.5 * (p.ast || 0);
    }, 0);
    return {
      name: player.name,
      score,
      rosterStr: player.roster.map(p => `${p.name} (${p.peak_year || room.settings.year}年 ${p.pts}分/${p.trb}板/${p.ast}助)`).join('、')
    };
  });

  // Declare winner
  summaries.sort((a, b) => b.score - a.score);
  const winner = summaries[0].name;
  const margin = summaries.length > 1 ? (summaries[0].score - summaries[1].score) : 0;
  const winProb = Math.min(95, Math.max(55, Math.round(60 + margin * 2)));

  const analysisRows = summaries.map(s => {
    return `* **${s.name}**：總體數據戰力分為 **${s.score.toFixed(1)}**。\n  陣容為：${s.rosterStr}`;
  }).join('\n');

  return `### 🤖 系統自動化戰力評估 (備用分析)

由於 AI 伺服器暫時無法連線，已啟動系統本地端數據比對分析：

#### 📊 戰力評分明細
${analysisRows}

#### 🏆 🏆 裁決結果
* **最終勝者 (WINNER)**: **${winner}** (勝出機率 ${winProb}%)
* **熱辣觀點 (Hot Take)**: 雖然 AI 連線超時，但體育數據是不會說謊的！從攻防基本面來看，${winner} 的數據累積更為紮實，順利贏下這場虛擬對決！`;
}

// Backup evaluation using a simplified short prompt (fast execution)
async function executeBackupEvaluation(room) {
  console.log(`🔌 Backup short Gemini prompt triggered for Room ${room.id}`);
  const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return executeHeuristicEvaluation(room);
  }

  const { settings, players } = room;
  const year = settings.year;

  const rosterSummaries = players.map(player => {
    const lines = player.roster.map(p => {
      const yStr = p.peak_year || year;
      return `  - ${p.name} (${yStr}年) [PTS: ${p.pts}, TRB: ${p.trb}, AST: ${p.ast}]`;
    }).join('\n');
    return `### 隊伍：${player.name}\n${lines}`;
  }).join('\n\n');

  const ratingContext = players.map(p => {
    const r = (room.ratings && room.ratings[p.name]) || {};
    return `### ${p.name} 的數據評分：進攻 ${r.offense || '--'}分 / 防守 ${r.defense || '--'}分 / 總評 ${r.overall || '--'}分`;
  }).join('\n');

  const systemPrompt = `你是一個嚴厲的名人堂傳奇總教練（擁有極度挑剔且毒舌的人設）。請使用「繁體中文」在 350 字內快速比較以下陣容，並判定勝負。
請嚴格根據房間設定的「基準年份」【${year} 年】（或球員巔峰期）的表現進行評估。
【評語規則】：
1. 必須參考以下提供的數據評分。若有隊伍總評低於 60 分，請無情地痛批他們（例如「這陣容簡直是防守提款機」或「進攻黑洞」）；若高於 90 分，給予肯定但語氣仍需保持嚴格的高標準（例如「這勉強能看，但防守還有一堆漏洞」）。
2. 提供簡短但具體的戰術建議。
3. 你的分析必須包含一個最終勝者 (WINNER) 及其勝出機率，以及一句毒舌熱辣觀點。`;

  const prompt = `【數據評分】\n${ratingContext}\n\n【選秀陣容】\n\n${rosterSummaries}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 512 }
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000); // 10-second short timeout

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(id);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Invalid format");
    }
  } catch (err) {
    clearTimeout(id);
    console.error("❌ Backup prompt failed:", err.message);
    return executeHeuristicEvaluation(room);
  }
}

async function executeEvaluationWithFallback(room) {
  try {
    return await executeEvaluation(room);
  } catch (err) {
    console.warn("⚠️ Primary Gemini evaluation failed. Trying backup evaluation...", err.message);
    return await executeBackupEvaluation(room);
  }
}

async function executeEvaluation(room) {
  const apiKey = GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server. Please set the GEMINI_API_KEY environment variable.');
  }

  const { settings, players } = room;
  const year = settings.year;
  const mode = settings.mode;

  // Build the roster details string for prompt
  const rosterSummaries = players.map(player => {
    const lines = player.roster.map(p => {
      const yearStr = p.peak_year ? `[Season: ${p.peak_year}年]` : `[Season: ${year}年]`;
      const statsStr = `PTS: ${p.pts}, TRB: ${p.trb}, AST: ${p.ast}`;
      const salaryStr = p.salary ? `Salary: $${p.salary.toLocaleString()}` : '';
      const rookieStr = p.is_rookie ? '[Rookie Contract]' : '';
      const allstarStr = p.is_allstar ? '[All-Star]' : '';
      const legendStr = p.is_legend ? `[Franchise Legend]` : '';
      return `  - ${p.name} (${p.position.join('/')}) [Team: ${p.team}] ${yearStr} — ${statsStr} ${salaryStr} ${rookieStr} ${allstarStr} ${legendStr}`;
    }).join('\n');
    return `### 隊伍：${player.name}\n${lines}`;
  }).join('\n\n');

  const ratingContext = players.map(p => {
    const r = (room.ratings && room.ratings[p.name]) || {};
    return `### ${p.name} 的數據評分：進攻 ${r.offense || '--'}分 / 防守 ${r.defense || '--'}分 / 總評 ${r.overall || '--'}分`;
  }).join('\n');

  const isLegendMode = mode === 'salary_cap_legend' || mode === 'legend_wheel';

  const systemPrompt = `你是一個極度挑剔、說話辛辣的名人堂傳奇總教練（HOF Head Coach）。你必須使用「繁體中文」來評估多個選秀隊伍的時空對決，並判定勝負。
請嚴格根據以下基準進行評估：
1. **標準年與盲選模式**：必須嚴格鎖定設定的年份：【${year} 年】！以該球員在該年份當季的真實數據、防守影響力和狀態評估，嚴禁將他過去或未來的榮譽或奪冠歷史納入。
2. **傳奇/薪資上限傳奇模式**：必須以「球隊巔峰期基準」進行評估。你必須在評語中明確提及並解析此細節。

評估與教練點評規範：
- **毒舌人設**：你是擁有無數冠軍戒指的名人堂教練，眼光極高，說話毫不客氣、犀利直接，充滿辛辣的體育吐槽（毒舌/Trash-talking）。絕對不准給予溫馨的安慰或空洞的鼓勵！
- **評分門檻規則（極重要）**：
  - 如果某支隊伍的【總評分 < 60 分】，必須嚴厲批評，吐槽他們是「公園業餘聯賽等級」、「防守提款機」或「進攻黑洞」，毫不留情。
  - 如果某支隊伍的【總評分 > 90 分】，可以給予肯定，但語氣仍然要是高標準的教練姿態，告訴他們「這陣容勉強符合 NBA 奪冠水準，但別高興太早，防守/輪替還是有隱憂」。
- **具體戰術建議**：你必須對每個隊伍給出具體且實用的戰術改善建議（例如：空間拉伸 Spacing 問題、球權分配問題、防守對位漏洞、誰該當核心進攻點、誰該去做髒活）。

格式要求：
- 使用 Markdown 標題、粗體與清單。
- 對每個隊伍進行 3-4 句的精闢分析。
- 宣布一個「最終勝者 (WINNER)」並給出勝出機率 (例如 65%)。
- 最後附上一個幽默風趣且極具殺傷力的「毒舌球評/熱辣觀點 (Hot Take)」。
- 字數嚴格控制在 600 字以內，語氣要生動、專業且具有十足的戲劇張力。`;

  const prompt = `【客觀數據評分】\n${ratingContext}\n\n【選秀陣容名單】\n\n${rosterSummaries}\n\n請根據以上選秀陣容進行${isLegendMode ? '歷史巔峰/跨時空' : year + '年'}的戰力評估與勝負判定。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: systemPrompt + "\n\n" + prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000); // 30-second timeout

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal
  });

  clearTimeout(id);

  if (res.status === 429) {
    throw new Error('Gemini API Rate Limit Exceeded (429).');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (Status ${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
    return data.candidates[0].content.parts[0].text;
  } else {
    throw new Error('Invalid response format.');
  }
}

module.exports = {
  queueEvaluation
};
