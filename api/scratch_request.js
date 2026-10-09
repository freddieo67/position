require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const user = await pool.query("SELECT id FROM users WHERE phone_number = '+46722518961'");
    if (user.rows.length === 0) { 
      console.log('Användaren hittades inte i databasen.'); 
      process.exit(1); 
    }
    const targetId = user.rows[0].id;
    
    // Försök hitta Tobbe, annars ta användare 1
    const tobbe = await pool.query("SELECT id FROM users WHERE display_name = 'Tobbe' LIMIT 1");
    const requesterId = tobbe.rows.length > 0 ? tobbe.rows[0].id : 1;

    console.log(`Skickar förfrågan från Tobbe (id: ${requesterId}) till dig (id: ${targetId})...`);
    
    const res = await fetch('http://localhost:3000/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester_id: requesterId, target_id: targetId })
    });
    
    const data = await res.json();
    console.log('Svar från API:', data);
  } catch (error) {
    console.error('Ett fel uppstod:', error);
  } finally {
    pool.end();
  }
}
run();
