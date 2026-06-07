// full_data_fix.js
// 全面修正所有年份的 is_allstar（累積）和 is_rookie（前兩季）
// 
// is_allstar 規則：「曾在該年份之前（含）入選過任何一次 All-Star 就標 true」
// is_rookie  規則：「該年份是球員 NBA 生涯的第 1 或第 2 個賽季（experience <= 1）」
//
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

// 已知 BBR 漏標的 All-Star（手動補充）
// 格式: { name, firstAllStarYear } - 從 firstAllStarYear 開始，之後所有年份都標 true
const MANUAL_ALLSTAR_OVERRIDES = [
  // 2025 All-Star Game 漏標者（BBR awards 欄尚未完整）
  { name: 'Scottie Barnes',    firstAllStarYear: 2025 },
  { name: 'Kawhi Leonard',     firstAllStarYear: 2017 }, // 多次入選，補全
  { name: 'Devin Booker',      firstAllStarYear: 2022 },
  { name: 'Draymond Green',    firstAllStarYear: 2016 },
  { name: 'Bam Adebayo',       firstAllStarYear: 2021 },
  { name: 'Tyrese Haliburton', firstAllStarYear: 2024 },
  { name: 'LaMelo Ball',       firstAllStarYear: 2023 },
  { name: 'Ja Morant',         firstAllStarYear: 2022 },
  { name: 'Jalen Williams',    firstAllStarYear: 2025 },
];

async function main() {
  const db = await connectDB();
  console.log('Connected to MongoDB Atlas\n');

  // ─── Phase 1: Build allStarByYear map ───
  // allStarByYear[name] = first year they appeared with is_allstar=true in BBR data
  console.log('Phase 1: Building career All-Star history from BBR data...');
  const allStarFirstYear = {}; // name -> first year marked as AS by BBR
  const debutYear = {};        // name -> first year appeared in any collection

  for (let y = 1977; y <= 2026; y++) {
    const col = db.collection(`y${y}`);
    const docs = await col.find({}, { projection: { name: 1, is_allstar: 1 } }).toArray();
    for (const d of docs) {
      if (!debutYear[d.name]) debutYear[d.name] = y;
      if (d.is_allstar && !allStarFirstYear[d.name]) {
        allStarFirstYear[d.name] = y;
      }
    }
  }

  // Apply manual overrides (for BBR-missed All-Stars)
  for (const override of MANUAL_ALLSTAR_OVERRIDES) {
    const existing = allStarFirstYear[override.name];
    if (!existing || override.firstAllStarYear < existing) {
      allStarFirstYear[override.name] = override.firstAllStarYear;
      console.log(`  Manual override: ${override.name} -> firstAllStar=${override.firstAllStarYear}`);
    }
  }

  const totalCareerAllStars = Object.keys(allStarFirstYear).length;
  console.log(`Total career All-Stars in history: ${totalCareerAllStars}\n`);

  // ─── Phase 2: Update ALL year collections ───
  console.log('Phase 2: Updating ALL year collections (1977-2026)...');
  let totalAllStarFixed = 0;
  let totalRookieFixed = 0;
  let yearStats = [];

  for (let y = 1977; y <= 2026; y++) {
    const col = db.collection(`y${y}`);
    const docs = await col.find({}).toArray();
    if (docs.length === 0) continue;

    let allstarFixedThisYear = 0;
    let rookieFixedThisYear = 0;
    const bulkOps = [];

    for (const d of docs) {
      const updates = {};

      // ── All-Star fix: should be true if player was ever an All-Star BY this year ──
      const firstAS = allStarFirstYear[d.name];
      const shouldBeAllStar = !!(firstAS && firstAS <= y);
      if (shouldBeAllStar !== d.is_allstar) {
        updates.is_allstar = shouldBeAllStar;
        if (shouldBeAllStar) allstarFixedThisYear++;
      }

      // ── Rookie fix: only first 2 NBA seasons (experience <= 1) ──
      const debut = debutYear[d.name];
      const exp = debut ? y - debut : 99;
      const shouldBeRookie = debut ? exp <= 1 : false;
      if (shouldBeRookie !== d.is_rookie) {
        updates.is_rookie = shouldBeRookie;
        rookieFixedThisYear++;
      }

      if (Object.keys(updates).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: updates }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await col.bulkWrite(bulkOps, { ordered: false });
    }

    if (allstarFixedThisYear > 0 || rookieFixedThisYear > 0) {
      console.log(`  y${y}: +${allstarFixedThisYear} AllStar fixes, ±${rookieFixedThisYear} Rookie fixes`);
    }
    totalAllStarFixed += allstarFixedThisYear;
    totalRookieFixed += rookieFixedThisYear;

    // Collect stats for summary
    const newAllStarCount = await col.countDocuments({ is_allstar: true });
    const newRookieCount = await col.countDocuments({ is_rookie: true });
    yearStats.push({ y, total: docs.length, allstar: newAllStarCount, rookie: newRookieCount });
  }

  console.log(`\n✅ Total All-Star fixes: ${totalAllStarFixed}`);
  console.log(`✅ Total Rookie fixes: ${totalRookieFixed}`);

  // ─── Phase 3: Final verification ───
  console.log('\n=== Final Verification (recent years) ===');
  for (const s of yearStats.filter(s => s.y >= 2018)) {
    const pctAllStar = ((s.allstar / s.total) * 100).toFixed(1);
    const pctRookie  = ((s.rookie  / s.total) * 100).toFixed(1);
    console.log(`y${s.y}: ${s.total} players | AllStar:${s.allstar}(${pctAllStar}%) | Rookie:${s.rookie}(${pctRookie}%)`);
  }

  // Spot checks on y2026
  console.log('\n=== y2026 Spot Checks ===');
  const spotChecks = [
    'Zion Williamson', 'Austin Reaves', 'Franz Wagner', 'Scottie Barnes',
    'Stephen Curry', 'Luka Doncic', 'Nikola Jokic', 'LeBron James',
    'Cooper Flagg', 'Victor Wembanyama', 'Evan Mobley', 'Cade Cunningham'
  ];
  for (const name of spotChecks) {
    const p = await db.collection('y2026').findOne({ name });
    if (p) {
      const debut = debutYear[p.name] || '?';
      const exp = debut !== '?' ? 2026 - debut : '?';
      console.log(`  ${name}: is_allstar=${p.is_allstar} is_rookie=${p.is_rookie} debut=${debut} exp=${exp}`);
    } else {
      console.log(`  ${name}: NOT FOUND`);
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
