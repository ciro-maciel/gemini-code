import { expect, test } from 'bun:test';
import { decisionText } from './decision.js';

test('the line a decided permission leaves', () => {
  expect(
    decisionText({ isApproved: true, reach: 'task', summary: 'Enviar e-mail' }),
  ).toBe('Permitido até o fim da tarefa · Enviar e-mail');
  expect(decisionText({ isApproved: true, reach: 'always' })).toBe(
    'Sempre permitido · vale 90 dias',
  );
  expect(decisionText({ isApproved: false, note: 'não agora' })).toBe(
    'Recusado · "não agora"',
  );
  expect(
    decisionText({
      isApproved: true,
      reach: 'task',
      summary: 'Publicar',
      note: 'como rascunho',
    }),
  ).toBe('Permitido com a sua mudança · Publicar · "como rascunho"');
  expect(decisionText({ isApproved: false, isSuperseded: true })).toBe(
    'Ficou sem decisão: você escreveu antes',
  );
});
