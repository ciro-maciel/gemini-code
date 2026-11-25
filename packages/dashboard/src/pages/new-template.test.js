import { expect, test } from 'bun:test';
import { nameFromOwns, servicesFrom } from './new-template.js';

test('a template is named after an idea it matches, or the first words of what it owns', () => {
  expect(nameFromOwns('SDR')).toBe('SDR');
  expect(nameFromOwns('os cortes verticais de cada episódio')).toBe(
    'Cortes verticais',
  );
  expect(nameFromOwns('o caixa')).toBe('Caixa');
});

test('the services come out of a written sentence', () => {
  expect(
    servicesFrom('instagram e TikTok, Gmail').map((s) => s.service),
  ).toEqual(['Instagram', 'TikTok', 'Gmail']);
});
