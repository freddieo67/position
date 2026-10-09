require('dotenv').config();
const { Pool } = require('pg'); 
const pool = new Pool({ connectionString: process.env.DATABASE_URL }); 
pool.query("UPDATE users SET display_name = 'Tobbe' WHERE display_name = 'Testkontakt' OR display_name LIKE '%Testkontakt%';")
  .then(res => { console.log('Updated users: ' + res.rowCount); pool.end(); })
  .catch(err => { console.error(err); pool.end(); });
