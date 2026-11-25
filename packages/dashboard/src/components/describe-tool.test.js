import { expect, test } from 'bun:test';

import { summarizeSteps } from './describe-tool';

test('one step reads as itself', () => {
  expect(
    summarizeSteps([{ name: 'computer_shell', args: { command: 'ls' } }]),
  ).toBe('Ran a command');
});

test('the same kind is counted once, in the order it first came', () => {
  const steps = [
    { name: 'computer_shell' },
    { name: 'computer_read_file' },
    { name: 'computer_shell' },
  ];
  expect(summarizeSteps(steps)).toBe('Ran a command 2× and read a file');
});

test('past three kinds the rest is a count', () => {
  const steps = [
    { name: 'computer_shell' },
    { name: 'computer_read_file' },
    { name: 'computer_write_file' },
    { name: 'memory_save' },
    { name: 'tools_search' },
  ];
  expect(summarizeSteps(steps)).toBe(
    'Ran a command, read a file, wrote a file and 2 more steps',
  );
});

test('a connection tool reads by its own name, not the connection id', () => {
  expect(
    summarizeSteps([
      { name: 'mcp__feeds_a_grande_v__feeds_schedule_piece' },
      { name: 'mcp__feeds_a_grande_v__feeds_schedule_piece' },
    ]),
  ).toBe('Feeds schedule piece 2×');
});

test('in Portuguese the pieces are translated before they are joined', async () => {
  const { makeTranslator, useTranslator } = await import('../lib/language.js');
  const { default: dictionary } = await import('../lib/pt.json');
  useTranslator(makeTranslator(dictionary));
  try {
    expect(
      summarizeSteps([
        { name: 'computer_shell' },
        { name: 'computer_read_file' },
        { name: 'computer_write_file' },
        { name: 'memory_save' },
        { name: 'tools_search' },
      ]),
    ).toBe(
      'Rodou um comando, leu um arquivo, escreveu um arquivo e mais 2 passos',
    );
  } finally {
    useTranslator(null);
  }
});
