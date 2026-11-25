import { useRef, useState } from 'react';

import { LANGUAGES, currentLanguage, setLanguage } from '../lib/language';

// What each language changes besides the words: the format of dates and
// numbers, from the locale the dashboard writes them in.
const SAMPLE_DATE = new Date(2026, 10, 25);
const sampleOf = (locale) =>
  `${SAMPLE_DATE.toLocaleDateString(locale)} · ${(1234.5).toLocaleString(locale)}`;

const DETAILS = {
  en: { other: 'Inglês', locale: 'en-US', switching: 'Switching…' },
  pt: {
    other: 'Portuguese (Brazil)',
    locale: 'pt-BR',
    switching: 'Mudando…',
  },
};

/**
 * Settings › Language · Idioma, as Google's settings draw a choice: one list,
 * a radio per row, the name in its own language and, under it, the name in
 * the other one and the date and number format it brings. Both stay
 * untranslated, so whoever cannot read the current language still finds
 * theirs. The arrows move, Space or Enter chooses; the page reloads in it.
 */
export function LanguageSettings() {
  const current = currentLanguage();
  const [switching, setSwitching] = useState(null);
  const rows = useRef([]);

  const choose = (id) => {
    if (id === current || switching) return;
    setSwitching(id);
    setLanguage(id);
  };
  const onKey = (event, index) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    rows.current[(index + step + LANGUAGES.length) % LANGUAGES.length]?.focus();
  };

  return (
    <div className="set-language" data-no-translate>
      <div>
        <h2 className="set-h">Language · Idioma</h2>
        <p className="lead" style={{ marginTop: 6 }}>
          The language of the dashboard in this browser. · O idioma do painel
          neste navegador.
        </p>
      </div>
      <div
        className="box gm-radio-list"
        role="radiogroup"
        aria-label="Language · Idioma"
      >
        {LANGUAGES.map((language, index) => {
          const detail = DETAILS[language.id];
          const isOn = language.id === current;
          return (
            <button
              key={language.id}
              ref={(node) => (rows.current[index] = node)}
              className={`gm-radio-row${isOn ? ' on' : ''}`}
              role="radio"
              aria-checked={isOn}
              tabIndex={isOn ? 0 : -1}
              lang={detail.locale}
              disabled={switching !== null && switching !== language.id}
              onClick={() => choose(language.id)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <span className="gm-radio" aria-hidden="true" />
              <span className="gm-radio-text">
                <span className="gm-radio-title">{language.label}</span>
                <span className="gm-radio-note">
                  {switching === language.id
                    ? detail.switching
                    : `${detail.other} · ${sampleOf(detail.locale)}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
