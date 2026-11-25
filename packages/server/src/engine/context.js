// How much of its context window the model read at the last step: the ring in
// the composer. The window of each model is what OpenRouter publishes, read
// once a day; until it arrives (or if it fails) the ring stays empty.

const DAY_MS = 86_400_000;
let windows = new Map();
let loadedAt = 0;
let loading = null;
let load = () =>
  fetch('https://openrouter.ai/api/v1/models').then((response) =>
    response.json(),
  );

/** For tests: models without the network. */
export function useModels(fake) {
  load = fake;
  windows = new Map();
  loadedAt = 0;
  loading = null;
}

export function refreshWindows() {
  if (loading || Date.now() - loadedAt < DAY_MS) return loading;
  loading = load()
    .then((data) => {
      windows = new Map(
        (data?.data ?? [])
          .filter((model) => model.context_length)
          .map((model) => [model.id, model.context_length]),
      );
      loadedAt = Date.now();
    })
    .catch((error) => console.error(`[context] ${error.message}`))
    .finally(() => {
      loading = null;
    });
  return loading;
}

// A model on its own provider's key has an id without the maker ("claude-haiku-5-5"):
// it finds its window by the model part, dots and dashes alike.
const sameModel = (id) =>
  String(id || '')
    .toLowerCase()
    .replace(/^[^/]*\//, '')
    .replace(/[.:_]/g, '-');

/** The model's context window in tokens, or null while it is not known. */
export function contextWindow(model) {
  refreshWindows();
  if (windows.has(model)) return windows.get(model);
  for (const [id, size] of windows)
    if (sameModel(id) === sameModel(model)) return size;
  return null;
}

/** A share between 0 and 1, or null while the window is not known. */
export function contextShare(model, tokens) {
  const window = contextWindow(model);
  return window && tokens ? Math.min(1, tokens / window) : null;
}

const sizeOf = (value) =>
  typeof value === 'string'
    ? value.length
    : value
      ? JSON.stringify(value).length
      : 0;

/**
 * What the model read at a step, by part: the agent's instructions, the rules
 * and memory around them, the tools, what people wrote, what the agent
 * answered and what the tools gave back. The provider counts only the total,
 * so each part gets the total's share of the characters it took.
 */
export function contextParts(
  { system, instructions, tools, messages },
  tokens,
) {
  const sizes = {
    instructions: sizeOf(instructions),
    rules: Math.max(0, sizeOf(system) - sizeOf(instructions)),
    tools: sizeOf(tools),
    people: 0,
    answers: 0,
    results: 0,
  };
  for (const message of messages) {
    const size = sizeOf(message.content) + sizeOf(message.tool_calls);
    if (message.role === 'tool') sizes.results += size;
    else if (message.role === 'assistant') sizes.answers += size;
    else sizes.people += size;
  }
  const chars = Object.values(sizes).reduce((sum, size) => sum + size, 0);
  if (!tokens || !chars) return null;
  return {
    ...Object.fromEntries(
      Object.entries(sizes).map(([key, size]) => [
        key,
        Math.round((size / chars) * tokens),
      ]),
    ),
    toolCount: Array.isArray(tools) ? tools.length : 0,
  };
}
