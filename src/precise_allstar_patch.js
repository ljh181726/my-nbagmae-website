// precise_allstar_patch.js
// 精確修補特定球員的 is_allstar 欄位
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

// 需要手動標記的球員（精確姓名、年份範圍）
// 格式: [精確名字, 哪些年份需設為 true]
const MANUAL_PATCHES = [
  // Zion: 2021(入選), 2023(入選) -> 在 y2021+ 都應標 true
  { name: 'Zion Williamson', years: [2021, 2022, 2023, 2024, 2025, 2026] },
  // Austin Reaves: 2025 All-Star
  { name: 'Austin Reaves', years: [2025, 2026] },
  // Scottie Barnes: 2025 All-Star
  { name: 'Scottie Barnes', years: [2025, 2026] },
  // Ja Morant: 2022, 2023 All-Star -> y2022+ 應標 true
  { name: 'Ja Morant', years: [2022, 2023, 2024, 2025, 2026] },
  // Tyrese Haliburton: 2024, 2025 All-Star
  { name: 'Tyrese Haliburton', years: [2024, 2025, 2026] },
  // Bam Adebayo: multiple All-Stars
  { name: 'Bam Adebayo', years: [2021, 2022, 2023, 2024, 2025, 2026] },
  // Jalen Williams: 2025 All-Star
  { name: 'Jalen Williams', years: [2025, 2026] },
  // Devin Booker: 2022, 2023, 2025 All-Star
  { name: 'Devin Booker', years: [2022, 2023, 2024, 2025, 2026] },
  // Kawhi Leonard: All-Star multiple times
  { name: 'Kawhi Leonard', years: [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] },
  // Darius Garland: 2022 All-Star
  { name: 'Darius Garland', years: [2022, 2023, 2024, 2025, 2026] },
  // Paolo Banchero: 2025? (if selected)
  // LaMelo Ball: 2023 All-Star
  { name: 'LaMelo Ball', years: [2023, 2024, 2025, 2026] },
];

async function main() {
  const db = await connectDB();
  console.log('Connected to MongoDB Atlas\n');
  
  let totalPatched = 0;
  
  for (const patch of MANUAL_PATCHES) {
    const { name, years } = patch;
    let playerFixed = 0;
    
    for (const y of years) {
      const col = db.collection(`y${y}`);
      // Exact name match
      const p = await col.findOne({ name });
      if (p) {
        if (!p.is_allstar) {
          await col.updateOne({ _id: p._id }, { '$set': { is_allstar: true } });
          console.log(`  ✅ y${y}: ${name} (${p.team}) -> is_allstar=true`);
          playerFixed++;
          totalPatched++;
        }
      }
    }
    
    if (playerFixed === 0) {
      // Verify all targeted years already correct
      let foundCount = 0;
      for (const y of years) {
        const p = await db.collection(`y${y}`).findOne({ name });
        if (p) foundCount++;
      }
      if (foundCount > 0) console.log(`  ✓ ${name}: already correct in all ${foundCount} found years`);
      else console.log(`  ⚠️ ${name}: not found in any of years [${years.join(',')}]`);
    }
  }
  
  // Final verification
  console.log(`\n✅ Total patched: ${totalPatched} records`);
  
  const checkYears = [2025, 2026];
  for (const y of checkYears) {
    const col = db.collection(`y${y}`);
    const count = await col.countDocuments({ is_allstar: true });
    console.log(`y${y} All-Stars: ${count}`);
  }
  
  // Spot check
  console.log('\n--- Final Spot Checks ---');
  const spotCheck = ['Zion Williamson', 'Austin Reaves', 'Franz Wagner', 'Scottie Barnes', 'Ja Morant', 'LaMelo Ball'];
  for (const name of spotCheck) {
    const p25 = await db.collection('y2025').findOne({ name });
    const p26 = await db.collection('y2026').findOne({ name });
    console.log(`${name}: y2025=${p25 ? (p25.is_allstar ? '⭐' : '✗') : 'N/A'} | y2026=${p26 ? (p26.is_allstar ? '⭐' : '✗') : 'N/A'}`);
  }
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
