const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

const { getAbbreviationCandidates, getHistoricalTeamAbbr } = require('../src/lobby');

// Helper: Calculate ratings (Offense, Defense, Overall)
function calcRatings(roster) {
  if (!roster || roster.length === 0) return { offense: 0, defense: 0, overall: 0 };
  const n = roster.length;
  const totalPts = roster.reduce((s, p) => s + (p.pts || 0), 0) / n;
  const totalAst = roster.reduce((s, p) => s + (p.ast || 0), 0) / n;
  const allStarBonus = roster.filter(p => p.is_allstar).length * 2;
  const offenseRaw = (totalPts / 30) * 70 + (totalAst / 8) * 20 + allStarBonus;
  const offense = Math.min(100, Math.max(30, Math.round(offenseRaw)));

  const playerDefScores = roster.map(p => {
    const isBig = p.position && (p.position.includes('C') || p.position.includes('PF'));
    const isPerimeter = p.position && (p.position.includes('PG') || p.position.includes('SG'));
    let base = 50;
    if (isBig) {
      base += (p.trb || 0) * 4.5;
    } else if (isPerimeter) {
      base += (p.trb || 0) * 3.0 + (p.ast || 0) * 1.5;
    } else {
      base += (p.trb || 0) * 3.5;
    }
    if (p.is_allstar) base += 5;
    return Math.min(100, Math.max(30, base));
  });
  const defense = Math.round(playerDefScores.reduce((sum, s) => sum + s, 0) / n);
  const overall = Math.round((offense + defense) / 2);
  return { offense, defense, overall };
}

