/**
 * The panel's language: English, the language the code is written in, or Brazilian Portuguese.
 *
 * The person chooses it in the account card ("Idioma · Language"); until then it follows the browser
 * (Portuguese for pt-*, English for anything else). The choice is kept in this browser.
 *
 * Portuguese is a layer over the English screen, not a second copy of it: every text the code shows has
 * its translation in `pt.json` (texts by exact match, and patterns with {0}, {1}… for the texts built
 * from values). While the language is Portuguese, a MutationObserver puts the Portuguese text in place of
 * the English one in every text node and in the placeholder, title and aria-label attributes, before the
 * browser paints. What a person wrote is never touched: inputs, text areas, anything editable and the
 * areas marked [data-no-translate] (the deck and design canvases) are skipped.
 */

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'pt', label: 'Portuguese' },
];
const STORAGE_KEY = 'language';
const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];
const SKIP =
  'script, style, textarea, input, code, pre, [contenteditable], [data-no-translate]';

/** The language for this browser: the stored choice, else English by default (or Portuguese for pt-*). */
export function languageFor(stored, browserLanguages = []) {
  if (stored === 'pt' || stored === 'en') return stored;
  const first = browserLanguages.find(Boolean) ?? 'en';
  return /^pt\b/i.test(first) ? 'pt' : 'en';
}

export function currentLanguage() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }
  const browser =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return languageFor(stored, browser);
}

/** The locale numbers and dates are written in: en-US in English, pt-BR otherwise. */
export const locale = () => (currentLanguage() === 'en' ? 'en-US' : 'pt-BR');

/** Keeps the choice and reloads, so every screen starts again in the chosen language. */
export function setLanguage(language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // A private window without storage: the choice lasts until the reload.
  }
  window.location.reload();
}

const MAX_VALUE = 60;
const NESTED_LITERAL = 8;
const NUMERIC = /^[\d.,:/\s%]+$/;
// A short value holding a number ("250 de 250", "3 dias") is still a count, not a title.
const isCount = (value) =>
  NUMERIC.test(value) ||
  (/\d/.test(value) && value.trim().split(/\s+/).length <= 3);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A translator from a dictionary: source text in, translation out, or null when it does not know the text. Exported for the test. */
