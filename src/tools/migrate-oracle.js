import oracledb from 'oracledb';
import { initOracleDb } from '../support/oracle-logger';

async function runMigration() {
  console.log('Starting Oracle DB migration...');
  
  // Memanggil fungsi init yang sudah ada di oracle-logger
  // Fungsi ini sudah berisi query CREATE TABLE trip_logs
  await initOracleDb();
  
  console.log('Migration completed.');
  
  // Karena initOracleDb mengatur connection pool, kita perlu menutup pool agar proses Node.js bisa berhenti
  try {
    await oracledb.getPool().close(10);
    console.log('Pool closed.');
  } catch (err) {
    console.error('Error closing pool:', err.message);
  }
  
  process.exit(0);
}

runMigration();
