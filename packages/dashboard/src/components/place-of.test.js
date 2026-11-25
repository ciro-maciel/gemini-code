import { expect, test } from 'bun:test';
import { describeTool, placeOf } from './describe-tool.js';
test('the place of a step is the product, not the connection id cut short', () => {
  expect(placeOf('mcp__feeds_a_grande_v__feeds_read')).toBe('Feeds');
  expect(placeOf('mcp__blogs__blogs_write')).toBe('Blogs');
  expect(placeOf('mcp__google_drive__create_document')).toBe('Google drive');
  expect(placeOf('memory_save')).toBe('memory');
});

test('the four tools of a house product say what they do', () => {
  expect(
    describeTool('mcp__feeds_a_grande_v__feeds_read', { op: 'feeds_pieces' }),
  ).toMatchObject({ text: 'Reading in Feeds', detail: 'feeds_pieces' });
  expect(describeTool('mcp__blogs__blogs_write', {}).text).toBe(
    'Working in Blogs',
  );
  expect(
    describeTool('mcp__messages__messages_delete', { path: '/x' }).text,
  ).toBe('Deleting in Messages');
});
