// A starting point the person can tap instead of writing.
const CONNECTORS = new Set([
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'com',
  'pra',
  'para',
  'no',
  'na',
  'em',
]);
export const IDEAS = ['Chief of staff', 'Organic', 'Paid media', 'SDR'];
export const QUESTIONS = [
  "Let's build the template. What does an agent created from it take care of? A metric or a deliverable.",
  'What does it need to connect to? The services its agents use.',
];

/** The template's name, from what it owns: an idea it matches, or its first words. */
export function nameFromOwns(owns) {
  const idea = IDEAS.find((each) =>
    owns.toLowerCase().includes(each.toLowerCase()),
  );
  if (idea) return idea;
  // Up to three words, never ending on a connector: "os cortes verticais de cada…" is "Cortes verticais".
  const words = owns
    .replace(/^(os|as|o|a)\s+/i, '')
    .split(/\s+/)
    .slice(0, 3);
  while (words.length > 1 && CONNECTORS.has(words.at(-1).toLowerCase()))
    words.pop();
  const name = words.join(' ');
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'New model';
}

/** The services written in a sentence: "Instagram e TikTok, Gmail" becomes three. */
export const servicesFrom = (text) =>
  text
    .split(/,|\se\s/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((service) => ({
      service: service.charAt(0).toUpperCase() + service.slice(1),
      reach: 'write',
    }));
