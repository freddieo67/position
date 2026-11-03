// Alla signaler man kan skicka. Lägg till en ny rad här (och samma `type` i api/src/index.ts).
export interface SignalType {
  type: string;
  emoji: string;
  label: string;
}

export const SIGNALS: SignalType[] = [
  { type: 'beer', emoji: '🍺', label: 'Öl?' },
  { type: 'hug', emoji: '🤗', label: 'Kram' },
  { type: 'great', emoji: '👍', label: 'Great' },
  { type: 'angry', emoji: '😠', label: 'Arg' },
  { type: 'happy', emoji: '😊', label: 'Glad' },
];
