import i18n from './i18n';

// Alla signaler man kan skicka. Lägg till en ny rad här (och samma `type` i api/src/index.ts).
// Etiketten översätts via nyckeln `signal_<type>` så att den följer telefonens språk.
export interface SignalType {
  type: string;
  emoji: string;
  readonly label: string;
}

function signal(type: string, emoji: string): SignalType {
  return {
    type,
    emoji,
    get label() {
      return i18n.t(`signal_${type}`);
    },
  };
}

export const SIGNALS: SignalType[] = [
  signal('where', '📍'),
  signal('on_my_way', '🚗'),
  signal('soon', '⏳'),
  signal('coffee', '☕'),
  signal('beer', '🍺'),
];
