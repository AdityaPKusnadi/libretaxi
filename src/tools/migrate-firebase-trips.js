import firebaseDB from '../firebase-db';
import { getOracleConnection } from '../support/oracle-db';
import '../init';

async function migrateTrips() {
  console.log('Starting migration from Firebase "trips" to Oracle...');
  
  const db = firebaseDB.config();
  const tripsRef = db.ref('trips');
  
  try {
    const snap = await tripsRef.once('value');
    const data = snap.val() || {};
    const keys = Object.keys(data);
    
    console.log(`Found ${keys.length} trips in Firebase.`);
    
    if (keys.length === 0) {
      console.log('No trips to migrate.');
      process.exit(0);
    }

    const connection = await getOracleConnection();
    if (!connection) {
      console.error('Failed to get Oracle connection.');
      process.exit(1);
    }
    
    let migratedCount = 0;
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const t = data[key];
      
      const sql = `
        INSERT INTO trip_logs 
        (passenger_name, driver_name, driver_phone, trip_distance, trip_fare, rate_description, created_at)
        VALUES (:1, :2, :3, :4, :5, :6, :7)
      `;
      
      // Calculate created_at
      let createdAt = new Date();
      if (t.createdAt) {
        createdAt = new Date(t.createdAt);
      }
      
      const binds = [
        t.passengerName || 'Rider',
        t.driverName || 'Driver',
        t.driverPhone || 'N/A',
        t.tripDistance || 0,
        t.tripFare || t.fare || 0,
        t.rateDescription || '',
        createdAt
      ];
      
      try {
        await connection.execute(sql, binds);
        migratedCount++;
      } catch (err) {
        console.error(`Failed to migrate trip ${key}:`, err.message);
      }
    }
    
    console.log(`Successfully migrated ${migratedCount} out of ${keys.length} trips.`);
    
    await connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrateTrips();
