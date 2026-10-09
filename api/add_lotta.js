require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query("INSERT INTO users (phone_number, display_name) VALUES ('+46700000002', 'Lotta')")
  .then(() => { console.log('Lotta skapad med nummer +46700000002'); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });
