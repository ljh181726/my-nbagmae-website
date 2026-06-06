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

  const systemPrompt = `你是一個精簡的 NBA 分析師。請使用「繁體中文」在 150 字內快速比較以下陣容，並判定勝負。
請嚴格根據房間設定的「基準年份」【${year} 年】（或球員巔峰期）的表現進行評估。
你的分析必須包含一個最終勝者 (WINNER) 及其勝出機率，以及一句簡短的毒舌熱辣觀點。`;

  const prompt = `【選秀陣容】\n\n${rosterSummaries}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 256 }
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

  const isLegendMode = mode === 'salary_cap_legend' || mode === 'legend_wheel';

  const systemPrompt = `你是一個頂尖的 NBA 戰術分析師與幽默的體育球評。你必須使用「繁體中文」來評估多個選秀隊伍的時空對決，並判定勝負。
請嚴格根據以下基準進行評估：
1. **標準年與盲選模式**：必須嚴格鎖定設定的年份：【${year} 年】！以該球員在該年份當季的真實數據、防守影響力和狀態評估，嚴禁將他過去或未來的榮譽或奪冠歷史納入。
2. **傳奇/薪資上限傳奇模式**：必須以「球隊巔峰期基準」進行評估。例如，如果選了魔術隊時期身手敏捷的 Shaq，就不能用湖人三連霸時期的低位破壞力或體重來評；反之，若選了湖人時期的 Shaq，則以防守禁區無敵的霸王狀態來評。你必須在評語中明確提及並解析此細節。

評估標準：
- **攻防平衡**：不能只看得分 (PTS)。必須綜合評估防守對位、護框、外線防守、籃板保護。
- **化學反應與球權分配**：評估球員適配度（例如是否有多名需要大量持球單打的球員導致球不夠分，或是有無頂級傳球手與射手拉開空間 Spacing）。
- **位置合理性**：陣容的位置是否合理，有無明顯漏洞。

格式要求：
- 使用 Markdown 標題、粗體與清單。
- 對每個隊伍進行 3-4 句的精闢分析。
- 宣布一個「最終勝者 (WINNER)」並給出勝出機率 (例如 65%)。
- 最後附上一個幽默風趣的「毒舌球評/熱辣觀點 (Hot Take)」。
- 字數嚴格控制在 500 字以內，語氣要活潑、專業且引人入勝。`;

  const prompt = `【選秀陣容名單】\n\n${rosterSummaries}\n\n請根據以上選秀陣容進行${isLegendMode ? '歷史巔峰/跨時空' : year + '年'}的戰力評估與勝負判定。`;

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
