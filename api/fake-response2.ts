import { pool } from './src/db';

async function fakeResponse() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM location_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1`
    );

    if (rows.length === 0) {
      console.log('Ingen väntande förfrågan hittades.');
      return;
    }

    const req = rows[0];
    console.log('Hittade förfrågan:', req);

    const lat = 59.3293 + (Math.random() * 0.01);
    const lng = 18.0686 + (Math.random() * 0.01);

    console.log('Anropar API för att svara på förfrågan...');
    const response = await fetch(`http://localhost:3000/requests/${req.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: req.target_id, 
        accept: true,
        latitude: lat,
        longitude: lng
      })
    });
    
    console.log('API-svar:', await response.text());
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

fakeResponse();
