import { Anchor, Box, Code, Text } from '@mantine/core';
import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// The bot answers in Markdown, tables included. react-markdown turns it into
// React nodes and never renders raw HTML (an image tag with an onerror stays
// text), and each element is drawn with the system's pieces: the table is the
// panel table in miniature, the quote is the 2px gray.3 citation rule.

const cell = {
  padding: '8px 12px',
  borderBottom: 'var(--rlg-border)',
  textAlign: 'left',
  verticalAlign: 'top',
};

const heading = ({ children }) => (
  <Text fz={14} fw={800} lh={1.4} c="inherit">
    {children}
  </Text>
);

const COMPONENTS = {
  p: ({ children }) => (
    <Text inherit style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {children}
    </Text>
  ),
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  strong: ({ children }) => (
    <Text component="b" inherit fw={800}>
      {children}
    </Text>
  ),
  em: ({ children }) => (
    <Text component="em" inherit>
      {children}
    </Text>
  ),
  a: ({ href, children }) => (
    <Anchor
      href={href}
      target="_blank"
      rel="noreferrer"
      inherit
      underline="always"
      // The text's own color: on the person's dark bubble the link's
      // default color matched the background and vanished.
      style={{ wordBreak: 'break-word', color: 'inherit' }}
    >
      {children}
    </Anchor>
  ),
  ul: ({ children }) => (
    <Box component="ul" pl={20} m={0}>
      {children}
    </Box>
  ),
  ol: ({ children, start }) => (
    <Box component="ol" start={start} pl={22} m={0}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box component="li" mb={4}>
      {children}
    </Box>
  ),
  blockquote: ({ children }) => (
    <Box
      pl={14}
      style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}
    >
      {children}
    </Box>
  ),
  hr: () => (
    <Box
      component="hr"
      m={0}
      style={{ border: 0, borderTop: 'var(--rlg-border)' }}
    />
  ),
  pre: ({ children }) => (
    <Box
      component="pre"
      p={12}
      m={0}
      bg="white"
      bd="var(--rlg-border)"
      fz={12}
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
      }}
    >
      {children}
    </Box>
  ),
  code: ({ className, children }) =>
    // Inside a fenced block react-markdown marks the language class; there
    // the pre above already draws the box.
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <Code>{children}</Code>
    ),
  table: ({ children }) => (
    <Box
      bd="var(--rlg-border)"
      bg="white"
      c="gray.7"
      style={{ overflowX: 'auto' }}
    >
      <Box
        component="table"
        w="100%"
        fz={12}
        style={{ borderCollapse: 'collapse' }}
      >
        {children}
      </Box>
    </Box>
  ),
  thead: ({ children }) => (
    <Box component="thead" bg="gray.1">
      {children}
    </Box>
  ),
  th: ({ children, style }) => (
    <Box
      component="th"
      fz={10}
      fw={800}
      c="gray.5"
      tt="uppercase"
      lts="1px"
      style={{
        ...cell,
        textAlign: style?.textAlign || 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  ),
  td: ({ children, style }) => (
    <Box
      component="td"
      fw={500}
      style={{ ...cell, textAlign: style?.textAlign || 'left' }}
    >
      {children}
    </Box>
  ),
  img: ({ alt }) => <Text inherit>{alt}</Text>,
};

// A file path the agent wrote, like `seo/pautas/2026-10-29.md`: without a
// leading slash it is inside the agent's folder, as its file tools read it.
const FILE_PATH =
  /^\/?(?:home\/sprite\/workspace\/)?[\w.-]+(?:\/[\w.-]+)*\.[a-z0-9]{1,8}$/i;
export function repoPathOf(text, folder) {
  const raw = String(text || '').trim();
  if (!FILE_PATH.test(raw)) return null;
  const isRooted = raw.startsWith('/');
  const clean = raw
    .replace(/^\/?home\/sprite\/workspace\//, '')
    .replace(/^\/+/, '');
  return isRooted || !folder || clean.startsWith(`${folder}/`)
    ? clean
    : `${folder}/${clean}`;
}

// Parsing Markdown is the costly part of a conversation: an answer is drawn
// again only when its own text changes, not on every piece of a reply that streams.
export const RichText = memo(
  RichTextBody,
  (before, after) =>
    before.text === after.text &&
    before.color === after.color &&
    before.folder === after.folder &&
    Boolean(before.onOpenPath) === Boolean(after.onOpenPath),
);

function RichTextBody({ text, color, folder = null, onOpenPath = null }) {
  const components = onOpenPath
    ? {
        ...COMPONENTS,
        code: ({ className, children }) => {
          const path = className ? null : repoPathOf(String(children), folder);
          if (!path) return COMPONENTS.code({ className, children });
          return (
            <button
              type="button"
              className="path-link"
              title={`Open ${path}`}
              onClick={() => onOpenPath(path)}
            >
              <Code>{children}</Code>
            </button>
          );
        },
      }
    : COMPONENTS;
  return (
    <Box className="assistant-rich" fz={13} fw={500} lh={1.6} c={color}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {String(text || '')}
      </Markdown>
    </Box>
  );
}
