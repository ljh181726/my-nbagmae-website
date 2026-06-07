const { connectDB, findOrCreateUser, performCheckIn, updatePVEProgress } = require('../src/db');
const { getAvailablePlayersForRoom, getHistoricalTeamAbbr } = require('../src/lobby');

// Mock a clean test run
async function test() {
  try {
    const db = await connectDB();
    const collection = db.collection('users');

    const testUid = 'test_oauth_user_999';
    await collection.deleteMany({ uid: testUid });

    console.log('1. Testing findOrCreateUser...');
    const user = await findOrCreateUser({
      uid: testUid,
      name: 'Test Player HOF',
      avatar: 'http://example.com/avatar.jpg',
      provider: 'google'
    });
    console.log('User initialized:', JSON.stringify(user, null, 2));

    // Verify fields
    if (user.virtual_currency !== 10 || user.continuous_days !== 0 || user.pve_cleared_stages.length !== 0) {
      throw new Error('Initial user fields are incorrect');
    }
    console.log('✅ findOrCreateUser passed');

    console.log('\n2. Testing performCheckIn (Day 1)...');
    let checkin1 = await performCheckIn(testUid);
    console.log('Day 1 Check-In result:', checkin1.success, 'Coins gained:', checkin1.coinsGained, 'Streak:', checkin1.streak, 'New balance:', checkin1.user.virtual_currency);
    if (checkin1.coinsGained !== 3 || checkin1.user.virtual_currency !== 13) {
      throw new Error('Day 1 rewards incorrect');
    }

    console.log('\n3. Testing duplicate checkin on same day...');
    let checkin2 = await performCheckIn(testUid);
    console.log('Duplicate check-in success (should be false):', checkin2.success);
    if (checkin2.success) {
      throw new Error('Allowed duplicate check-in');
    }

    console.log('\n4. Testing streak progression...');
    // Manually modify last check-in date to yesterday to allow check-in and test streak day 7
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    await collection.updateOne({ uid: testUid }, { $set: { last_sign_in_date: yesterdayStr, continuous_days: 6 } });
    
    let checkinStreak7 = await performCheckIn(testUid);
    console.log('Day 7 Check-in result:', checkinStreak7.success, 'Coins gained:', checkinStreak7.coinsGained, 'Streak:', checkinStreak7.streak, 'New balance:', checkinStreak7.user.virtual_currency);
    if (checkinStreak7.coinsGained !== 13 || checkinStreak7.user.virtual_currency !== 26) {
      throw new Error('Day 7 streak rewards incorrect');
    }

    console.log('\n5. Testing PVE First-Clear rewards...');
    // Clear Level 1 (Bronze - 1 coin)
    let pve1 = await updatePVEProgress(testUid, 2); // unlocks level 2, cleared level 1
    console.log('Clear Level 1 (Bronze):', pve1.firstClear, 'Coins gained:', pve1.coinsAwarded, 'Cleared Level:', pve1.clearedLevel, 'Balance:', pve1.user.virtual_currency);
    if (pve1.coinsAwarded !== 1 || pve1.user.virtual_currency !== 27) {
      throw new Error('Level 1 Bronze rewards incorrect');
    }

    // Attempt clearing Level 1 again (should not award coins)
    let pve1_dup = await updatePVEProgress(testUid, 2);
    console.log('Duplicate Clear Level 1:', pve1_dup.firstClear, 'Coins gained:', pve1_dup.coinsAwarded, 'Balance:', pve1_dup.user.virtual_currency);
    if (pve1_dup.firstClear || pve1_dup.coinsAwarded !== 0) {
      throw new Error('Allowed duplicate Level 1 rewards');
    }

    // Clear Level 20 (Silver - 2 coins)
    let pve20 = await updatePVEProgress(testUid, 21); // clears 20
    console.log('Clear Level 20 (Silver):', pve20.firstClear, 'Coins gained:', pve20.coinsAwarded, 'Balance:', pve20.user.virtual_currency);
    if (pve20.coinsAwarded !== 2 || pve20.user.virtual_currency !== 29) {
      throw new Error('Level 20 Silver rewards incorrect');
    }

    // Clear Level 40 (Gold - 3 coins)
    let pve40 = await updatePVEProgress(testUid, 41); // clears 40
    console.log('Clear Level 40 (Gold):', pve40.firstClear, 'Coins gained:', pve40.coinsAwarded, 'Balance:', pve40.user.virtual_currency);
    if (pve40.coinsAwarded !== 3 || pve40.user.virtual_currency !== 32) {
      throw new Error('Level 40 Gold rewards incorrect');
    }

    console.log('\n6. Testing PVE 60-Stage All-Clear Permanent Passive status...');
    // Manually add remaining levels up to 60 to verify passive
    const all60 = Array.from({ length: 60 }, (_, i) => i + 1);
    await collection.updateOne({ uid: testUid }, { $set: { pve_cleared_stages: all60 } });

    // Perform daily checkin on tomorrow (simulate next day)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    await collection.updateOne({ uid: testUid }, { $set: { last_sign_in_date: yesterdayStr, continuous_days: 0 } }); // set back yesterday and reset streak so we get exactly 3 base + 5 passive = 8

    let checkinPassive = await performCheckIn(testUid);
    console.log('Check-in with All-Clear passive result:', checkinPassive.success, 'Coins gained (should be 3 base + 5 passive = 8):', checkinPassive.coinsGained, 'Balance:', checkinPassive.user.virtual_currency);
    if (checkinPassive.coinsGained !== 8) {
      throw new Error('All-Clear passive reward incorrect');
    }

    // Clean up
    await collection.deleteMany({ uid: testUid });
    console.log('\n🎉 ALL NEW DATABASE FLOW TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

test();
