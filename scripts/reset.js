import { config } from '../src/config.js';
import { buildSeedData } from '../src/lib/seedData.js';
import { store } from '../src/store/dataStore.js';

async function main() {
  const seedData = buildSeedData();
  await store.replaceAll(seedData);
  console.log('Reset complete — data restored to sample seed.');
  console.log(`  Data: ${config.dataPath}`);
  console.log(`  Ranges: ${seedData.ranges.length}`);
  console.log(`  Players: ${seedData.players.length}`);
  console.log(`  Bookings: ${seedData.bookings.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
