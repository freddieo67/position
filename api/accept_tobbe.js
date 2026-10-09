require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    // Leta upp den senaste väntande förfrågan till Tobbe (id 2)
    const res = await pool.query("SELECT id FROM location_requests WHERE target_id = 2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1");
    
    if (res.rows.length === 0) {
      console.log('Hittade ingen förfrågan till Tobbe just nu.');
      process.exit(1);
    }
    
    const reqId = res.rows[0].id;
    console.log(`Tobbe tackar ja till förfrågan #${reqId}...`);
    
    // Skicka "accept" med fiktiva koordinater (Stockholm)
    const response = await fetch(`http://localhost:3000/requests/${reqId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 2,
        accept: true,
        latitude: 59.3293,
        longitude: 18.0686,
        accuracy_meters: 5
      })
    });
    
    const data = await response.json();
    console.log('Svar från API:', data);
  } catch (error) {
    console.error('Ett fel uppstod:', error);
  } finally {
    pool.end();
  }
}
run();
