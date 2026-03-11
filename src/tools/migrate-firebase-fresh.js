import '../init';
import firebaseDB from '../firebase-db';

const NODES_TO_CLEAR = ['users', 'orders', 'trips'];

async function runFreshMigration() {
  console.log('Starting Firebase Realtime DB FRESH migration...');
  console.log('This will DELETE all data from the following nodes:');
  NODES_TO_CLEAR.forEach((n) => console.log(`  - /${n}`));
  console.log('');

  try {
    const db = firebaseDB.config();

    for (let i = 0; i < NODES_TO_CLEAR.length; i++) {
      const node = NODES_TO_CLEAR[i];
      console.log(`Clearing /${node}...`);
      await db.ref(node).remove();
      console.log(`  /${node} cleared.`);
    }

    console.log('');
    console.log('Firebase fresh migration completed successfully.');
    console.log('All user, order, and trip data has been removed.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runFreshMigration();
