// The tools for the person's own Chrome come from Assistant Navigation (open-source/assistant-navigation, the package
// "assistant-navigation"), the same catalog Claude Code uses. Here they are named chrome_* instead of
// browser_*: the agents' own computer already has browser_* tools.

import { TOOLS } from 'assistant-navigation/tools';

export const CHROME_TOOLS = TOOLS.map((tool) => ({
  ...tool,
  name: tool.name.replace(/^browser_/, 'chrome_'),
}));

export const chromeToolOf = (name) =>
  CHROME_TOOLS.find((tool) => tool.name === name) ?? null;

/** The catalog as OpenAI-style function tools, for the agents' model. */
export const chromeFunctionTools = () =>
  CHROME_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description.replaceAll('browser_', 'chrome_'),
      parameters: {
        type: 'object',
        properties: tool.properties ?? {},
        required: tool.required ?? [],
      },
    },
  }));
