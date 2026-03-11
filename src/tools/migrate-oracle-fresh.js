import oracledb from 'oracledb';
import { initOracleDb, getOracleConnection } from '../support/oracle-db';

async function runFreshMigration() {
  console.log('Starting Oracle DB FRESH migration...');
  
  // Create connection pool directly for the drop operations
  let pool;
  try {
    pool = await oracledb.createPool({
      user: 'system',
      password: 'oracle',
      connectString: '192.168.1.29:1521/XEPDB1',
      poolMin: 1,
      poolMax: 5,
      poolIncrement: 1
    });
    
    const connection = await pool.getConnection();
    
    // Drop existing tables
    const tablesToDrop = ['trip_logs', 'app_configs', 'queue_jobs'];
    
    for (let i = 0; i < tablesToDrop.length; i++) {
      const table = tablesToDrop[i];
      try {
        console.log(`Dropping table ${table}...`);
        await connection.execute(`DROP TABLE ${table} CASCADE CONSTRAINTS`);
        console.log(`Table ${table} dropped successfully.`);
      } catch (err) {
        // ORA-00942: table or view does not exist
        if (err.errorNum === 942) {
          console.log(`Table ${table} does not exist, skipping drop.`);
        } else {
          console.error(`Error dropping table ${table}:`, err.message);
        }
      }
    }
    
    await connection.close();
    
    // Close the temporary pool
    await pool.close(10);
    
    console.log('\n--- Recreating tables ---');
    // Memanggil fungsi init yang sudah ada di oracle-db yang akan create table kembali
    await initOracleDb();
    
    console.log('Fresh migration completed successfully.');
    
    // Menutup pool utama yang dibuat oleh initOracleDb
    try {
      await oracledb.getPool().close(10);
      console.log('Main pool closed.');
    } catch (err) {
      console.error('Error closing main pool:', err.message);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runFreshMigration();