const levelSpecs = [
  // Chapter 1: 新手試煉 (Bronze, Levels 1-10) - Weak teams
  { level: 1, year: 2012, team: "CHA", name: "夏洛特山貓", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 2, year: 1993, team: "DAL", name: "達拉斯獨行俠", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 3, year: 1998, team: "DEN", name: "丹佛金塊", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 4, year: 2005, team: "ATL", name: "亞特蘭大老鷹", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 5, year: 2010, team: "NJN", name: "紐澤西籃網", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 6, year: 2016, team: "PHI", name: "費城76人", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 7, year: 1987, team: "LAC", name: "洛杉磯快艇", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 8, year: 2001, team: "CHI", name: "芝加哥公牛", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 9, year: 1999, team: "VAN", name: "溫哥華灰熊", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },
  { level: 10, year: 1997, team: "BOS", name: "波士頓塞爾提克", difficulty: "bronze", restrictions: { allStarCap: 5, rookieFloor: 0 }, mode: "wheel" },

  // Chapter 2: 分區挑戰 (Silver, Levels 11-20) - Medium-weak teams
  { level: 11, year: 1989, team: "MIA", name: "邁阿密熱火", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 12, year: 1996, team: "VAN", name: "溫哥華灰熊", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 13, year: 2002, team: "CHI", name: "芝加哥公牛", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 14, year: 2008, team: "SEA", name: "西雅圖超音速", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 15, year: 2012, team: "WAS", name: "華盛頓巫師", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 16, year: 2015, team: "NYK", name: "紐約尼克", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 17, year: 2018, team: "PHX", name: "鳳凰城太陽", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 18, year: 2019, team: "CLE", name: "克里夫蘭騎士", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 19, year: 2021, team: "ORL", name: "奧蘭多魔術", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 20, year: 2023, team: "DET", name: "底特律活塞", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },

  // Chapter 3: 季後賽席次 (Silver, Levels 21-30) - Average teams
  { level: 21, year: 1990, team: "ORL", name: "奧蘭多魔術", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 22, year: 1982, team: "CLE", name: "克里夫蘭騎士", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 23, year: 1995, team: "MIN", name: "明尼蘇達灰狼", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 24, year: 2004, team: "TOR", name: "多倫多暴龍", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 25, year: 2007, team: "MEM", name: "孟菲斯灰熊", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 26, year: 2011, team: "SAC", name: "沙加緬度國王", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 27, year: 2014, team: "LAL", name: "洛杉磯湖人", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 28, year: 2017, team: "BKN", name: "布魯克林籃網", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 29, year: 2022, team: "IND", name: "印第安納溜馬", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },
  { level: 30, year: 2024, team: "POR", name: "波特蘭拓荒者", difficulty: "silver", restrictions: { allStarCap: 2, rookieFloor: 1 }, mode: "wheel" },

  // Chapter 4: 強隊壓境 (Gold, Levels 31-45) - Strong playoff/historic contenders
  { level: 31, year: 1993, team: "PHX", name: "鳳凰城太陽", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 32, year: 1994, team: "HOU", name: "休士頓火箭", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 33, year: 1998, team: "UTA", name: "猶他爵士", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 34, year: 2000, team: "LAL", name: "洛杉磯湖人", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 35, year: 2002, team: "SAC", name: "沙加緬度國王", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 36, year: 2004, team: "DET", name: "底特律活塞", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 37, year: 2006, team: "MIA", name: "邁阿密熱火", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 38, year: 2008, team: "BOS", name: "波士頓塞爾提克", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 39, year: 2011, team: "DAL", name: "達拉斯獨行俠", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 40, year: 2012, team: "MIA", name: "邁阿密熱火", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 41, year: 2013, team: "SAS", name: "聖安東尼奧馬刺", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 42, year: 2014, team: "IND", name: "印第安納溜馬", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 43, year: 2016, team: "CLE", name: "克里夫蘭騎士", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 44, year: 2019, team: "TOR", name: "多倫多暴龍", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },
  { level: 45, year: 2021, team: "MIL", name: "密爾瓦基公鹿", difficulty: "gold", restrictions: { allStarCap: 3, rookieFloor: 1 }, mode: "wheel" },

  // Chapter 5: 巔峰王朝 (Legend, Levels 46-55) - Legendary dynasties
  { level: 46, year: 1983, team: "PHI", name: "費城76人", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 47, year: 1986, team: "BOS", name: "波士頓塞爾提克", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 48, year: 1987, team: "LAL", name: "洛杉磯湖人", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 49, year: 1989, team: "DET", name: "底特律活塞", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 50, year: 1996, team: "CHI", name: "芝加哥公牛", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 51, year: 1997, team: "CHI", name: "芝加哥公牛", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 52, year: 1998, team: "CHI", name: "芝加哥公牛", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 53, year: 2001, team: "LAL", name: "洛杉磯湖人", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 54, year: 2007, team: "SAS", name: "聖安東尼奧馬刺", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },
  { level: 55, year: 2017, team: "GSW", name: "金州勇士", difficulty: "legend", restrictions: { allStarCap: 4, rookieFloor: 1 }, mode: "wheel" },

  // Chapter 6: 名人堂終極考驗 (Ultimate, Levels 56-60) - Ultimate legendary lineups
  { level: 56, year: 1996, team: "CHI", name: "芝加哥公牛", difficulty: "ultimate", restrictions: { allStarCap: 5, rookieFloor: 1 }, mode: "wheel" },
  { level: 57, year: 2017, team: "GSW", name: "金州勇士", difficulty: "ultimate", restrictions: { allStarCap: 5, rookieFloor: 1 }, mode: "wheel" },
  { level: 58, year: 2001, team: "LAL", name: "洛杉磯湖人", difficulty: "ultimate", restrictions: { allStarCap: 5, rookieFloor: 1 }, mode: "wheel" },
  { level: 59, year: 1986, team: "BOS", name: "波士頓塞爾提克", difficulty: "ultimate", restrictions: { allStarCap: 5, rookieFloor: 1 }, mode: "wheel" },
  { level: 60, year: 1987, team: "LAL", name: "洛杉磯湖人", difficulty: "ultimate", restrictions: { allStarCap: 5, rookieFloor: 1 }, mode: "wheel" }
];

