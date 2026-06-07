require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

const CHECK_PLAYERS = [
  'Zion Williamson', 'Austin Reaves', 'Franz Wagner', 'Cade Cunningham',
  'Evan Mobley', 'Alperen Sengun', 'Darius Garland', 'Karl-Anthony Towns',
  'Scottie Barnes', 'Jalen Brunson', 'Cooper Flagg', 'Victor Wembanyama'
];

async function main() {
  const db = await connectDB();
  const col = db.collection('y2026');
  
  const total = await col.countDocuments();
  console.log('Total y2026 players:', total);
  
  const stars = await col.find({ is_allstar: true }).toArray();
  console.log('\nis_allstar=true count:', stars.length);
  console.log('All-Stars:', stars.map(p => p.name + '(' + p.team + ')').join(', '));
  
  const rookies = await col.find({ is_rookie: true }).toArray();
  console.log('\nis_rookie=true count:', rookies.length);
  console.log('Sample rookies:', rookies.slice(0, 10).map(p => p.name + '(' + p.team + ')').join(', '));
  
  console.log('\n--- Checking specific players ---');
  for (const name of CHECK_PLAYERS) {
    const parts = name.split(' ');
    const lastName = parts[parts.length - 1];
    const p = await col.findOne({ name: { '$regex': lastName, '$options': 'i' } });
    if (p) {
      console.log(name + ': is_allstar=' + p.is_allstar + ' is_rookie=' + p.is_rookie + ' pts=' + p.pts + ' team=' + p.team);
    } else {
      console.log(name + ': NOT FOUND in y2026');
    }
  }
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
