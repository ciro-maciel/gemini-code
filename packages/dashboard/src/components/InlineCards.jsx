import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';

import {
  fetchConnections,
  resolveApproval,
  retryConnection,
  retryTask,
  saveConnectionSecret,
} from '../services/api';
import { openSignIn } from '../connectors/sign-in';
import { notify } from './zen';

/**
 * What the bot waits on, inside the conversation: an elevated surface with the
 * system's hairline. The label names the kind of wait; the title, what exactly.
 */
function Card({ eyebrow, title, children }) {
  return (
    <Paper p={20} bg="white">
      <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px" mb={8}>
        {eyebrow}
      </Text>
      {title && (
        <Text fz={16} fw={800} c="gray.9" lh={1.4} mb={6}>
          {title}
        </Text>
      )}
      {children}
    </Paper>
  );
}

function Description({ children, isError = false }) {
  return (
    <Text fz={13} fw={500} c={isError ? 'red.6' : 'gray.6'} lh={1.5} mb={14}>
      {children}
    </Text>
  );
}

const CLASS_LABELS = {
  read: 'ler',
  write: 'create and change drafts, schedule and propose',
  external: 'publish, send, pay, or delete',
};
const KIND_LABELS = {
  send: 'send messages',
  pay: 'pay or buy',
  delete: 'delete or overwrite',
  publish: 'publish or deploy',
  form: 'submit forms',
  auth: 'sign in to services',
  other: 'actions of this type',
};

/** What "Permitir" covers, in the person's unit: the service and its class, or the kind of computer action. */
export function reachSentence({ service, reach }) {
  if (service && CLASS_LABELS[reach])
    return `the ${service} for ${CLASS_LABELS[reach]}`;
  if (KIND_LABELS[reach]) return KIND_LABELS[reach];
  return 'this action';
}

