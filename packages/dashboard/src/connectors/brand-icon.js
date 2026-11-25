// Each catalog app's own mark, kept in the repository (brand-icons/), so the
// app and the demo show it without fetching an image from another host.
// Sources and license: brand-icons/README.md.

const files = import.meta.glob('./brand-icons/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The URL of an app's brand mark, or null when the repository has none. */
export function brandIconOf(appId) {
  return (
    files[`./brand-icons/${appId}.svg`] ??
    files[`./brand-icons/${appId}.png`] ??
    null
  );
}
