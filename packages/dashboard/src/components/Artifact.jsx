import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowsMaximize, IconCheck } from '@tabler/icons-react';

import { chooseInArtifact, fetchArtifactVersion } from '../services/api';
import { RichText } from './RichText';
import { DataTable, Metric, notify, Tag } from './zen';

/**
 * An artifact: what a bot hands over to be looked at, not read. The bot sends
 * generic blocks (a heading, numbers, a table, items with a state, a short
 * text) and this file draws them with the system's pieces — Metric, Tag,
 * DataTable — so every artifact of every bot looks the same. Any item, or the
 * artifact itself, may carry choices; a tap goes back to the bot as the
 * person's message. Nothing here knows what an artifact means to its bot.
 */

const ARTIFACT_ITEM = '_artifact';
// The bot's words for a state, drawn with the tag's tones; the word always shows.
const TAG_TONE = { attention: 'dark', ok: 'up', neutral: 'neutral', bad: 'no' };

function Heading({ block }) {
  return (
    <Box>
      <Text fz={20} fw={800} c="var(--gm-on-surface)" lh={1.3}>
        {block.title}
      </Text>
      {block.text && (
        <Text fz={14} fw={500} c="var(--gm-on-surface-variant)" lh={1.5} mt={4}>
          {block.text}
        </Text>
      )}
    </Box>
  );
}

function Stats({ block }) {
  return (
    <SimpleGrid
      cols={{
        base: Math.min(block.items.length, 2),
        sm: Math.min(block.items.length, 4),
      }}
      spacing={24}
      verticalSpacing={16}
    >
      {block.items.map((stat, index) => (
        <Metric
          key={index}
          size="sm"
          label={stat.label}
          value={stat.value}
          unit={stat.unit}
          note={stat.note}
          delta={stat.delta}
        />
      ))}
    </SimpleGrid>
  );
}

function SectionTitle({ children }) {
  return (
    <Text fz={12.5} fw={600} c="var(--gm-on-surface-variant)" mb={8}>
      {children}
    </Text>
  );
}

function Table({ block }) {
  const columns = block.columns.map((label, index) => ({
    key: `c${index}`,
    label,
    width:
      index === block.columns.length - 1 && block.columns.length > 1
        ? '2fr'
        : '1fr',
    render: (row) => (
      <Box style={{ overflowWrap: 'anywhere' }}>{row.cells[index]}</Box>
    ),
  }));
  // A long e-mail or URL breaks inside its cell instead of running over the next column (10/11/2026).
  return (
    <Box>
      {block.title && <SectionTitle>{block.title}</SectionTitle>}
      <DataTable
        columns={columns}
        rows={block.rows.map((cells, index) => ({ index, cells }))}
        getRowKey={(row) => row.index}
        stackOnPhone
      />
    </Box>
  );
}

