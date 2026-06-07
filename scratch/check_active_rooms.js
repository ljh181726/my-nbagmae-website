const { connectDB } = require('../src/db');

async function check() {
  const db = await connectDB();
  const rooms = await db.collection('active_rooms').find({}).toArray();
  console.log('Total rooms:', rooms.length);
  for (const r of rooms) {
    console.log('Room ID:', r._id);
    console.log('Settings:', JSON.stringify(r.settings));
    console.log('Year:', r.settings.year);
    console.log('Mode:', r.settings.mode);
    console.log('Phase:', r.phase);
    console.log('RoomState:', r.roomState);
    console.log('DraftIndex:', r.draftIndex);
    console.log('DraftOrder:', JSON.stringify(r.draftOrder));
    console.log('CurrentTeam:', r.currentTeam);
    console.log('Players Roster Lengths:', r.players.map(p => `${p.name}: ${p.roster.length}`));
    console.log('DraftedIds:', r.draftedIds);
    if (r.settings && r.settings.year && r.phase === 'pick' && r.currentTeam) {
      const yearPlayers = await db.collection('y' + r.settings.year).find({}).toArray();
      const phiPlayers = yearPlayers.filter(p => p.team === r.currentTeam.abbreviation || p.team === 'PHI');
      console.log(`All players in collection y${r.settings.year}:`, yearPlayers.length);
      console.log(`PHI players in collection y${r.settings.year}:`, phiPlayers.map(p => p.name));
    }
    console.log('-----------------------------');
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
