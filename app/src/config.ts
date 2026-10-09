// Adress till backend (api/). 
// Kan överskridas med miljövariabeln EXPO_PUBLIC_API_URL (t.ex. i app/.env).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://position-614814853862.europe-north1.run.app';

// Normaliserar svenska nummer till E.164, t.ex. "070-999 80 90" -> "+46709998090"
export function normalizePhone(raw: string): string {
  let n = String(raw).replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  else if (n.startsWith('0')) n = '+46' + n.slice(1);
  else if (!n.startsWith('+')) n = '+' + n;
  return n;
}

export class ApiError extends Error {
  status: number; // 0 = nätverksfel (API:t kunde inte nås)
  serverMessage?: string; // felmeddelande från servern, avsett att visas för användaren

  constructor(message: string, status: number, serverMessage?: string) {
    super(message);
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError(`Kunde inte nå API på ${API_URL} (${String(error)})`, 0);
  }

  const text = await response.text();
  if (!response.ok) {
    let serverMessage: string | undefined;
    try {
      serverMessage = JSON.parse(text)?.error;
    } catch {}
    throw new ApiError(`HTTP ${response.status} från ${path}: ${text.slice(0, 200)}`, response.status, serverMessage);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(`Svaret från ${path} var inte JSON: ${text.slice(0, 200)}`, response.status);
  }
}

export const apiGet = <T = any>(path: string) => request<T>('GET', path);
export const apiPost = <T = any>(path: string, body: unknown) => request<T>('POST', path, body);
export const apiPut = <T = any>(path: string, body: unknown) => request<T>('PUT', path, body);
