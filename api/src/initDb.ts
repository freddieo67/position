import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

// Kör schema.sql mot DATABASE_URL. Användning: npm run db:init
(async () => {
  const sql = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Databasschema skapat/uppdaterat.');
  } catch (err) {
    console.error('Kunde inte skapa schema:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
