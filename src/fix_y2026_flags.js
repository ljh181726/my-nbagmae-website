// fix_y2026_flags.js
// 直接修補 MongoDB y2026 collection 的 is_allstar 和 is_rookie 欄位
// is_allstar: 只要曾在 1977-2026 任何一年有過 is_allstar=true，在 2026 也標 true
// is_rookie: 只有在 2023/2024/2025/2026 首次出現才是 rookie（前 4 個賽季）
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

async function main() {
  const db = await connectDB();
  console.log('Connected to MongoDB Atlas\n');

  // ─── Step 1: Build allstar-ever set from all year collections ───
  console.log('Step 1: Scanning all years (1977-2026) to find career All-Stars...');
  const allStarEver = new Set();
  const debutYearMap = {}; // name -> first year seen

  const years = Array.from({ length: 50 }, (_, i) => 1977 + i);
  for (const y of years) {
    const col = db.collection(`y${y}`);
    const count = await col.countDocuments();
    if (count === 0) continue;

    const docs = await col.find({}, { projection: { name: 1, is_allstar: 1 } }).toArray();
    for (const d of docs) {
      if (!debutYearMap[d.name]) debutYearMap[d.name] = y;
      if (d.is_allstar) allStarEver.add(d.name);
    }
  }
  console.log(`Found ${allStarEver.size} players who were EVER All-Stars (1977-2026)`);

  // ─── Step 2: Fix y2026 is_allstar ───
  console.log('\nStep 2: Updating y2026 is_allstar flags...');
  const col2026 = db.collection('y2026');
  const allPlayers2026 = await col2026.find({}).toArray();

  let allstarFixed = 0, rookieFixed = 0;

  for (const p of allPlayers2026) {
    const updates = {};

    // Fix is_allstar: should be true if ever made All-Star at any point up to 2026
    const shouldBeAllStar = allStarEver.has(p.name);
    if (shouldBeAllStar !== p.is_allstar) {
      updates.is_allstar = shouldBeAllStar;
      allstarFixed++;
      if (shouldBeAllStar) {
        console.log(`  + Marking ${p.name} (${p.team}) as All-Star`);
      }
    }

    // Fix is_rookie: should be true if debut year is 2023 or later (first 4 seasons)
    const debutYear = debutYearMap[p.name];
    const experience = debutYear ? 2026 - debutYear : 10;
    const shouldBeRookie = debutYear && debutYear >= 2023 && experience <= 3;
    if (shouldBeRookie !== p.is_rookie) {
      updates.is_rookie = shouldBeRookie;
      rookieFixed++;
      if (p.is_rookie && !shouldBeRookie) {
        console.log(`  - Removing rookie flag from ${p.name} (${p.team}) debut:${debutYear} exp:${experience}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await col2026.updateOne({ _id: p._id }, { $set: updates });
    }
  }

  console.log(`\n✅ Fixed ${allstarFixed} All-Star flags`);
  console.log(`✅ Fixed ${rookieFixed} Rookie flags`);

  // ─── Step 3: Verify ───
  const starsAfter = await col2026.countDocuments({ is_allstar: true });
  const rookiesAfter = await col2026.countDocuments({ is_rookie: true });
  console.log(`\nFinal counts: is_allstar=${starsAfter}, is_rookie=${rookiesAfter}`);

  // Spot-check key players
  const checks = ['Zion Williamson', 'Austin Reaves', 'Franz Wagner', 'Evan Mobley', 'Scottie Barnes', 'Cooper Flagg'];
  console.log('\nSpot checks:');
  for (const name of checks) {
    const parts = name.split(' ');
    const p = await col2026.findOne({ name: { '$regex': parts[parts.length - 1], '$options': 'i' } });
    if (p) console.log(`  ${name}: is_allstar=${p.is_allstar} is_rookie=${p.is_rookie} team=${p.team}`);
    else console.log(`  ${name}: NOT FOUND`);
  }

  process.exit(0);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
