import { pool } from './db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Skapar token-kolumnen och cooldown-tabeller om de saknas (körs vid uppstart)
export async function ensurePushSchema() {
  await pool.query('ALTER TABLE public.users ADD COLUMN IF NOT EXISTS expo_push_token TEXT');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.signal_cooldowns (
      sender_id   INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      last_sent   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (sender_id, receiver_id)
    );
  `);
}

export async function getDisplayName(userId: number): Promise<string> {
  const r = await pool.query('SELECT display_name FROM public.users WHERE id = $1', [userId]);
  return r.rows[0]?.display_name ?? 'Någon';
}

export async function sendPush(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  categoryId?: string
) {
  try {
    const r = await pool.query('SELECT expo_push_token FROM public.users WHERE id = $1', [userId]);
    const token: string | null = r.rows[0]?.expo_push_token ?? null;
    if (!token) return;

    const payload: Record<string, unknown> = {
      to: token,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
    };
    if (categoryId) {
      payload.categoryId = categoryId;
      payload._category = categoryId;
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => null);
    const ticket = json?.data;
    // Ogiltig/avregistrerad enhet: rensa token så vi slutar försöka
    if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
      await pool.query('UPDATE public.users SET expo_push_token = NULL WHERE id = $1', [userId]);
    } else if (ticket?.status === 'error') {
      console.warn('Push misslyckades:', ticket.message);
    }
  } catch (error) {
    console.warn('Kunde inte skicka push:', error);
  }
}
