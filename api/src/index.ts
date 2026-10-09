import express from 'express';
import cors from 'cors';
import type { PoolClient } from 'pg';
import { pool } from './db';
import { ensurePushSchema, getDisplayName, sendPush } from './push';

const app = express();
const port = process.env.PORT || 3000;

const SHARE_MINUTES = 10;   // hur länge en delad position syns
const REQUEST_MINUTES = 10; // hur länge en förfrågan kan besvaras

app.use(cors());
app.use(express.json());

// Normaliserar svenska nummer till E.164, t.ex. "070-999 80 90" -> "+46709998090"
function normalizePhone(raw: string): string {
  let n = String(raw).replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  else if (n.startsWith('0')) n = '+46' + n.slice(1);
  else if (!n.startsWith('+')) n = '+' + n;
  return n;
}

interface Coords {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
}

function parseCoords(body: any): Coords | null {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (
    body?.latitude == null || body?.longitude == null ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) {
    return null;
  }
  const accuracy = Number(body?.accuracy_meters);
  return { latitude, longitude, accuracy_meters: Number.isFinite(accuracy) ? accuracy : null };
}

function parseId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Sparar en delad position (sender -> receiver) som syns i SHARE_MINUTES
async function insertShare(
  client: PoolClient,
  senderId: number,
  receiverId: number,
  coords: Coords,
  requestId: number | null
) {
  const result = await client.query(
    `INSERT INTO public.position_requests
       (sender_id, receiver_id, location, accuracy_meters, expires_at, shared_at, status, request_id)
     VALUES
       ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, NOW() + make_interval(mins => $6::int), NOW(), 'shared', $7)
     RETURNING id, expires_at`,
    [senderId, receiverId, coords.longitude, coords.latitude, coords.accuracy_meters, SHARE_MINUTES, requestId]
  );
  return result.rows[0];
}

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db_time: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Skapa en ny användare (eller logga in)
app.post('/users', async (req, res) => {
  const { phone_number, display_name } = req.body;
  if (!phone_number || !display_name) {
    return res.status(400).json({ error: 'phone_number and display_name are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO public.users (phone_number, display_name) 
       VALUES ($1, $2) 
       ON CONFLICT (phone_number) DO UPDATE SET display_name = EXCLUDED.display_name 
       RETURNING id, phone_number, display_name, created_at`,
      [normalizePhone(phone_number), display_name]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hämta en användare (används av appen för att verifiera sparad inloggning)
app.get('/users/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid user id' });

  try {
    const result = await pool.query(
      'SELECT id, phone_number, display_name, created_at FROM public.users WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Spara enhetens Expo push-token för en användare
app.put('/users/:id/push-token', async (req, res) => {
  const id = parseId(req.params.id);
  const token = typeof req.body.token === 'string' ? req.body.token : null;
  if (!id) return res.status(400).json({ error: 'Invalid user id' });

  try {
    const result = await pool.query(
      'UPDATE public.users SET expo_push_token = $2 WHERE id = $1 RETURNING id',
      [id, token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Signaler som bara visas som push-avisering (sparas inte). {name} byts mot avsändarens namn.
const SIGNALS: Record<string, { title: string; body: string }> = {
  beer: { title: '🍺 {name} bjuder dig på en öl', body: 'Hur säger du nej till det?' },
  hug: { title: '🤗 {name} skickar en kram', body: 'Det behövs ibland.' },
  kiss: { title: '😘 {name} skickar en kyss', body: 'Mwah!' },
};

app.post('/signals', async (req, res) => {
  const senderId = parseId(req.body.sender_id);
  const receiverId = parseId(req.body.receiver_id);
  const signal = SIGNALS[String(req.body.type)];

  if (!senderId || !receiverId) {
    return res.status(400).json({ error: 'sender_id and receiver_id are required' });
  }
  if (senderId === receiverId) {
    return res.status(400).json({ error: 'Cannot send a signal to yourself' });
  }
  if (!signal) return res.status(400).json({ error: 'Unknown signal type' });

  try {
    const name = await getDisplayName(senderId);
    await sendPush(receiverId, signal.title.replace('{name}', name), signal.body, {
      type: 'signal',
      signal: req.body.type,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Hitta vänner från telefonboken
app.post('/contacts/match', async (req, res) => {
  const { phone_numbers } = req.body; // array av strängar
  if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
    return res.json({ matches: [] });
  }

  try {
    const result = await pool.query(
      `SELECT id, phone_number, display_name FROM public.users WHERE phone_number = ANY($1::varchar[])`,
      [phone_numbers.map(normalizePhone)]
    );
    res.json({ matches: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dela position med en annan användare (löper ut efter 5 minuter).
// Om request_id anges är det frågarens automatiska motdelning efter att mottagaren tackat ja.
app.post('/position/share', async (req, res) => {
  const senderId = parseId(req.body.sender_id);
  const receiverId = parseId(req.body.receiver_id);
  const requestId = req.body.request_id != null ? parseId(req.body.request_id) : null;
  const coords = parseCoords(req.body);

  if (!senderId || !receiverId) {
    return res.status(400).json({ error: 'sender_id and receiver_id are required' });
  }
  if (senderId === receiverId) {
    return res.status(400).json({ error: 'Cannot share position with yourself' });
  }
  if (!coords) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (requestId !== null) {
      const updated = await client.query(
        `UPDATE public.location_requests
            SET reciprocated_at = NOW()
          WHERE id = $1 AND requester_id = $2 AND target_id = $3
            AND status = 'accepted' AND reciprocated_at IS NULL
          RETURNING id`,
        [requestId, senderId, receiverId]
      );
      if (updated.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Request not found, not accepted or already reciprocated' });
      }
    }

    const share = await insertShare(client, senderId, receiverId, coords, requestId);
    await client.query('COMMIT');
    res.json(share);
    
    // Motdelning efter ett ja är redan känd för frågaren, så bara notis vid vanlig delning
    if (requestId === null) {
      const customMsg = typeof req.body.message === 'string' && req.body.message.trim().length > 0 
        ? req.body.message.trim().slice(0, 100) 
        : null;
        
      getDisplayName(senderId).then(name => {
        const bodyText = customMsg ? `Meddelande: ${customMsg}` : 'Öppna appen för att se var hen är.';
        sendPush(receiverId, `${name} delade sin position`, bodyText, { type: 'share', sender_id: senderId });
      });
    }
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23503') return res.status(404).json({ error: 'User not found' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Begär någons position
app.post('/requests', async (req, res) => {
  const requesterId = parseId(req.body.requester_id);
  const targetId = parseId(req.body.target_id);

  if (!requesterId || !targetId) {
    return res.status(400).json({ error: 'requester_id and target_id are required' });
  }
  if (requesterId === targetId) {
    return res.status(400).json({ error: 'Cannot request your own position' });
  }

  try {
    // Redan delad position: ingen idé att fråga igen innan den gått ut
    const active = await pool.query(
      `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())) / 60))::int AS minutes_left
         FROM public.position_requests
        WHERE sender_id = $1 AND receiver_id = $2 AND location IS NOT NULL AND expires_at > NOW()
        ORDER BY expires_at DESC LIMIT 1`,
      [targetId, requesterId]
    );
    if (active.rows[0]) {
      const name = await getDisplayName(targetId);
      return res.status(409).json({
        error: `${name} delar redan sin position med dig, ${active.rows[0].minutes_left} min kvar.`,
        code: 'ALREADY_SHARING',
        minutes_left: active.rows[0].minutes_left,
      });
    }

    // Återanvänd en redan väntande förfrågan i stället för att skapa dubbletter
    const existing = await pool.query(
      `SELECT id, status, expires_at FROM public.location_requests
        WHERE requester_id = $1 AND target_id = $2 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [requesterId, targetId]
    );
    if (existing.rows[0]) return res.json(existing.rows[0]);

    const result = await pool.query(
      `INSERT INTO public.location_requests (requester_id, target_id, expires_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3::int))
       RETURNING id, status, expires_at`,
      [requesterId, targetId, REQUEST_MINUTES]
    );
    res.json(result.rows[0]);
    getDisplayName(requesterId).then(name =>
      sendPush(targetId, `${name} vill se din position`, 'Öppna appen för att svara.', { type: 'request' })
    );
  } catch (error: any) {
    if (error?.code === '23503') return res.status(404).json({ error: 'User not found' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Svara på en förfrågan. Vid ja delas mottagarens position direkt med frågaren;
// frågarens app delar sedan automatiskt tillbaka (se /position/share med request_id).
app.post('/requests/:id/respond', async (req, res) => {
  const requestId = parseId(req.params.id);
  const userId = parseId(req.body.user_id);
  const accept = req.body.accept === true;
  const coords = accept ? parseCoords(req.body) : null;

  if (!requestId || !userId) {
    return res.status(400).json({ error: 'Valid request id and user_id are required' });
  }
  if (accept && !coords) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required to accept' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE public.location_requests
          SET status = $3, responded_at = NOW()
        WHERE id = $1 AND target_id = $2 AND status = 'pending' AND expires_at > NOW()
        RETURNING requester_id`,
      [requestId, userId, accept ? 'accepted' : 'declined']
    );
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Request not found, already answered or expired' });
    }

    let share = null;
    if (accept) {
      share = await insertShare(client, userId, updated.rows[0].requester_id, coords!, requestId);
    }
    await client.query('COMMIT');
    res.json({ status: accept ? 'accepted' : 'declined', share });
    const requesterId: number = updated.rows[0].requester_id;
    getDisplayName(userId).then(name =>
      accept
        ? sendPush(requesterId, `${name} delade sin position`, 'Öppna appen för att se var hen är.', { type: 'share', sender_id: userId })
        : sendPush(requesterId, 'Nekad', `${name} valde att inte dela sin position.`, { type: 'declined' })
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Allt appen behöver veta vid varje uppdatering:
// - positions: aktiva positioner som delats med mig (senaste per avsändare)
// - requests:  väntande förfrågningar till mig
// - outgoing:  mina senaste förfrågningar och deras status
app.get('/users/:id/inbox', async (req, res) => {
  const userId = parseId(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Invalid user id' });

  try {
    const [positions, requests, outgoing, sharing] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (p.sender_id)
                p.id, p.sender_id, u.display_name AS sender_name,
                ST_Y(p.location) AS latitude, ST_X(p.location) AS longitude,
                p.accuracy_meters, p.shared_at, p.expires_at
           FROM public.position_requests p
           JOIN public.users u ON u.id = p.sender_id
          WHERE p.receiver_id = $1 AND p.expires_at > NOW() AND p.location IS NOT NULL
          ORDER BY p.sender_id, p.shared_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT r.id, r.requester_id, u.display_name AS requester_name, r.created_at, r.expires_at
           FROM public.location_requests r
           JOIN public.users u ON u.id = r.requester_id
          WHERE r.target_id = $1 AND r.status = 'pending' AND r.expires_at > NOW()
          ORDER BY r.created_at`,
        [userId]
      ),
      pool.query(
        `SELECT r.id, r.target_id, u.display_name AS target_name, r.status,
                r.created_at, r.expires_at, r.responded_at, r.reciprocated_at
           FROM public.location_requests r
           JOIN public.users u ON u.id = r.target_id
          WHERE r.requester_id = $1 AND r.created_at > NOW() - INTERVAL '15 minutes'
          ORDER BY r.created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT DISTINCT receiver_id 
           FROM public.position_requests 
          WHERE sender_id = $1 AND expires_at > NOW()`,
        [userId]
      ),
    ]);

    res.json({
      positions: positions.rows,
      requests: requests.rows,
      outgoing: outgoing.rows,
      sharing: sharing.rows.map(r => r.receiver_id),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

ensurePushSchema()
  .catch(error => console.error('Kunde inte uppdatera schema:', error))
  .finally(() => {
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
    });
  });

