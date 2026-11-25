import { copyFile } from 'node:fs/promises';
import path from 'node:path';

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
      await copyFile(page, path.join(outDir, '404.html'));
    },
  };
}
