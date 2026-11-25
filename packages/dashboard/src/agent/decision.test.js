import { expect, test } from 'bun:test';
import { decisionText } from './decision.js';

test('the line a decided permission leaves', () => {
  expect(
    decisionText({ isApproved: true, reach: 'task', summary: 'Enviar e-mail' }),
  ).toBe('Allowed until the task ends · Enviar e-mail');
  expect(decisionText({ isApproved: true, reach: 'always' })).toBe(
    'Always allowed · lasts 90 days',
  );
  expect(decisionText({ isApproved: false, note: 'não agora' })).toBe(
    'Declined · "não agora"',
  );
  expect(
    decisionText({
      isApproved: true,
      reach: 'task',
      summary: 'Publicar',
      note: 'como rascunho',
    }),
  ).toBe('Allowed with your change · Publicar · "como rascunho"');
  expect(decisionText({ isApproved: false, isSuperseded: true })).toBe(
    'Left undecided: you wrote first',
  );
});
