// debug_names.js - 找名字差異
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

async function main() {
  const db = await connectDB();
  
  // Check what name variants exist for Zion, Reaves, Wagner, Barnes, Morant
  const searches = ['Zion', 'Reaves', 'Wagner', 'Barnes', 'Morant', 'Williamson'];
  
  console.log('=== Searching y2026 for name variants ===');
  for (const term of searches) {
    const results = await db.collection('y2026').find({ name: { '$regex': term, '$options': 'i' } }).toArray();
    results.forEach(p => console.log(`  [y2026] ${p.name} (${p.team}) is_allstar=${p.is_allstar}`));
  }
  
  console.log('\n=== Checking All-Star set by scanning years for these names ===');
  const target = ['Zion', 'Reaves', 'Wagner', 'Williamson', 'Morant'];
  for (const term of target) {
    for (let y = 2020; y <= 2026; y++) {
      const docs = await db.collection(`y${y}`).find({ name: { '$regex': term, '$options': 'i' } }, { projection: { name: 1, is_allstar: 1, team: 1 } }).toArray();
      if (docs.length > 0) {
        docs.forEach(d => console.log(`  y${y}: ${d.name} (${d.team}) is_allstar=${d.is_allstar}`));
      }
    }
  }
  
  console.log('\n=== Rookie Analysis (debut 2023 or later) ===');
  const rookies2026 = await db.collection('y2026').find({ is_rookie: true }).toArray();
  console.log(`Total is_rookie=true: ${rookies2026.length}`);
  
  // Build debut map for context
  const debutMap = {};
  for (let y = 1977; y <= 2026; y++) {
    const docs = await db.collection(`y${y}`).find({}, { projection: { name: 1 } }).toArray();
    docs.forEach(d => { if (!debutMap[d.name]) debutMap[d.name] = y; });
  }
  
  // Find wrongly tagged rookies (debut before 2023)
  const wrongRookies = rookies2026.filter(p => {
    const debut = debutMap[p.name];
    return debut && debut < 2023;
  });
  console.log(`Incorrectly tagged as rookie (debut < 2023): ${wrongRookies.length}`);
  wrongRookies.slice(0, 20).forEach(p => console.log(`  ${p.name} debut=${debutMap[p.name]} team=${p.team}`));
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