function getFallbackPlayers(allPlayers, difficulty, count = 5) {
  const scoredPlayers = allPlayers.map(p => {
    const score = (p.pts || 0) + 1.5 * (p.ast || 0) + 1.2 * (p.trb || 0);
    return { ...p, calcScore: score };
  });
  
  // Sort descending by calculated score
  scoredPlayers.sort((a, b) => b.calcScore - a.calcScore);
  
  let pool = [];
  const total = scoredPlayers.length;
  
  if (difficulty === 'bronze') {
    // Pick from lower-middle tier (60% to 85%)
    const startIdx = Math.floor(total * 0.60);
    const endIdx = Math.min(total, Math.floor(total * 0.85));
    pool = scoredPlayers.slice(startIdx, endIdx);
  } else if (difficulty === 'silver') {
    // Pick from middle tier (35% to 60%)
    const startIdx = Math.floor(total * 0.35);
    const endIdx = Math.floor(total * 0.60);
    pool = scoredPlayers.slice(startIdx, endIdx);
  } else if (difficulty === 'gold') {
    // Pick from upper-middle tier (15% to 35%)
    const startIdx = Math.floor(total * 0.15);
    const endIdx = Math.floor(total * 0.35);
    pool = scoredPlayers.slice(startIdx, endIdx);
  } else { // legend or ultimate
    // Pick from elite tier (top 15%)
    const startIdx = 0;
    const endIdx = Math.floor(total * 0.15);
    pool = scoredPlayers.slice(startIdx, endIdx);
  }
  
  // Fallback if pool is too small
  if (pool.length < count) {
    pool = scoredPlayers;
  }
  
  // Randomly sample 'count' players from the pool
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

async function generate() {
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('nba_draft_showdown');

  console.log('Connected to MongoDB database. Starting PVE levels generation with real rosters...');

  const finalLevels = [];

  for (const spec of levelSpecs) {
    const collName = `y${spec.year}`;
    const candidates = getAbbreviationCandidates(spec.team, spec.year);

    console.log(`Processing Level ${spec.level}: Year ${spec.year}, Team ${spec.team}. Candidates: [${candidates.join(', ')}]`);

    const allPlayers = await db.collection(collName).find({}).toArray();
    let teamPlayers = allPlayers.filter(p => p.team && candidates.some(c => c.toUpperCase() === p.team.toUpperCase()));

    if (teamPlayers.length === 0) {
      console.warn(`⚠️ Warning: No players found for Level ${spec.level} (Year ${spec.year}, Team ${spec.team}). Triggering fallback protection!`);
      teamPlayers = getFallbackPlayers(allPlayers, spec.difficulty, 5);
    }

    // Sort by dynamic battle rating formula (PTS + 1.5 * AST + 1.2 * TRB) descending
    teamPlayers.sort((a, b) => {
      const scoreA = (a.pts || 0) + 1.5 * (a.ast || 0) + 1.2 * (a.trb || 0);
      const scoreB = (b.pts || 0) + 1.5 * (b.ast || 0) + 1.2 * (b.trb || 0);
      return scoreB - scoreA;
    });

    if (spec.level >= 56 && spec.level <= 60) {
      console.log(`🔥 [Chapter 6 Dynasty Boss] Generated ultimate championship squad for Level ${spec.level}: ${spec.year} ${spec.name}`);
    }

    // Get top 5 players
    const top5 = teamPlayers.slice(0, 5);
    const cpuRoster = top5.map(p => ({
      name: p.name,
      pts: p.pts || 0,
      trb: p.trb || 0,
      ast: p.ast || 0,
      position: p.position || ['G'],
      is_allstar: !!p.is_allstar,
      is_rookie: !!p.is_rookie
    }));

    const ratings = calcRatings(cpuRoster);

    finalLevels.push({
      level: spec.level,
      name: `關卡 ${spec.level}: ${spec.year} ${spec.name}挑戰`,
      year: spec.year,
      difficulty: spec.difficulty,
      cpuTeamName: `${spec.year} ${spec.name}`,
      cpuRoster,
      ratings,
      mode: spec.mode,
      restrictions: spec.restrictions
    });
  }

  const fileContent = `// ─────────────────────────────────────────────
//  pve_levels.js - 60 levels PVE Campaign Mode configuration
// ─────────────────────────────────────────────

const PVE_LEVELS = ${JSON.stringify(finalLevels, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PVE_LEVELS };
}
`;

  const targetPath = path.join(__dirname, '../src/pve_levels.js');
  fs.writeFileSync(targetPath, fileContent);
  console.log(`Successfully generated ${finalLevels.length} levels in src/pve_levels.js!`);

  // Import into MongoDB collection
  const pveCollection = db.collection('pve_levels');
  await pveCollection.deleteMany({});
  await pveCollection.insertMany(finalLevels);
  console.log(`Successfully imported ${finalLevels.length} levels into MongoDB collection 'pve_levels'!`);

  await client.close();
  process.exit(0);
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
