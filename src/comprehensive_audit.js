// comprehensive_audit.js
// 全面審計所有年份的 is_allstar 和 is_rookie 問題
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

async function main() {
  const db = await connectDB();
  console.log('Connected\n');

  // ─── Step 1: Build career allstar set from ALL BBR data ───
  console.log('Building career All-Star set from all years...');
  const allStarEver = new Set();
  const debutMap = {};
  const yearCounts = {};

  for (let y = 1977; y <= 2026; y++) {
    const col = db.collection(`y${y}`);
    const docs = await col.find({}, { projection: { name: 1, is_allstar: 1, is_rookie: 1 } }).toArray();
    if (docs.length === 0) continue;
    
    yearCounts[y] = { total: docs.length, allstar: 0, rookie: 0, wrongAllstar: 0 };
    
    for (const d of docs) {
      if (!debutMap[d.name]) debutMap[d.name] = y;
      if (d.is_allstar) {
        allStarEver.add(d.name);
        yearCounts[y].allstar++;
      }
      if (d.is_rookie) yearCounts[y].rookie++;
    }
  }

  console.log(`Career All-Star pool: ${allStarEver.size} unique players ever\n`);

  // ─── Step 2: Find how many players in each year SHOULD have is_allstar=true ───
  console.log('Auditing is_allstar propagation gaps (checking recent years)...');
  let totalAllstarMissing = 0;
  
  for (let y = 2010; y <= 2026; y++) {
    const col = db.collection(`y${y}`);
    const docs = await col.find({}, { projection: { name: 1, is_allstar: 1 } }).toArray();
    if (docs.length === 0) continue;
    
    const missing = docs.filter(d => !d.is_allstar && allStarEver.has(d.name));
    if (missing.length > 0) {
      console.log(`  y${y}: ${missing.length} players missing is_allstar (e.g. ${missing.slice(0,5).map(d=>d.name).join(', ')})`);
      totalAllstarMissing += missing.length;
    }
  }
  console.log(`Total missing All-Star flags (2010-2026): ${totalAllstarMissing}\n`);

  // ─── Step 3: Audit is_rookie in y2026 ───
  console.log('=== y2026 Rookie Audit ===');
  const rookies2026 = await db.collection('y2026').find({ is_rookie: true }, { projection: { name: 1, team: 1 } }).toArray();
  console.log(`is_rookie=true count: ${rookies2026.length}`);
  
  const breakdownByExp = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const r of rookies2026) {
    const debut = debutMap[r.name];
    const exp = debut ? 2026 - debut : 99;
    if (exp <= 3) breakdownByExp[exp] = (breakdownByExp[exp] || 0) + 1;
  }
  console.log('Breakdown by experience:');
  console.log(`  exp=0 (debut 2026, true rookies): ${breakdownByExp[0]}`);
  console.log(`  exp=1 (debut 2025, 2nd year):     ${breakdownByExp[1]}`);
  console.log(`  exp=2 (debut 2024, 3rd year):     ${breakdownByExp[2]}`);
  console.log(`  exp=3 (debut 2023, 4th year):     ${breakdownByExp[3]}`);
  console.log('\nSuggestion: is_rookie should = debut year only (exp=0) OR first 2 seasons (exp<=1)');
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
