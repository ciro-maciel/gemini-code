import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { previewRedirect } from './deep-link.js';

// The demo is a static site on a subpath (GitHub Pages). Every address of the
// panel (/gemini-code/agents/<id>) must open demo.html: in development this
// rewrites the request, and the build leaves index.html for the root and
// 404.html, which Pages serves for any other address, both copies of it.
export function demoSite() {
  let base = '/';
  let outDir = 'dist';
  return {
    name: 'gemini-code-demo-site',
    configResolved(config) {
      base = config.base;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathname] = (req.url || '').split('?');
        const isPage =
          req.method === 'GET' &&
          pathname.startsWith(base) &&
          !path.extname(pathname) &&
          !pathname.slice(base.length).startsWith('@') &&
          (req.headers.accept || '').includes('text/html');
        if (isPage) req.url = `${base}demo.html`;
        next();
      });
    },
    async writeBundle() {
      const page = path.join(outDir, 'demo.html');
      await copyFile(page, path.join(outDir, 'index.html'));
      // The 404 page first sends an address inside a branch preview to that preview (deep-link.js).
      const site = (process.env.DEMO_SITE_BASE || '/gemini-code/').replace(
        /\/?$/,
        '/',
      );
      const redirect = `<script>(function(){var to=(${previewRedirect.toString()})(location.pathname,location.search,${JSON.stringify(site)});if(to)location.replace(to);})();</script>`;
      const html = await readFile(page, 'utf8');
      await writeFile(
        path.join(outDir, '404.html'),
        html.replace('<head>', `<head>${redirect}`),
      );
    },
  };
}
