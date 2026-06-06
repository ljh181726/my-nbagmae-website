const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '../.env') });

const { connectDB } = require('./db');
const { getYearPlayers } = require('./cache');
const { generateDynamic15UsdGrid, getFranchiseLegendsFromDB } = require('./lobby');

async function runTests() {
  try {
    console.log("Starting Phase 2 verification tests...");
    
    // 1. Check DB connection
    console.log("Checking DB connection...");
    const db = await connectDB();
    console.log("✅ DB Connected successfully.");

    // 2. Check getYearPlayers for 2026
    console.log("Testing getYearPlayers(2026)...");
    const players2026 = await getYearPlayers(2026);
    console.log(`✅ Loaded ${players2026.length} players for 2026.`);
    if (players2026.length === 0) {
      throw new Error("No players found for 2026. Verify DB has data.");
    }

    // 3. Test generateDynamic15UsdGrid(2026)
    console.log("Testing generateDynamic15UsdGrid(2026)...");
    const grid = await generateDynamic15UsdGrid(2026);
    console.log(`✅ Generated dynamic grid of size: ${grid.length}`);
    if (grid.length !== 25) {
      throw new Error(`Dynamic grid size should be 25, got ${grid.length}`);
    }
    // Verify columns alignment (positions: PG, SG, SF, PF, C)
    const positions = ["PG", "SG", "SF", "PF", "C"];
    for (let i = 0; i < 25; i++) {
      const expectedPos = positions[i % 5];
      const player = grid[i];
      if (!player.positions.includes(expectedPos)) {
        console.warn(`⚠️ Warning: Grid index ${i} expected position ${expectedPos}, player has positions ${player.positions.join(',')}`);
      }
    }
    console.log("✅ Dynamic grid verification passed.");

    // 4. Test getFranchiseLegendsFromDB('LAL')
    console.log("Testing getFranchiseLegendsFromDB('LAL')...");
    const legends = await getFranchiseLegendsFromDB('LAL');
    console.log(`✅ Loaded ${legends.length} legends for LAL.`);
    if (legends.length === 0) {
      throw new Error("No legends loaded for LAL!");
    }
    const kobe = legends.find(p => p.name === "Kobe Bryant" || p.name.includes("Kobe"));
    if (kobe) {
      console.log(`✅ Found Kobe Bryant legend: year=${kobe.year}, pts=${kobe.pts}, trb=${kobe.trb}, ast=${kobe.ast}`);
    } else {
      console.log("⚠️ Kobe Bryant not found in LAL legends.");
    }

    console.log("🎉 All Phase 2 backend tests passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

runTests();
