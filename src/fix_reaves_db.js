// src/fix_reaves_db.js
// Reset Austin Reaves is_allstar to false in y2025 and y2026
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectDB } = require('./db');

async function main() {
  const db = await connectDB();
  console.log('Connected to MongoDB Atlas');

  const collections = ['y2025', 'y2026'];
  for (const colName of collections) {
    const col = db.collection(colName);
    const result = await col.updateMany(
      { name: 'Austin Reaves' },
      { $set: { is_allstar: false } }
    );
    console.log(`y${colName.substring(1)}: Updated ${result.modifiedCount} players matching name 'Austin Reaves' to is_allstar=false`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
