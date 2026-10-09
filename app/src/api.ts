import { apiGet, apiPost, apiPut } from './config';

export interface User {
  id: number;
  phone_number: string;
  display_name: string;
}

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
}

// En position som någon har delat med mig
export interface IncomingPosition {
  id: number;
  sender_id: number;
  sender_name: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  shared_at: string;
  expires_at: string;
}

// Någon vill se min position
export interface IncomingRequest {
  id: number;
  requester_id: number;
  requester_name: string;
  created_at: string;
  expires_at: string;
}

// Jag har bett någon om deras position
export interface OutgoingRequest {
  id: number;
  target_id: number;
  target_name: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  reciprocated_at: string | null;
}

export interface Inbox {
  positions: IncomingPosition[];
  requests: IncomingRequest[];
  outgoing: OutgoingRequest[];
  sharing: number[];
}

export const api = {
  register: (phone_number: string, display_name: string) =>
    apiPost<User>('/users', { phone_number, display_name }),

  getUser: (id: number) => apiGet<User>(`/users/${id}`),

  matchContacts: (phone_numbers: string[]) =>
    apiPost<{ matches: User[] }>('/contacts/match', { phone_numbers }),

  sharePosition: (body: Coords & { sender_id: number; receiver_id: number; request_id?: number | null; message?: string }) =>
    apiPost<{ id: number; expires_at: string }>('/position/share', body),

  requestPosition: (requester_id: number, target_id: number) =>
    apiPost<{ id: number; status: string; expires_at: string }>('/requests', { requester_id, target_id }),

  respondToRequest: (requestId: number, body: { user_id: number; accept: boolean } & Partial<Coords>) =>
    apiPost<{ status: string }>(`/requests/${requestId}/respond`, body),

  inbox: (userId: number) => apiGet<Inbox>(`/users/${userId}/inbox`),

  sendSignal: (sender_id: number, receiver_id: number, type: string) =>
    apiPost<{ ok: boolean }>('/signals', { sender_id, receiver_id, type }),

  savePushToken: (userId: number, token: string | null) =>
    apiPut<{ ok: boolean }>(`/users/${userId}/push-token`, { token }),
};