/** Videos that play where they are, controls and all; a caption under each. */
function Videos({ block }) {
  return (
    <Box>
      {block.title && <SectionTitle>{block.title}</SectionTitle>}
      <SimpleGrid
        cols={{ base: 1, sm: Math.min(block.items.length, 2) }}
        spacing={12}
      >
        {block.items.map((video, index) => (
          <Box key={index} className="art-video">
            <video
              src={video.src}
              poster={video.poster}
              controls
              playsInline
              preload="metadata"
            />
            {video.caption && (
              <Text fz={12} fw={500} c="var(--gm-on-surface)" mt={8}>
                {video.caption}
              </Text>
            )}
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

/** Pictures side by side, each opening whole in a new tab; a caption under each. */
function Images({ block }) {
  return (
    <Box>
      {block.title && <SectionTitle>{block.title}</SectionTitle>}
      <SimpleGrid
        cols={{ base: 1, sm: Math.min(block.items.length, 3) }}
        spacing={12}
      >
        {block.items.map((image, index) => (
          <Box
            key={index}
            component="a"
            href={image.src}
            target="_blank"
            rel="noopener noreferrer"
            className="art-image"
          >
            <img src={image.src} alt={image.caption || ''} loading="lazy" />
            {image.caption && (
              <Text fz={12} fw={500} c="var(--gm-on-surface)" mt={8}>
                {image.caption}
              </Text>
            )}
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

/** What the person chose, said once, in place of the buttons. */
function Chosen({ chosen }) {
  return (
    <Group gap={8} wrap="nowrap" align="flex-start">
      <IconCheck
        size={14}
        stroke={1.5}
        color="var(--mantine-color-gray-5)"
        style={{ flex: 'none', marginTop: 2 }}
      />
      <Text fz={12} fw={500} c="var(--gm-on-surface-variant)">
        You chose: {chosen.label}
        {chosen.note ? ` — “${chosen.note}”` : ''}
      </Text>
    </Group>
  );
}

/**
 * The choices of one item: buttons while it waits, the answer once made. A
 * choice that asks for a note opens the field first; nothing is sent without it.
 */
function Choices({ choices, chosen, isOpen, onChoose }) {
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(null);
  if (chosen) return <Chosen chosen={chosen} />;
  if (!choices?.length || !isOpen) return null;

  const send = async (choice, withNote) => {
    setSending(choice.value);
    try {
      await onChoose(choice.value, withNote);
      setNoteFor(null);
      setNote('');
    } finally {
      setSending(null);
    }
  };

  if (noteFor)
    return (
      <Stack gap={8}>
        <Textarea
          autosize
          minRows={2}
          maxRows={6}
          maxLength={2000}
          placeholder={`${noteFor.label}: what do you want?`}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          autoFocus
        />
        <Group gap={8}>
          <Button
            size="compact-sm"
            disabled={!note.trim()}
            loading={sending === noteFor.value}
            onClick={() => send(noteFor, note.trim())}
          >
            Send
          </Button>
          <Button
            size="compact-sm"
            variant="subtle"
            color="gray"
            onClick={() => setNoteFor(null)}
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    );

  return (
    <Group gap={8}>
      {choices.map((choice) => (
        <Button
          key={choice.value}
          size="compact-sm"
          variant="default"
          loading={sending === choice.value}
          disabled={Boolean(sending) && sending !== choice.value}
          onClick={() => (choice.needsNote ? setNoteFor(choice) : send(choice))}
        >
          {choice.label}
        </Button>
      ))}
    </Group>
  );
}

function Items({ block, chosen, isOpen, onChoose }) {
  return (
    <Box>
      {block.title && <SectionTitle>{block.title}</SectionTitle>}
      <Box style={{ borderTop: 'var(--rlg-border)' }}>
        {block.items.map((item) => (
          <Stack
            key={item.id}
            gap={0}
            py={12}
            style={{ borderBottom: 'var(--rlg-border)' }}
          >
            <Group gap={10} wrap="nowrap" align="flex-start">
              {item.tag && (
                <Tag
                  tone={TAG_TONE[item.tone] ?? 'neutral'}
                  style={{ flex: 'none', marginTop: 1 }}
                >
                  {item.tag}
                </Tag>
              )}
              <Box miw={0} flex={1}>
                <Text fz={14} fw={700} c="var(--gm-on-surface)" lh={1.4}>
                  {item.title}
                </Text>
                {item.detail && (
                  <Text
                    fz={13}
                    fw={500}
                    c="var(--gm-on-surface-variant)"
                    lh={1.5}
                    mt={2}
                  >
                    {item.detail}
                  </Text>
                )}
                <Box mt={item.choices || chosen[item.id] ? 10 : 0}>
                  <Choices
                    choices={item.choices}
                    chosen={chosen[item.id]}
                    isOpen={isOpen}
                    onChoose={(value, note) => onChoose(item.id, value, note)}
                  />
                </Box>
              </Box>
            </Group>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}

function ArtifactBody({ content, chosen, isOpen, onChoose }) {
  return (
    <Stack gap={24}>
      {content.blocks.map((block, index) => {
        if (block.type === 'heading')
          return <Heading key={index} block={block} />;
        if (block.type === 'stats') return <Stats key={index} block={block} />;
        if (block.type === 'table') return <Table key={index} block={block} />;
        if (block.type === 'images')
          return <Images key={index} block={block} />;
        if (block.type === 'videos')
          return <Videos key={index} block={block} />;
        if (block.type === 'items')
          return (
            <Items
              key={index}
              block={block}
              chosen={chosen}
              isOpen={isOpen}
              onChoose={onChoose}
            />
          );
        if (block.type === 'text')
          return (
            <RichText
              key={index}
              text={block.text}
              color="var(--gm-on-surface)"
            />
          );
        return null;
      })}
      <Choices
        choices={content.choices}
        chosen={chosen[ARTIFACT_ITEM]}
        isOpen={isOpen}
        onChoose={(value, note) => onChoose(ARTIFACT_ITEM, value, note)}
      />
    </Stack>
  );
}

/**
 * The artifact in the conversation: drawn whole where it was published, with
 * its version, and opened in full screen on demand. The choices already made
 * come from the server; only the latest version takes new ones.
 */
export function ArtifactCard({ botId, data }) {
  const isPhone = useMediaQuery('(max-width: 48em)');
  const [state, setState] = useState(null);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetchArtifactVersion(botId, data.artifactId, data.versionId)
      .then((found) => isCurrent && setState(found))
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [botId, data.artifactId, data.versionId]);

  const content = state?.content ?? data.content;
  const chosen = state?.choices ?? {};
  const isOpen = state?.isLatest === true;
  const choose = async (itemId, value, note) => {
    try {
      setState(
        await chooseInArtifact(botId, data.artifactId, data.versionId, {
          itemId,
          value,
          ...(note ? { note } : {}),
        }),
      );
    } catch (error) {
      notify.error("Couldn't send your choice", error.message);
      throw error;
    }
  };
  const eyebrow = `Artifact · version ${data.version}${state && !state.isLatest ? ` · version ${state.latestVersion} exists` : ''}`;

  return (
    <Box style={{ border: 'var(--rlg-border)' }}>
      <Group justify="space-between" wrap="nowrap" gap={12} px={20} pt={16}>
        <Text fz={12.5} fw={600} c="var(--gm-on-surface-variant)" truncate>
          {eyebrow}
        </Text>
        <UnstyledButton
          onClick={() => setIsFull(true)}
          aria-label="Open full screen"
          style={{ display: 'flex' }}
        >
          <IconArrowsMaximize
            size={14}
            stroke={1.5}
            color="var(--mantine-color-gray-6)"
          />
        </UnstyledButton>
      </Group>
      <Box px={20} pt={12} pb={20}>
        <ArtifactBody
          content={content}
          chosen={chosen}
          isOpen={isOpen}
          onChoose={choose}
        />
      </Box>
      <Modal
        opened={isFull}
        onClose={() => setIsFull(false)}
        size={isPhone ? '100%' : '90%'}
        fullScreen={isPhone}
        title={
          <Text fz={14} fw={800} c="var(--gm-on-surface)" lineClamp={1}>
            {content.title}
          </Text>
        }
      >
        <ArtifactBody
          content={content}
          chosen={chosen}
          isOpen={isOpen}
          onChoose={choose}
        />
      </Modal>
    </Box>
  );
}
