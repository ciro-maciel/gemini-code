// A file read in parts. On 31/10/2026 an agent read the 88 KB program of the
// Forja 52 (52 weeks) with file_read: all of it went into its context at once,
// four results later the old output was cut to its first 700 characters, and
// the agent stopped saying it had only seen the beginning. Now one read shows
// at most WINDOW_CHARS, says where it cut and how to ask for the rest: by
// lines (startLine, lines), by characters (offset, length), a path in a JSON
// (jsonPath, as "weeks[number=2]") or the lines with a word (search).

export const WINDOW_CHARS = 20_000;
const MAX_MATCHES = 40;
const MATCH_CHARS = 240;

const count = (value) => value.toLocaleString('pt-BR');
const int = (value) =>
  value === undefined || value === null || value === ''
    ? null
    : Number.isFinite(Number(value))
      ? Math.trunc(Number(value))
      : NaN;

/** The lines of a text, each with where it starts. */
function linesOf(text) {
  const lines = text.split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** A JSON path in parts: "weeks[number=2].materials", "weeks.1", "$.cycles[0]". */
export function parsePath(path) {
  const clean = String(path)
    .trim()
    .replace(/^\$\.?/, '');
  const parts = [];
  for (const match of clean.matchAll(/([^.[\]]+)|\[([^\]]*)\]/g)) {
    if (match[1] !== undefined) {
      parts.push(
        /^-?\d+$/.test(match[1])
          ? { index: Number(match[1]), key: match[1] }
          : { key: match[1] },
      );
      continue;
    }
    const inside = match[2].trim();
    const filter = /^([^=]+)=(.*)$/.exec(inside);
    if (/^-?\d+$/.test(inside)) parts.push({ index: Number(inside) });
    else if (filter)
      parts.push({
        field: filter[1].trim(),
        value: filter[2].trim().replace(/^["']|["']$/g, ''),
      });
    else parts.push({ key: inside.replace(/^["']|["']$/g, '') });
  }
  return parts;
}

const shapeOf = (value) => {
  if (Array.isArray(value)) {
    const first = value.find(
      (item) => item && typeof item === 'object' && !Array.isArray(item),
    );
    return `lista de ${value.length}${first ? `; cada item tem ${Object.keys(first).join(', ')}` : ''}`;
  }
  if (value && typeof value === 'object')
    return `objeto com ${Object.keys(value).join(', ')}`;
  return typeof value === 'string'
    ? 'texto'
    : typeof value === 'number'
      ? 'número'
      : String(value);
};

/** What is at the top of a JSON, so the agent knows which path to ask for. */
export function outlineOf(data) {
  if (data && typeof data === 'object' && !Array.isArray(data))
    return Object.entries(data)
      .map(([key, value]) => `- ${key}: ${shapeOf(value)}`)
      .join('\n');
  return `- a raiz: ${shapeOf(data)}`;
}

const label = (parts) =>
  parts
    .map((part) =>
      part.field
        ? `[${part.field}=${part.value}]`
        : part.index !== undefined && part.key === undefined
          ? `[${part.index}]`
          : `.${part.key}`,
    )
    .join('')
    .replace(/^\./, '');

/** The value at a path, or why it is not there. */
export function pick(data, path) {
  let value = data;
  const parts = parsePath(path);
  for (const [at, part] of parts.entries()) {
    const where = label(parts.slice(0, at)) || 'a raiz';
    if (part.field) {
      if (!Array.isArray(value))
        return {
          error: `${where} não é uma lista (é ${shapeOf(value)}); [${part.field}=${part.value}] procura dentro de uma lista`,
        };
      const found = value.filter(
        (item) =>
          item &&
          typeof item === 'object' &&
          String(item[part.field]) === part.value,
      );
      if (!found.length)
        return {
          error: `nenhum item de ${where} tem ${part.field} = ${part.value} (${shapeOf(value)})`,
        };
      value = found.length === 1 ? found[0] : found;
      continue;
    }
    if (Array.isArray(value) && part.index !== undefined) {
      const index = part.index < 0 ? value.length + part.index : part.index;
      if (index < 0 || index >= value.length)
        return {
          error: `${where} tem ${value.length} itens, contados de 0; não há o ${part.index}`,
        };
      value = value[index];
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.hasOwn(value, part.key ?? '')
    ) {
      value = value[part.key];
      continue;
    }
    return {
      error: `não há "${part.key ?? part.index}" em ${where} (${shapeOf(value)})`,
    };
  }
  return { value };
}

/** A window of the text by lines, cut at a line's end so no line arrives in half. */
function byLines(text, { startLine, lines: wanted }) {
  const lines = linesOf(text);
  const first = Math.max(1, startLine ?? 1);
  if (first > lines.length)
    return {
      error: `o arquivo tem ${count(lines.length)} linhas; não há a linha ${count(first)}`,
    };
  const shown = [];
  let size = 0;
  for (let index = first - 1; index < lines.length; index++) {
    if (wanted && shown.length >= wanted) break;
    const line = lines[index];
    if (shown.length && size + line.length + 1 > WINDOW_CHARS) break;
    // One line longer than the window: it arrives cut, and the characters say where.
    if (!shown.length && line.length > WINDOW_CHARS)
      return {
        content: line.slice(0, WINDOW_CHARS),
        first,
        last: first,
        total: lines.length,
        longLine: { index: first, length: line.length },
      };
    shown.push(line);
    size += line.length + 1;
  }
  return {
    content: shown.join('\n'),
    first,
    last: first + shown.length - 1,
    total: lines.length,
  };
}

/**
 * What file_read shows of a text file. Without options a small file comes
 * whole, as it is; a big one comes in its first part, with the line counts,
 * the structure of a JSON and how to ask for the rest.
 */
export function viewFile(shownPath, text, options = {}) {
  const { jsonPath, search } = options;
  const startLine = int(options.startLine);
  const lines = int(options.lines);
  const offset = int(options.offset);
  const length = int(options.length);
  if ([startLine, lines, offset, length].some(Number.isNaN))
    return 'startLine, lines, offset e length são números inteiros';
  const isJson = /\.json$/i.test(shownPath);
  const size = `${count(text.length)} caracteres, ${count(linesOf(text).length)} linhas`;

  if (
    jsonPath !== undefined &&
    jsonPath !== null &&
    String(jsonPath).trim() !== ''
  ) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return `${shownPath} não é um JSON válido (${error.message}); leia por linhas com startLine ou procure com search`;
    }
    const found = pick(data, jsonPath);
    if (found.error)
      return `${shownPath}: ${found.error}.\nO começo do JSON:\n${outlineOf(data)}`;
    const part = JSON.stringify(found.value, null, 2) ?? 'undefined';
    if (part.length <= WINDOW_CHARS)
      return `${shownPath}, ${jsonPath}:\n${part}`;
    const window = byLines(part, { startLine, lines });
    if (window.error) return `${shownPath}, ${jsonPath}: ${window.error}`;
    return `${shownPath}, ${jsonPath} (${count(part.length)} caracteres):\n${window.content}\n[cortado: mostrei as linhas ${window.first} a ${window.last} de ${window.total} deste trecho. Para ver o resto, chame file_read com o mesmo path e jsonPath e startLine ${window.last + 1}, ou peça um caminho mais fundo (${shapeOf(found.value)}).]`;
  }

  if (search !== undefined && search !== null && String(search).trim() !== '') {
    const needle = String(search).trim().toLowerCase();
    const all = linesOf(text)
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(needle));
    if (!all.length)
      return `nenhuma linha de ${shownPath} tem "${search}" (${size})`;
    const shown = all
      .slice(0, MAX_MATCHES)
      .map(
        ({ line, number }) =>
          `${number}: ${line.length > MATCH_CHARS ? `${line.slice(0, MATCH_CHARS)}…` : line}`,
      );
    const more =
      all.length > MAX_MATCHES
        ? ` (mostrei as primeiras ${MAX_MATCHES}; procure algo mais específico para as outras)`
        : '';
    return `${all.length} ${all.length === 1 ? 'linha' : 'linhas'} de ${shownPath} com "${search}"${more}:\n${shown.join('\n')}\n[Para ler em volta de uma delas, chame file_read com startLine nela${isJson ? ', ou peça o trecho com jsonPath' : ''}.]`;
  }

  if (offset !== null || length !== null) {
    const from = Math.max(0, offset ?? 0);
    if (from >= text.length)
      return `${shownPath} tem ${count(text.length)} caracteres; não há o caractere ${count(from)}`;
    const to = Math.min(
      text.length,
      from + Math.min(Math.max(1, length ?? WINDOW_CHARS), WINDOW_CHARS),
    );
    const rest =
      to < text.length
        ? `\n[cortado: mostrei os caracteres ${count(from)} a ${count(to)} de ${count(text.length)}. Para continuar, chame file_read com o mesmo path e offset ${to}.]`
        : `\n[fim do arquivo: mostrei os caracteres ${count(from)} a ${count(to)} de ${count(text.length)}.]`;
    return `${text.slice(from, to)}${rest}`;
  }

  if (startLine === null && lines === null && text.length <= WINDOW_CHARS)
    return text || '(vazio)';

  const window = byLines(text, { startLine, lines });
  if (window.error) return `${shownPath}: ${window.error}`;
  if (window.longLine) {
    return `${window.content}\n[cortado: a linha ${window.longLine.index} sozinha tem ${count(window.longLine.length)} caracteres e mostrei os primeiros ${count(WINDOW_CHARS)}. Para continuar, chame file_read com o mesmo path e offset (em caracteres)${isJson ? ', ou peça um trecho com jsonPath' : ''}.]`;
  }
  const isWhole = window.first === 1 && window.last === window.total;
  if (isWhole) return window.content || '(vazio)';
  const isEnd = window.last === window.total;
  const next = isEnd
    ? ''
    : ` Para continuar, chame file_read com o mesmo path e startLine ${window.last + 1}.`;
  let structure = '';
  if (isJson && !isEnd) {
    try {
      structure = `\nO começo do JSON, para pedir só um trecho com jsonPath (ex.: "chave[campo=valor]", "chave.0"):\n${outlineOf(JSON.parse(text))}`;
    } catch {}
  }
  const note = `[${isEnd ? 'fim do arquivo' : 'cortado'}: mostrei as linhas ${window.first} a ${window.last} de ${window.total} (${size}).${next}${isEnd ? '' : ' Para achar onde algo está, use search.'}]`;
  return `${window.content}\n${note}${structure}`;
}
