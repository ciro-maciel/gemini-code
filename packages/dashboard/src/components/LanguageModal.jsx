import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LANGUAGES, currentLanguage, setLanguage } from '../lib/language';

// What each language changes besides the words: the format of dates and
// numbers, from the locale the dashboard writes them in.
const SAMPLE_DATE = new Date(2026, 10, 25);
const sampleOf = (locale) =>
  `${SAMPLE_DATE.toLocaleDateString(locale)} · ${(1234.5).toLocaleString(locale)}`;

const DETAILS = {
  en: { code: 'EN', other: 'Inglês', locale: 'en-US' },
  pt: { code: 'PT', other: 'Portuguese (Brazil)', locale: 'pt-BR' },
};

/**
 * Idioma · Language: the dashboard in English or in Portuguese, chosen here
 * and kept in this browser. Every name stays in its own language and also
 * shows in the other one, so whoever cannot read the current one still finds
 * theirs. The arrows move between the options, Enter chooses, Escape closes.
 */
export function LanguageModal({ opened, onClose }) {
  if (!opened) return null;
  return <LanguagePicker onClose={onClose} />;
}

function LanguagePicker({ onClose }) {
  const current = currentLanguage();
  const [switching, setSwitching] = useState(null);
  const options = useRef([]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    options.current[
      LANGUAGES.findIndex((item) => item.id === current)
    ]?.focus();
    return () => removeEventListener('keydown', onKey);
  }, [current, onClose]);

  const choose = (id) => {
    if (id === current) return onClose();
    setSwitching(id);
    setLanguage(id);
  };

  const onArrow = (event, index) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    options.current[
      (index + step + LANGUAGES.length) % LANGUAGES.length
    ]?.focus();
  };

  return createPortal(
    <div
      className="backdrop pal"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div
        className="ne-lang"
        role="dialog"
        aria-label="Idioma · Language"
        data-no-translate
      >
        <header className="ne-lang-head">
          <span className="ne-lang-glyph" aria-hidden="true">
            <i className="ti ti-language" />
          </span>
          <div className="ne-lang-titles">
            <b>Idioma · Language</b>
            <span>Escolha o idioma do painel · Choose the language</span>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Fechar · Close"
          >
            <i className="ti ti-x" />
          </button>
        </header>

        <div
          className="ne-lang-options"
          role="radiogroup"
          aria-label="Idioma · Language"
        >
          {LANGUAGES.map((language, index) => {
            const detail = DETAILS[language.id];
            const isOn = language.id === current;
            const isSwitching = switching === language.id;
            return (
              <button
                key={language.id}
                ref={(node) => (options.current[index] = node)}
                className={`ne-lang-option${isOn ? ' on' : ''}`}
                role="radio"
                aria-checked={isOn}
                lang={detail.locale}
                disabled={switching !== null}
                onClick={() => choose(language.id)}
                onKeyDown={(event) => onArrow(event, index)}
              >
                <span className="ne-lang-code">{detail.code}</span>
                <span className="ne-lang-text">
                  <span className="ne-lang-name">{language.label}</span>
                  <span className="ne-lang-note">
                    {isSwitching
                      ? language.id === 'pt'
                        ? 'Mudando…'
                        : 'Switching…'
                      : `${detail.other} · ${sampleOf(detail.locale)}`}
                  </span>
                </span>
                <span className="ne-lang-mark" aria-hidden="true">
                  {isSwitching ? (
                    <i className="ti ti-loader-2 ne-lang-spin" />
                  ) : isOn ? (
                    <i className="ti ti-check" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="ne-lang-foot">
          <i className="ti ti-device-desktop" aria-hidden="true" />
          Salvo neste navegador · Saved in this browser
        </footer>
      </div>
    </div>,
    document.body,
  );
}
