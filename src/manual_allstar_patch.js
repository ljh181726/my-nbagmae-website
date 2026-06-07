// manual_allstar_patch.js
// 手動補正 BBR 漏標的全明星資料（主要是 2024-25 賽季）
// 資料來源: Wikipedia / NBA官方 2025 All-Star Game rosters
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

// 2025 NBA All-Star Game (2024-25 賽季) 完整名單
// 這些球員在 y2025 的 BBR awards 欄可能漏標，需手動加
const ALLSTAR_2025_PLAYERS = [
  // West starters
  'Shai Gilgeous-Alexander', 'LeBron James', 'Kevin Durant',
  'Nikola Jokic', 'Anthony Davis',
  // West reserves
  'Stephen Curry', 'Devin Booker', 'Kawhi Leonard', 'Draymond Green',
  'Jaren Jackson', 'Karl-Anthony Towns',
  // East starters  
  'Giannis Antetokounmpo', 'Donovan Mitchell', 'Jaylen Brown',
  'Evan Mobley', 'Tyrese Haliburton',
  // East reserves
  'Jalen Brunson', 'Jayson Tatum', 'Pascal Siakam',
  'Scottie Barnes', 'Cade Cunningham', 'Bam Adebayo',
];

// 同時修正 y2026（2025-26 賽季）已知全明星
// 根據你要求：「曾在該年以前入選過都要標」，所以 y2026 要包含所有歷史全明星
// 以下是 2025-26 賽季目前還在打球且曾是全明星的球員（額外補充）
const ADDITIONAL_CAREER_ALLSTARS_IN_Y2026 = [
  // 這些球員曾是全明星但 BBR y2026 或歷史掃描時可能漏掉
  'Scottie Barnes',  // 2025 All-Star
  'Evan Mobley',     // 2025 + 2026 All-Star
  'Jaren Jackson',   // 2025 All-Star (Jaren Jackson Jr.)
];

async function main() {
  const db = await connectDB();
  console.log('Connected to MongoDB Atlas\n');

  // Step 1: Patch y2025 all-stars
  console.log('=== Patching y2025 All-Star flags ===');
  const col2025 = db.collection('y2025');
  let patched2025 = 0;
  
  for (const name of ALLSTAR_2025_PLAYERS) {
    const parts = name.split(' ');
    const lastName = parts[parts.length - 1];
    // Try exact match first
    let player = await col2025.findOne({ name });
    if (!player) {
      // Try last name match
      player = await col2025.findOne({ name: { '$regex': '^' + parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '$options': 'i' } });
    }
    if (!player) {
      // Try full regex
      player = await col2025.findOne({ name: { '$regex': lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '$options': 'i' } });
    }
    
    if (player) {
      if (!player.is_allstar) {
        await col2025.updateOne({ _id: player._id }, { '$set': { is_allstar: true } });
        console.log(`  ✅ y2025: Patched ${player.name} (${player.team}) -> is_allstar=true`);
        patched2025++;
      } else {
        console.log(`  ✓ y2025: ${player.name} (${player.team}) already All-Star`);
      }
    } else {
      console.log(`  ⚠️  y2025: NOT FOUND: ${name}`);
    }
  }

  // Step 2: Patch y2026 - mark all career all-stars
  console.log('\n=== Patching y2026 All-Star flags ===');
  const col2026 = db.collection('y2026');
  let patched2026 = 0;
  
  // Get all currently known all-stars in ALL years
  const allStarEver = new Set();
  for (let y = 1977; y <= 2026; y++) {
    const docs = await db.collection(`y${y}`).find({ is_allstar: true }, { projection: { name: 1 } }).toArray();
    docs.forEach(d => allStarEver.add(d.name));
  }
  
  // Also add the 2025 all-stars (now patched in y2025)
  ALLSTAR_2025_PLAYERS.forEach(n => {
    // Try to find their canonical name in y2025
    allStarEver.add(n);
  });
  
  console.log(`Career All-Star pool size: ${allStarEver.size}`);
  
  const all2026 = await col2026.find({}).toArray();
  for (const p of all2026) {
    const wasAllStar = allStarEver.has(p.name);
    const isInAdditional = ADDITIONAL_CAREER_ALLSTARS_IN_Y2026.some(n => p.name === n);
    
    if ((wasAllStar || isInAdditional) && !p.is_allstar) {
      await col2026.updateOne({ _id: p._id }, { '$set': { is_allstar: true } });
      console.log(`  ✅ y2026: Patched ${p.name} (${p.team}) -> is_allstar=true`);
      patched2026++;
    }
  }

  // Step 3: Final verification
  const stars2025 = await col2025.countDocuments({ is_allstar: true });
  const stars2026 = await col2026.countDocuments({ is_allstar: true });
  console.log(`\n✅ Patched ${patched2025} players in y2025, ${patched2026} in y2026`);
  console.log(`Final: y2025 has ${stars2025} All-Stars, y2026 has ${stars2026} All-Stars`);

  // Spot check
  console.log('\n--- Spot Checks ---');
  const checks = ['Austin Reaves', 'Franz Wagner', 'Zion Williamson', 'Scottie Barnes', 'Evan Mobley', 'Ja Morant'];
  for (const name of checks) {
    const parts = name.split(' ');
    const last = parts[parts.length - 1];
    const p25 = await col2025.findOne({ name: { '$regex': last, '$options': 'i' } });
    const p26 = await col2026.findOne({ name: { '$regex': last, '$options': 'i' } });
    console.log(`${name}: y2025=${p25 ? (p25.is_allstar ? '⭐' : '✗') + p25.name : 'N/A'} | y2026=${p26 ? (p26.is_allstar ? '⭐' : '✗') + p26.name : 'N/A'}`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
