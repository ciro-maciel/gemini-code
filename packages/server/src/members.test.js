import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-members-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const members = await import('./members.js');
const { listBots } = await import('./bots.js');
const { describeAccount, fetchAccount } = await import('./accounts.js');
const { enqueue, takeNext } = await import('./queue.js');

const person = (id, email, status = 'active') =>
  db
    .query(
      'INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, email, id === 'm-own' ? 'Bia' : null, status, now(), now());
person('m-own', 'bia@membros.com');
person('m-ana', 'ana@membros.com');
person('m-leo', 'leo@membros.com', 'pending');
db.query(
  "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('m-b1', 'Roteiro', 'm-s1', 'idle', 'm', 1, 1, 'm-own')",
).run();
const bot = { id: 'm-b1', accountId: 'm-own' };

describe('a bot shared with other people', () => {
  test('nobody but the owner is in it until it is shared', () => {
    expect(members.accessOf(bot, fetchAccount('m-own'))).toBe('owner');
    expect(members.accessOf(bot, fetchAccount('m-ana'))).toBeNull();
    expect(listBots('m-ana', 'ana@membros.com')).toEqual([]);
  });

  test('sharing by e-mail: checked, case-blind, and updated in place', () => {
    expect(members.shareBot(bot, 'não é e-mail', 'read')).toBe(
      'e-mail inválido',
    );
    expect(members.shareBot(bot, 'ana@membros.com', 'admin')).toBe(
      'acesso inválido',
    );
    expect(members.shareBot(bot, 'Bia@Membros.com', 'read')).toBe(
      'esse e-mail é o seu',
    );
    expect(members.shareBot(bot, ' ANA@membros.com ', 'read')).toBeNull();
    expect(members.shareBot(bot, 'ana@membros.com', 'enter')).toBeNull();
    expect(members.listMembers('m-b1')).toEqual([
      {
        email: 'ana@membros.com',
        access: 'enter',
        accountId: 'm-ana',
        name: 'ana',
      },
    ]);
  });

  test('access ranks: read follows, enter also writes, only the owner changes the bot', () => {
    expect(members.allows('read', 'read')).toBe(true);
    expect(members.allows('read', 'enter')).toBe(false);
    expect(members.allows('enter', 'enter')).toBe(true);
    expect(members.allows('enter', 'owner')).toBe(false);
    expect(members.allows(null, 'read')).toBe(false);
  });

  test('the member lists the bot after their own, with who shared it and how far they go', () => {
    const [shared] = listBots('m-ana', 'ana@membros.com');
    expect(shared).toMatchObject({
      id: 'm-b1',
      access: 'enter',
      sharedBy: 'Bia',
    });
    expect(listBots('m-own', 'bia@membros.com')[0]).toMatchObject({
      access: 'owner',
      sharedBy: null,
    });
    expect(members.knownPeople('m-own')).toEqual([
      { email: 'ana@membros.com', name: 'ana' },
    ]);
  });

  test('a person still waiting to be let in is a guest once invited', () => {
    expect(describeAccount(fetchAccount('m-leo')).isGuest).toBe(false);
    members.shareBot(bot, 'leo@membros.com', 'read');
    expect(describeAccount(fetchAccount('m-leo')).isGuest).toBe(true);
    expect(members.accessOf(bot, fetchAccount('m-leo'))).toBe('read');
  });

  test('a queued message keeps who sent it', () => {
    enqueue('m-b1', 'e o corte?', [], 'ana');
    expect(takeNext('m-b1')).toMatchObject({
      text: 'e o corte?',
      author: 'ana',
    });
  });

  test('taken out, the person loses the bot', () => {
    expect(members.unshareBot('m-b1', 'ANA@membros.com')).toBe(true);
    expect(members.unshareBot('m-b1', 'ana@membros.com')).toBe(false);
    expect(members.accessOf(bot, fetchAccount('m-ana'))).toBeNull();
  });
});
