import { describe, expect, test } from 'bun:test';
import {
  docIconOf,
  filterAgentDocuments,
  formatDocSize,
} from './AgentDocuments.jsx';

const sample = [
  {
    path: 'agents/dev/docs/spec.md',
    name: 'spec.md',
    group: 'work',
    ext: 'md',
    size: 512,
  },
  {
    path: 'agents/dev/docs/api.json',
    name: 'api.json',
    group: 'work',
    ext: 'json',
    size: 2048,
  },
  {
    path: 'agents/dev/INSTRUCTIONS.md',
    name: 'INSTRUCTIONS.md',
    group: 'instructions',
    ext: 'md',
    size: 300,
  },
  {
    path: 'agents/dev/memory/decisions.md',
    name: 'decisions.md',
    group: 'memory',
    ext: 'md',
    size: 120,
  },
  {
    path: 'skills/review/SKILL.md',
    name: 'SKILL.md',
    group: 'skill',
    ext: 'md',
    size: 420,
  },
];

describe('AgentDocuments helpers', () => {
  test('filters documents by group and search query', () => {
    expect(filterAgentDocuments(sample, { group: 'all' })).toHaveLength(5);
    expect(
      filterAgentDocuments(sample, { group: 'work' }).map((item) => item.name),
    ).toEqual(['spec.md', 'api.json']);
    expect(
      filterAgentDocuments(sample, { group: 'core' }).map((item) => item.name),
    ).toEqual(['INSTRUCTIONS.md', 'decisions.md']);
    expect(
      filterAgentDocuments(sample, { group: 'skill' }).map((item) => item.name),
    ).toEqual(['SKILL.md']);
    expect(
      filterAgentDocuments(sample, { group: 'all', query: 'api' }).map(
        (item) => item.name,
      ),
    ).toEqual(['api.json']);
  });

  test('formats document sizes and picks appropriate icons', () => {
    expect(formatDocSize(512)).toBe('512 B');
    expect(formatDocSize(2048)).toBe('2.0 KB');
    expect(formatDocSize(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(docIconOf(sample[0])).toBe('ti-markdown');
    expect(docIconOf(sample[1])).toBe('ti-braces');
    expect(docIconOf(sample[2])).toBe('ti-file-description');
    expect(docIconOf(sample[3])).toBe('ti-brain');
    expect(docIconOf(sample[4])).toBe('ti-sparkles');
  });
});