// What leaves, exactly as it will: a person approves an act, not a sentence
// about it. Long values keep their full text in a scrolling block.
const HIDDEN_KEYS = new Set([
  'ref',
  'target',
  'element',
  'selector',
  'id',
  'ids',
]);
function OutgoingContent({ args }) {
  const entries = Object.entries(args || {}).filter(
    ([key, value]) =>
      !HIDDEN_KEYS.has(key) &&
      value !== undefined &&
      value !== null &&
      value !== '',
  );
  if (!entries.length) return null;
  const show = (value) =>
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <Box
      mb={12}
      p={12}
      bg="gray.1"
      style={{ border: '1px solid var(--mantine-color-gray-2)' }}
    >
      <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px" mb={6}>
        What will be removed
      </Text>
      {entries.map(([key, value]) => (
        <Box key={key} mb={6}>
          <Text fz={11} fw={700} c="gray.5">
            {key}
          </Text>
          <Text
            fz={13}
            fw={500}
            c="gray.9"
            lh={1.5}
            component="pre"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              fontFamily: 'inherit',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {show(value)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function ApprovalCard({
  taskId,
  approvalId,
  summary,
  reason,
  checkpointId,
  service = null,
  reach = null,
  isAlwaysAsk = false,
  args = null,
  onDone = () => {},
}) {
  const [note, setNote] = useState('');
  const [shouldRemember, setShouldRemember] = useState(true);
  const [busy, setBusy] = useState(null);

  // "Permitir" covers the same unit (the service and its class, or the kind
  // of computer action) until the task ends; "Sempre permitir", on this bot
  // from now on. One permission per unit, never one per step (24/10/2026).
  const covers = reachSentence({ service, reach });

  const decide = async (isApproved, scope) => {
    setBusy(isApproved ? scope || 'approve' : 'reject');
    try {
      await resolveApproval(taskId, approvalId, {
        isApproved,
        note: note.trim() || undefined,
        shouldRemember,
        scope: scope ?? 'task',
      });
      onDone();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card eyebrow="Needs your approval" title={summary}>
      <Description>
        {reason}
        {checkpointId
          ? 'A snapshot of the computer was taken first: changes on it can be undone, but not anything sent outside.'
          : ''}
        {isAlwaysAsk
          ? `Allow permits ${covers} until the task ends. Payments and accounts always ask: there's no "always allow" for this.`
          : `Allow permits ${covers} until the task ends. Always allow permits ${covers} on this bot for 90 days.`}
      </Description>
      <OutgoingContent args={args} />
      <Textarea
        placeholder="Optional: request a change (Allow with change) or say why you're declining (the reason counts as 'ask first' for this)"
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        autosize
        minRows={1}
        radius={0}
        mb={8}
      />
      <Group justify="space-between" gap={8}>
        <Checkbox
          size="xs"
          label="Remember the reason for rejecting"
          checked={shouldRemember}
          onChange={(event) => setShouldRemember(event.currentTarget.checked)}
        />
        <Group gap={8}>
          <Button
            radius={0}
            variant="default"
            loading={busy === 'reject'}
            onClick={() => decide(false)}
          >
            Reject
          </Button>
          {!isAlwaysAsk && (
            <Button
              radius={0}
              variant="default"
              loading={busy === 'always'}
              onClick={() => decide(true, 'always')}
            >
              Always allow
            </Button>
          )}
          <Button
            radius={0}
            color="gray.9"
            loading={busy === 'approve' || busy === 'task'}
            onClick={() => decide(true, 'task')}
            title={
              note.trim()
                ? 'The agent redoes the action with your change; the permission applies to it'
                : undefined
            }
          >
            {note.trim() ? 'Allow with change' : 'Permitir'}
          </Button>
        </Group>
      </Group>
    </Card>
  );
}

/** The Connect card: sign-in is OAuth with the provider, never the bot's computer. */
/**
 * A connection the bot asked for, where it asked: with its reason, usable
 * whenever the person wants. It does not hold the conversation; once the app
 * is connected it shrinks to one line (`isReady` comes from the conversation).
 */
export function ConnectCard({
  connectionId,
  reason,
  isReady = false,
  onDone = () => {},
}) {
  const [connection, setConnection] = useState(null);
  const [secret, setSecret] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const isConnected = isReady || connection?.status === 'connected';

  useEffect(() => {
    if (isReady) return;
    let isAlive = true;
    let timer = null;
    const load = () =>
      fetchConnections()
        .then((data) => {
          if (!isAlive) return;
          const found =
            data.items.find((item) => item.id === connectionId) ?? null;
          setConnection(found);
          // Once connected there is nothing left to watch.
          if (found?.status === 'connected') clearInterval(timer);
        })
        .catch(() => {});
    load();
    timer = setInterval(load, 3000);
    return () => {
      isAlive = false;
      clearInterval(timer);
    };
  }, [connectionId, isReady]);

  if (isConnected) return null;
  if (!connection) return null;

  const run = async (action) => {
    setIsBusy(true);
    try {
      await action();
      onDone();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Card eyebrow="Connect an app" title={connection.title}>
      {reason && (
        <Text fz={14} fw={500} c="gray.9" lh={1.5} mb={6}>
          {reason}
        </Text>
      )}
      {connection.status === 'pending_auth' && (
        <>
          <Description>
            Sign in to your account and approve access whenever you want. The
            bot is notified when you connect.
          </Description>
          <Button
            radius={0}
            color="gray.9"
            onClick={() => openSignIn(connection.statusDetail)}
          >
            Connect
          </Button>
        </>
      )}
      {connection.status === 'needs_secret' && (
        <>
          <Description>
            This service requires an API token. It stays encrypted on the
            server, outside this conversation and the bot’s computer.
          </Description>
          <Group gap={8} wrap="nowrap">
            <TextInput
              flex={1}
              type="password"
              placeholder="Paste the token"
              value={secret}
              onChange={(event) => setSecret(event.currentTarget.value)}
              radius={0}
            />
            <Button
              radius={0}
              color="gray.9"
              loading={isBusy}
              disabled={!secret.trim()}
              onClick={() =>
                run(() =>
                  saveConnectionSecret(connection.id, { value: secret }),
                )
              }
            >
              Connect
            </Button>
          </Group>
        </>
      )}
      {(connection.status === 'failed' ||
        connection.status === 'connecting') && (
        <>
          <Description isError={connection.status === 'failed'}>
            {connection.status === 'failed'
              ? `Couldn't reach the service: ${connection.statusDetail || 'sem detalhe'}`
              : 'Conectando…'}
          </Description>
          {connection.status === 'failed' && (
            <Button
              radius="xl"
              variant="default"
              loading={isBusy}
              onClick={() => run(() => retryConnection(connection.id))}
            >
              Try again
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

export function TakeoverCard({ onOpen }) {
  return (
    <Card eyebrow="The computer is yours" title="You took over the screen">
      <Description>
        Sign in, enter the code, or whatever is needed. When you’re done, send a
        message saying what you did — that hands it back to the bot.
      </Description>
      <Button radius={0} color="gray.9" onClick={onOpen}>
        Open computer
      </Button>
    </Card>
  );
}

export function FailedCard({ taskId, onDone = () => {} }) {
  const [isBusy, setIsBusy] = useState(false);
  const retry = async () => {
    setIsBusy(true);
    try {
      await retryTask(taskId);
      onDone();
    } catch (failure) {
      notify.error(failure.message);
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <Group gap={8} pl={22}>
      <Button
        size="xs"
        radius="xl"
        variant="default"
        loading={isBusy}
        onClick={retry}
      >
        Try again
      </Button>
      <Text fz={12} c="gray.5">
        or send a message saying how to proceed
      </Text>
    </Group>
  );
}
