import { pool } from '../api/src/db';

async function fakeResponse() {
  try {
    // Hitta senaste förfrågan
    const { rows } = await pool.query(
      `SELECT * FROM position_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1`
    );

    if (rows.length === 0) {
      console.log('Ingen väntande förfrågan hittades.');
      return;
    }

    const req = rows[0];
    console.log('Hittade förfrågan:', req);

    // Uppdatera status till accepted
    await pool.query(
      `UPDATE position_requests SET status = 'accepted' WHERE id = $1`,
      [req.id]
    );

    // Hämta målanvändarens namn (Tobbe)
    const user = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.target_user_id]);
    const targetUser = user.rows[0];

    // Skapa en ny position i positions-tabellen från Tobbe till den som bad om den
    const lat = 59.3293 + (Math.random() * 0.01);
    const lng = 18.0686 + (Math.random() * 0.01);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const posRes = await pool.query(
      `INSERT INTO positions (sender_id, target_user_id, latitude, longitude, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.target_user_id, req.sender_id, lat, lng, expiresAt]
    );

    console.log(`Skapade position ${posRes.rows[0].id} från ${targetUser.name} till användare ${req.sender_id}`);

    // För pushnotis måste vi anropa en funktion i backend (lättast via HTTP om vi kan)
    // Men om vi bara ändrar i databasen kommer det att dyka upp i appen vid nästa poll.
    // Låt oss istället anropa API:et direkt via fetch!
    console.log('Anropar API för att trigga push-notis...');
    const response = await fetch('http://localhost:3000/position/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: req.id,
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
