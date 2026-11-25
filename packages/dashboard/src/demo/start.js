// Imported first by the demo's entry: the fake control server is in place
// before any module of the panel runs.
import { installDemo } from './install.js';
import { restoredPath } from './deep-link.js';

// A deep link into a branch preview arrives as ?p=<address> (deep-link.js): show the address it meant.
const restored = restoredPath(window.location.search, import.meta.env.BASE_URL);
if (restored) window.history.replaceState(null, '', restored);

installDemo(window);
document.body.classList.add('is-demo');
