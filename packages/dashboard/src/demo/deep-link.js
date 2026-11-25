// Deep links on GitHub Pages, for the main demo and for every branch preview.
//
// Pages answers an unknown address with the site's root 404.html only, never a
// preview's own. The root 404.html therefore runs previewRedirect: an address
// inside /<site>/preview/<branch>/ goes to that preview's root with the rest
// kept in ?p=, and the preview's start puts it back with restoredPath. Both
// functions are plain, with no imports: previewRedirect is copied into the
// 404 page as text (vite-plugin.js).

/** Where an address that hit the root 404 should go, or null to stay. */
export function previewRedirect(pathname, search, siteBase) {
  const site = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
  if (!pathname.startsWith(`${site}preview/`)) return null;
  const rest = pathname.slice(`${site}preview/`.length);
  const slash = rest.indexOf('/');
  if (slash < 1) return null;
  const inside = rest.slice(slash + 1);
  if (!inside) return null;
  const root = `${site}preview/${rest.slice(0, slash)}/`;
  return `${root}?p=${encodeURIComponent(`/${inside}${search || ''}`)}`;
}

/** The address a redirected preview should show, or null when nothing was carried. */
export function restoredPath(search, base) {
  const carried = new URLSearchParams(search).get('p');
  if (!carried || !carried.startsWith('/') || carried.startsWith('//'))
    return null;
  return `${base.replace(/\/+$/, '')}${carried}`;
}
