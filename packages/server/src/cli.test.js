import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import { parseArgs, placesFor, readEnvFile } from './cli.js';

describe('the gemini-code command line', () => {
  test('reads a folder, the port and the flags in any order', () => {
    expect(parseArgs(['my-repo', '--port', '9000', '--no-open'])).toMatchObject(
      {
        folder: 'my-repo',
        port: 9000,
        shouldOpen: false,
      },
    );
    expect(parseArgs(['--port=8800'])).toMatchObject({
      folder: null,
      port: 8800,
      shouldOpen: true,
    });
    expect(parseArgs(['--version']).isVersion).toBe(true);
    expect(parseArgs(['-h']).isHelp).toBe(true);
  });

  test('refuses a port that is not one', () => {
    expect(() => parseArgs(['--port', 'abc'])).toThrow('--port');
    expect(() => parseArgs(['--port', '70000'])).toThrow('--port');
  });

  test('reads KEY=value lines and strips quotes, ignoring the rest', () => {
    expect(
      readEnvFile(
        '# comment\nGEMINI_API_KEY="AIza-test"\nPORT=9000\nnot a line\nlower=x\n',
      ),
    ).toEqual({ GEMINI_API_KEY: 'AIza-test', PORT: '9000' });
  });

  test('keeps data under ~/.gemini-code and the dashboard next to the executable', () => {
    const places = placesFor({
      home: '/home/ana',
      executable: '/home/ana/.gemini-code/app/gemini-code',
      folder: null,
      cwd: '/tmp',
    });
    expect(places.data).toBe(path.join('/home/ana', '.gemini-code', 'data'));
    expect(places.envFile).toBe(path.join('/home/ana', '.gemini-code', '.env'));
    expect(places.dashboard).toBe(
      path.join('/home/ana/.gemini-code/app', 'dashboard'),
    );
    expect(places.workspace).toBe(path.join('/home/ana', 'GeminiCode'));
    expect(
      placesFor({
        home: '/home/ana',
        executable: '/x/gemini-code',
        folder: 'proj',
        cwd: '/work',
      }).workspace,
    ).toBe(path.resolve('/work', 'proj'));
  });
});
