import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { completeJson } from './engine/model.js';

// Each bot's mascot is an illustration from the licensed bank in
// ASSETS_DIR (bring your own licensed set; none ships with this repository). The
// model picks the one that fits the bot; the person can change it.

const manifestPath = path.join(config.assetsDir, 'manifest.json');
const catalog = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8')).map(
      ({ id, label, description, tags }) => ({
        id,
        label,
        description,
        tags: tags.filter(
          (tag) =>
            ![
              'animated',
              'lottie',
              'motion',
              'monochrome',
              'gray',
              'dark',
            ].includes(tag),
        ),
      }),
    )
  : [];
const ids = new Set(catalog.map((item) => item.id));

export function listMascots() {
  return catalog;
}

export function isMascot(id) {
  return ids.has(id);
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** The best illustration for a bot, avoiding the ones other bots already wear. */
export async function chooseMascot({ name, instructions = '', usedIds = [] }) {
  if (catalog.length === 0) return null;
  const used = new Set(usedIds);
  const available = catalog.filter((item) => !used.has(item.id));
  const pool = available.length ? available : catalog;
  const fallback = pool[hash(name) % pool.length].id;
  try {
    const list = pool
      .map(
        (item) =>
          `${item.id} | ${item.label} | ${item.tags.slice(0, 6).join(', ')}`,
      )
      .join('\n');
    const { value } = await completeJson({
      model: config.riskModel,
      system:
        'Você escolhe a ilustração que serve de mascote para um assistente, pelo que o nome e as instruções dizem que ele faz. Responda {"id":"<id exato da lista>"}.',
      user: `Assistente: ${name}\nInstruções: ${instructions.slice(0, 600) || '(nenhuma)'}\n\nIlustrações (id | nome | assuntos):\n${list}`,
    });
    return ids.has(value.id) ? value.id : fallback;
  } catch {
    return fallback;
  }
}

// --- Gray only ------------------------------------------------------------
// Every illustration lives entirely on the brand's gray scale (CLAUDE.md §8):
// art that arrives in color is converted before it enters. Each color becomes
// its own luminance.

function toGray(red, green, blue) {
  const level = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
  const hex = level.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

function grayscale(svg) {
  return svg
    .replace(/#([0-9a-f]{6})\b/gi, (_, hex) =>
      toGray(
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ),
    )
    .replace(/#([0-9a-f]{3})\b/gi, (_, hex) =>
      toGray(...[...hex].map((digit) => parseInt(digit + digit, 16))),
    )
    .replace(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi,
      (match, red, green, blue) =>
        match.replace(
          /\(\s*\d+\s*,\s*\d+\s*,\s*\d+/,
          `(${[red, green, blue].map(() => Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)).join(',')}`,
        ),
    );
}

const cache = new Map();

export function readMascotSvg(id) {
  if (!ids.has(id)) return null;
  if (!cache.has(id))
    cache.set(
      id,
      grayscale(readFileSync(path.join(config.assetsDir, 'svg', id), 'utf8')),
    );
  return cache.get(id);
}
