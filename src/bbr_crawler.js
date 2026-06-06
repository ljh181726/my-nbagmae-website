const cheerio = require('cheerio');
const { connectDB } = require('./db');
require('dotenv').config();

// Historical Salary Caps (1977 - 2026)
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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Normalized name cleaner
function cleanName(name) {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents/diacritics
    .replace(/\./g, "")
    .replace(/\s+(Jr|Sr|III|II|IV|V)$/i, "") // Remove suffixes
    .trim();
}

async function fetchWithRetry(url, retries = 3, delay = 30000) {
  for (let i = 0; i < retries; i++) {
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    };
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        console.warn(`⚠️ HTTP 429 Rate Limited. Sleeping for ${delay / 1000}s. Attempt ${i + 1}/${retries}...`);
        await sleep(delay);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Request failed: ${err.message}. Retrying in 5s...`);
      await sleep(5000);
    }
  }
}

// Convert BBR position text to PG/SG/SF/PF/C list
function parsePosition(posText) {
  const cleanPos = (posText || "").toUpperCase();
  if (cleanPos.includes("-")) {
    // Multi-position, e.g. "SF-PF" -> ["SF", "PF"]
    return cleanPos.split("-");
  }
  if (cleanPos === "PG") return ["PG"];
  if (cleanPos === "SG") return ["SG"];
  if (cleanPos === "SF") return ["SF"];
  if (cleanPos === "PF") return ["PF"];
  if (cleanPos === "C") return ["C"];
  if (cleanPos === "G") return ["PG", "SG"];
  if (cleanPos === "F") return ["SF", "PF"];
  return ["SF"]; // Fallback
}

async function crawlYear(db, year, debutMap) {
  const collectionName = `y${year}`;
  console.log(`\n🏀 [Crawl Year ${year}] Starting...`);
  
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`;
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);
  
  const rows = $('#per_game_stats tbody tr');
  if (rows.length === 0) {
    throw new Error(`Could not find any rows in per_game_stats table for year ${year}`);
  }

  const salaryCap = SALARY_CAPS[year] || 154647000;
  const processedPlayers = {};
  const playersList = [];

  rows.each((i, el) => {
    const nameCell = $(el).find('td[data-stat="name_display"]');
    if (nameCell.length === 0) return; // Skip the intermediate header rows

    const rawName = nameCell.find('a').text().trim() || nameCell.text().trim();
    if (!rawName) return;

    const name = cleanName(rawName);
    const team = $(el).find('td[data-stat="team_name_abbr"]').text().trim();
    const posText = $(el).find('td[data-stat="pos"]').text().trim();
    const positions = parsePosition(posText);
    
    const pts = parseFloat($(el).find('td[data-stat="pts_per_g"]').text()) || 0;
    const trb = parseFloat($(el).find('td[data-stat="trb_per_g"]').text()) || 0;
    const ast = parseFloat($(el).find('td[data-stat="ast_per_g"]').text()) || 0;
    
    const awardsText = $(el).find('td[data-stat="awards"]').text().trim() || "";
    const is_allstar = awardsText.includes("AS");

    // Skip secondary rows for traded players, updating their final team assignment
    if (processedPlayers[name]) {
      const existing = processedPlayers[name];
      if (existing.team === 'TOT' && team !== 'TOT') {
        existing.team = team; // Map total stats to their final team
      }
      return;
    }

    // Determine debut year & rookie status
    let is_rookie = false;
    if (year === 1977) {
      // Initialize pre-existing players in 1977 so they aren't rookies
      debutMap[name] = 1970;
    } else {
      if (!debutMap[name]) {
        debutMap[name] = year; // Set debut year to current year
      }
      const experience = year - debutMap[name];
      is_rookie = experience <= 3; // In their first 4 seasons (0, 1, 2, 3)
    }

    // Calculate performance index & virtual salary
    const score = pts + 1.2 * trb + 1.5 * ast;
    let ratio = score / 50.0;
    
    // Scale rookie contract salaries down (Max 6% of cap) to make them high-CP bargains
    if (is_rookie) {
      ratio = Math.max(0.015, Math.min(0.06, ratio)); 
    } else {
      ratio = Math.max(0.015, Math.min(0.35, ratio));
    }
    
    const salary = Math.round(ratio * salaryCap);

    const playerDoc = {
      name,
      year: parseInt(year),
      team,
      position: positions,
      pts,
      trb,
      ast,
      salary,
      is_allstar,
      is_rookie
    };

    processedPlayers[name] = playerDoc;
    playersList.push(playerDoc);
  });

  // Clean up 'TOT' team placeholders for players traded mid-season
  playersList.forEach(p => {
    if (p.team === 'TOT') {
      p.team = 'FA'; // Fallback to Free Agent if no final team was found
    }
  });

  // Write to collection, dropping old data for this collection (upsert/overwrite behavior)
  const collection = db.collection(collectionName);
  await collection.deleteMany({});
  if (playersList.length > 0) {
    await collection.insertMany(playersList);
    // Create query indexes
    await collection.createIndex({ name: 1, team: 1 });
    await collection.createIndex({ is_allstar: 1 });
    await collection.createIndex({ is_rookie: 1 });
  }

  console.log(`✅ [Year ${year}] Saved ${playersList.length} players to collection '${collectionName}' (Cap: $${salaryCap.toLocaleString()})`);
}

async function main() {
  const args = process.argv.slice(2);
  let startYear = 1977;
  let endYear = 2026;
  let singleYear = null;

  if (args.includes('--year')) {
    const idx = args.indexOf('--year');
    singleYear = parseInt(args[idx + 1]);
  }

  const db = await connectDB();
  const debutMap = {};

  // If doing all years, build debutMap sequentially to track rookies accurately
  if (!singleYear) {
    console.log("🏀 Running sequential full database crawl (1977 - 2026)...");
    for (let y = startYear; y <= endYear; y++) {
      const collectionName = `y${y}`;
      const count = await db.collection(collectionName).countDocuments();
      
      // If collection exists, read the players to load debutMap so we don't lose track of who is a rookie
      if (count > 0 && y !== 2026) {
        console.log(`ℹ️ Collection '${collectionName}' already exists. Loading player names for debut mapping...`);
        const docs = await db.collection(collectionName).find({}, { projection: { name: 1, year: 1 } }).toArray();
        docs.forEach(d => {
          if (!debutMap[d.name]) {
            debutMap[d.name] = y; // Assume debut in this year or earlier
          }
        });
        continue; // Skip crawling this year as per read-only requirements
      }

      await crawlYear(db, y, debutMap);
      await sleep(3000 + Math.random() * 2000); // Friendly rate limit delay (3-5 seconds)
    }
  } else {
    console.log(`🏀 Crawling specific year: ${singleYear}`);
    // Load existing records to approximate debut years for rookie calculation
    console.log("Loading prior player history to calculate rookie status...");
    for (let y = startYear; y < singleYear; y++) {
      const docs = await db.collection(`y${y}`).find({}, { projection: { name: 1 } }).toArray();
      docs.forEach(d => {
        if (!debutMap[d.name]) debutMap[d.name] = y;
      });
    }
    await crawlYear(db, singleYear, debutMap);
  }

  console.log("\n🎉 Basketball Reference Crawl Complete!");
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error("💥 Crawl execution error:", err);
    process.exit(1);
  });
}
