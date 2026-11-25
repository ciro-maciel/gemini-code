import { expect, test } from 'bun:test';
import { pathOf, tabOf } from './routes.js';

test('every tab has an address and every address opens its tab back', () => {
  for (const tab of [
    'agent:9f1c',
    'settings:9f1c',
    'screen:9f1c',
    'template:sdr',
    'file:relatorios/ep39.html',
    'file:agents/pauta/INSTRUCTIONS.md',
    'cfile:9f1c/relatorios/ep39.html',
  ])
    expect(tabOf(pathOf(tab))).toBe(tab);
});

test('the command center and the settings open no tab', () => {
  expect(tabOf('/')).toBeNull();
  expect(tabOf('/settings/people')).toBeNull();
  expect(pathOf('agent:x')).toBe('/agents/x');
});

test('no tab address has a dot in its route, or a static host answers 404 instead of the panel', () => {
  for (const tab of [
    'file:README.md',
    'file:relatorios/ep39.html',
    'cfile:9f1c//home/sprite/workspace/a.png',
    'template:sdr',
    'agent:9f1c',
  ])
    expect(pathOf(tab).split('?')[0]).not.toContain('.');
  expect(tabOf('/files?path=agents%2Fteste%2FINSTRUCTIONS.md')).toBe(
    'file:agents/teste/INSTRUCTIONS.md',
  );
  expect(tabOf('/files')).toBeNull();
});
