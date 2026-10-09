require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    console.log(`Fejkar att Tobbes telefon upptäcker att du tackade ja, och automatiskt skickar tillbaka sin position...`);
    
    const response = await fetch(`http://localhost:3000/position/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: 2, // Tobbe
        receiver_id: 3, // Du
        latitude: 59.334591, // Fejkar att han rör sig lite norrut
        longitude: 18.063240,
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
