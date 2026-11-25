import { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Group,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';

import { saveFirstWish } from '../services/api';
import { AI_EXAMPLES } from '../labels';

const WISH_MAX = 1000;

/** One step of the way in: done, the one happening now, or still ahead. */
function Step({ state, title, text, isLast }) {
  return (
    <Group gap={16} align="flex-start" wrap="nowrap">
      <Stack gap={0} align="center" pt={6} style={{ alignSelf: 'stretch' }}>
        <Box
          w={10}
          h={10}
          bg={
            state === 'done' ? 'gray.9' : state === 'now' ? 'gray.0' : 'gray.2'
          }
          bd={
            state === 'now'
              ? '2px solid var(--mantine-color-gray-9)'
              : undefined
          }
          style={{ flexShrink: 0 }}
        />
        {!isLast && (
          <Box
            w={1}
            bg="var(--gm-outline-variant)"
            style={{ flex: 1 }}
            mt={6}
          />
        )}
      </Stack>
      <Box pb={isLast ? 0 : 20} miw={0}>
        <Text
          fz={14}
          fw={state === 'later' ? 500 : 800}
          c={state === 'later' ? 'gray.5' : 'gray.9'}
        >
          {title}
        </Text>
        <Text fz={13} fw={500} c="var(--gm-on-surface-variant)" lh={1.5}>
          {text}
        </Text>
      </Box>
    </Group>
  );
}

function queueLine(queue) {
  if (!queue) return "You're on the waitlist. Access is granted one at a time.";
  if (queue.position === 1) return "You're next in line.";
  return `You're number ${queue.position} in line. Access is granted one at a time.`;
}

/**
 * The screen of an account still waiting to be let in. Not a wall: the person
 * says what the first bot should do, and that bot is designed the moment the
 * owner lets the account in, so the product opens onto work already under way.
 */
export function WaitingRoom({ account, onSaved, onSignOut }) {
  const [wish, setWish] = useState(account.firstWish || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const saved = account.firstWish || '';
  const isDirty = wish.trim() !== saved;

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await saveFirstWish(wish));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Flex mih="100dvh" px="md" py={64} justify="center" align="center">
      <Stack gap={40} w="100%" maw={520}>
        <Stack gap={10}>
          <Text fz={12.5} fw={600} c="var(--gm-on-surface-variant)">
            Assistant · Waitlist
          </Text>
          <Text
            component="h1"
            m={0}
            fz="clamp(2rem, 5vw + 1rem, 2.75rem)"
            fw={900}
            c="var(--gm-on-surface)"
            lh={1.1}
            lts="-0.04em"
          >
            Your access is on the way
          </Text>
          <Text fz={16} fw={500} c="var(--gm-on-surface-variant)" lh={1.7}>
            Each bot gets its own cloud computer. While you wait for access,
            tell us what your first bot will do, and it’ll be ready from the
            start.
          </Text>
        </Stack>

        <Stack gap={0}>
          <Step state="done" title="Account created" text={account.email} />
          <Step state="now" title="Approval" text={queueLine(account.queue)} />
          <Step
            state="later"
            title="Your first bot"
            text={
              saved
                ? 'Set up with your request as soon as the entry is ready. It connects whatever it needs and does the job once.'
                : 'Write the request below and it will be set up as soon as the entry is ready.'
            }
            isLast
          />
        </Stack>

        <Stack gap={12}>
          <Textarea
            label="What your first bot should do"
            placeholder={AI_EXAMPLES[0]}
            autosize
            minRows={3}
            maxRows={8}
            maxLength={WISH_MAX}
            value={wish}
            onChange={(event) => setWish(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (event.metaKey || event.ctrlKey) &&
                isDirty
              )
                save();
            }}
            error={error}
          />
          {!wish.trim() && (
            <Stack gap={6}>
              {AI_EXAMPLES.map((example) => (
                <UnstyledButton key={example} onClick={() => setWish(example)}>
                  <Text fz={12} fw={500} c="var(--gm-on-surface-variant)">
                    “{example}”
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          )}
          <Group justify="space-between" gap={12}>
            <Text fz={12} fw={500} c="var(--gm-on-surface-variant)">
              {saved && !isDirty
                ? "Request saved. You can change it until it's sent."
                : 'You can change your request until access is granted.'}
            </Text>
            <Button onClick={save} loading={isSaving} disabled={!isDirty}>
              {saved ? 'Update request' : 'Save request'}
            </Button>
          </Group>
        </Stack>

        <Group
          justify="space-between"
          gap={12}
          pt={20}
          style={{ borderTop: 'var(--rlg-border)' }}
        >
          <Text
            fz={13}
            fw={500}
            c="var(--gm-on-surface-variant)"
            truncate
            miw={0}
          >
            Signed in as <strong>{account.email}</strong>
          </Text>
          <Button variant="default" size="xs" onClick={onSignOut}>
            Switch account
          </Button>
        </Group>
      </Stack>
    </Flex>
  );
}
