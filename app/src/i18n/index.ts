import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';

import { sv } from './sv';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { da } from './da';
import { fi } from './fi';
import { it } from './it';
import { pl } from './pl';
import { fr } from './fr';
import { no } from './no';
import { nl } from './nl';
import { pt } from './pt';
import { el } from './el';
import { hi } from './hi';
import { ja } from './ja';
import { ko } from './ko';
import { id } from './id';
import { bn } from './bn';

const i18n = new I18n({
  sv,
  en,
  es,
  de,
  da,
  fi,
  it,
  pl,
  fr,
  no,
  nb: no,
  nn: no,
  nl,
  pt,
  el,
  hi,
  ja,
  ko,
  id,
  bn,
});

const SUPPORTED_LANGUAGES = Object.keys(i18n.translations);

// Äldre språkkoder som vissa Android-versioner rapporterar
const LANGUAGE_ALIASES: Record<string, string> = { in: 'id' };

// Telefonens systemspråk styr appens språk: välj första av användarens föredragna språk som appen stödjer
export function syncSystemLocale(): string {
  let code = 'en';
  try {
    const preferred = (Localization.getLocales && Localization.getLocales()) || [];
    for (const l of preferred) {
      const raw = (l.languageCode || l.languageTag?.split(/[-_]/)[0] || '').toLowerCase();
      const candidate = LANGUAGE_ALIASES[raw] ?? raw;
      if (candidate && SUPPORTED_LANGUAGES.includes(candidate)) {
        code = candidate;
        break;
      }
    }
    // Fallback för plattformar där getLocales() inte returnerar array men Localization.locale finns
    if (code === 'en' && preferred.length === 0 && (Localization as any).locale) {
      const raw = String((Localization as any).locale).split(/[-_]/)[0].toLowerCase();
      const candidate = LANGUAGE_ALIASES[raw] ?? raw;
      if (candidate && SUPPORTED_LANGUAGES.includes(candidate)) {
        code = candidate;
      }
    }
  } catch (err) {
    console.warn('Kunde inte läsa systemspråk:', err);
  }
  i18n.locale = code;
  return code;
}

// Sätt appens språk baserat på telefonens inställningar
syncSystemLocale();

// Om en text saknas på valt språk, fall tillbaka till engelska
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;