export function makeTranslator(
  { texts = {}, patterns = {} },
  { isLabel = false } = {},
) {
  const exact = new Map(Object.entries(texts));
  // Longest patterns first, so "Excluir {0} cards" wins over "{0} cards".
  const compiled = Object.entries(patterns)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([pt, en]) => ({
      // {n} holds any short value; {#n} only a number, a date or a time, so "{#0} de {#1}" never fits a title.
      re: new RegExp(
        `^${escape(pt).replace(/\\\{(#?)(\d+)\\\}/g, (_, number) => (number ? '([\\d.,:/]+)' : '(.+?)'))}$`,
        's',
      ),
      order: [...pt.matchAll(/\{#?(\d+)\}/g)].map((m) => Number(m[1])),
      literal: pt.replace(/\{#?\d+\}/g, '').trim().length,
      en,
    }));
  // A value inside a pattern may itself be a text or a pattern ("Editado {0}" holding "há {0} dias").
  const core = (value, depth) => {
    const hit = exact.get(value);
    if (hit) return hit;
    if (depth > 2) return null;
    for (const { re, order, literal, en } of compiled) {
      const found = value.match(re);
      if (!found) continue;
      // A value is a number or a short name; a whole sentence in a value is the person's own text that a
      // short pattern happened to fit ("{0} passos" over "…e próximos passos"), so it is left alone.
      if (found.slice(1).some((part) => part.length > MAX_VALUE)) continue;
      // Inside a value, a short pattern only takes a number or a date: "há {0} dias" in "Editado há 15 dias",
      // never "Capa {0}" over the title "Capa H - Gerador de favicon" inside "Abrir {0}".
      if (
        depth > 0 &&
        literal < NESTED_LITERAL &&
        !found.slice(1).every(isCount)
      )
        continue;
      // At the top too, a short pattern never takes a sentence of four words or more: "Plano {0}" over the
      // example "Plano de marketing de lançamento…" turned it into "de marketing de lançamento… plan".
      // An attribute (aria-label, title) is the product's label around a name ("Abrir {0}"), never free text.
      if (
        !isLabel &&
        literal < NESTED_LITERAL &&
        found
          .slice(1)
          .some(
            (part) => !isCount(part) && part.trim().split(/\s+/).length >= 4,
          )
      )
        continue;
      const values = {};
      order.forEach((index, position) => {
        const raw = found[position + 1];
        const inner = raw.trim();
        const english = inner ? core(inner, depth + 1) : null;
        values[index] = english ? raw.replace(inner, english) : raw;
      });
      return en.replace(/\{#?(\d+)\}/g, (_, i) => values[i] ?? '');
    }
    return null;
  };
  return function translate(text) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    let english = core(clean, 0);
    // A line joined with " · " ("Carrossel · 6 páginas · há 15 h") is translated part by part; a part the
    // dictionary does not know (a name the person gave) stays as it is.
    if (!english && clean.includes(' · ')) {
      const parts = clean.split(' · ').map((part) => core(part, 0));
      if (parts.some(Boolean))
        english = clean
          .split(' · ')
          .map((part, index) => parts[index] ?? part)
          .join(' · ');
    }
    return english
      ? text.match(/^\s*/)[0] + english + text.match(/\s*$/)[0]
      : null;
  };
}

/** Puts the translation layer on the page. Returns a function that stops it (tests). */
export function installTranslation(
  dictionary,
  root = document.body,
  { skip = '' } = {},
) {
  const translate = makeTranslator(dictionary);
  const translateLabel = makeTranslator(dictionary, { isLabel: true });
  const selector = skip ? `${SKIP}, ${skip}` : SKIP;
  const isSkipped = (element) => element?.closest?.(selector);
  const textNode = (node) => {
    if (!node.parentElement || isSkipped(node.parentElement)) return;
    const english = translate(node.nodeValue);
    if (english && english !== node.nodeValue) node.nodeValue = english;
  };
  // An input's placeholder, title and label are the product's words; only what the person typed is theirs.
  const isOwnField = (el) => el.matches?.('input, textarea');
  const element = (el) => {
    readOnlyValue(el);
    if (!isOwnField(el) && isSkipped(el)) return;
    if (isOwnField(el) && el.parentElement && isSkipped(el.parentElement))
      return;
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute?.(name);
      if (!value) continue;
      const english = translateLabel(value);
      if (english && english !== value) el.setAttribute(name, english);
    }
  };
  // A Select shows the chosen option's label as the value of a read-only input, set by React as a property,
  // which no MutationObserver sees: the value setter translates it on the way in. What a person types goes
  // into an input that is not read-only, and stays as typed.
  const Input = globalThis.HTMLInputElement;
  const descriptor =
    Input && Object.getOwnPropertyDescriptor(Input.prototype, 'value');
  if (descriptor?.set) {
    Object.defineProperty(Input.prototype, 'value', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(next) {
        const isProductLabel =
          this.readOnly &&
          typeof next === 'string' &&
          !(this.parentElement && isSkipped(this.parentElement));
        descriptor.set.call(
          this,
          isProductLabel ? (translate(next) ?? next) : next,
        );
      },
    });
  }
  const readOnlyValue = (el) => {
    if (
      !el.matches?.('input[readonly]') ||
      (el.parentElement && isSkipped(el.parentElement))
    )
      return;
    const english = translate(el.value);
    if (english && english !== el.value) el.value = english;
  };
  const walk = (start) => {
    if (start.nodeType === 3) return textNode(start);
    if (start.nodeType !== 1) return;
    element(start);
    const walker = document.createTreeWalker(
      start,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 3) textNode(node);
      else element(node);
    }
  };
  walk(root);
  const title = translate(document.title);
  if (title) document.title = title;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') textNode(record.target);
      else if (record.type === 'attributes') element(record.target);
      else for (const node of record.addedNodes) walk(node);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });
  return () => {
    observer.disconnect();
    if (descriptor?.set)
      Object.defineProperty(Input.prototype, 'value', descriptor);
  };
}

// The translator of the active dictionary, for text the code builds from pieces (a list joined with
// "and"), which the page layer cannot match as a whole. English, the source, needs none.
let activeTranslate = null;

/** A text in the reader's language: the dictionary's translation, or the text itself. */
export const t = (text) => (activeTranslate && activeTranslate(text)) ?? text;

/** For tests: set the translator `t` uses (null for English). */
export function useTranslator(translate) {
  activeTranslate = translate;
}

/** Called once at boot, before the first render: the document's language and, in Portuguese, the layer. */
export async function startLanguage({ skip = '' } = {}) {
  const language = currentLanguage();
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';
  if (language !== 'pt') return language;
  const { default: dictionary } = await import('./pt.json');
  activeTranslate = makeTranslator(dictionary);
  installTranslation(dictionary, document.body, { skip });
  return language;
}
