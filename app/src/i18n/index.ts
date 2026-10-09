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
  nl,
  pt,
  el,
  hi,
  ja,
  ko,
  id,
  bn,
});

// Sätt appens språk baserat på telefonens inställningar
i18n.locale = Localization.getLocales()[0]?.languageCode ?? 'en';

// Om en text saknas på valt språk, fall tillbaka till engelska
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;
