import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Group,
  Image,
  Modal,
  SimpleGrid,
  Skeleton,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconDownload,
  IconMinus,
  IconPlus,
  IconFile,
  IconFileTypeHtml,
  IconFileTypePdf,
} from '@tabler/icons-react';

import { failureText, fileUrl } from '../services/api';
import { formatSize } from '../agent/attachments';
import { RichText } from './RichText';
import { notify } from './zen';

// Every file the bot made is a thumbnail of its content, and a click opens it
// whole on this page: images, tables from CSV, Markdown as a document, HTML
// running in an isolated frame, PDF, and text or code.

const KIND = [
  ['image', /\.(png|jpe?g|gif|webp|svg|avif)$/i],
  ['csv', /\.(csv|tsv)$/i],
  ['markdown', /\.(md|markdown)$/i],
  ['html', /\.html?$/i],
  ['pdf', /\.pdf$/i],
  [
    'text',
    /\.(txt|json|jsonl|log|py|js|mjs|ts|jsx|sh|yaml|yml|toml|xml|sql|css|ini|env\.example)$/i,
  ],
];

export function kindOf(name) {
  return KIND.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other';
}

// Text previews read the file once; large files are opened, not previewed.
const PREVIEW_LIMIT = 400_000;
const cache = new Map();

function useFileText(url, isWanted) {
  const [text, setText] = useState(() => cache.get(url) ?? null);
  useEffect(() => {
    if (!isWanted || cache.has(url)) return;
    let isAlive = true;
    fetch(url)
      .then((response) =>
        response.ok
          ? response.text()
          : Promise.reject(new Error(response.status)),
      )
      .then((body) => {
        cache.set(url, body);
        if (isAlive) setText(body);
      })
      .catch(() => isAlive && setText(''));
    return () => {
      isAlive = false;
    };
  }, [url, isWanted]);
  return text;
}

function parseCsv(text, maxRows = Infinity) {
  const separator =
    text.slice(0, 2000).split('\t').length >
    text.slice(0, 2000).split(',').length
      ? '\t'
      : ',';
  const rows = [];
  let row = [];
  let field = '';
  let isQuoted = false;
  for (let index = 0; index < text.length && rows.length < maxRows; index++) {
    const char = text[index];
    if (isQuoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') isQuoted = false;
      else field += char;
    } else if (char === '"') isQuoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if ((field || row.length) && rows.length < maxRows)
    rows.push([...row, field]);
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

const cellStyle = {
  padding: '6px 10px',
  borderBottom: 'var(--rlg-border)',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};

function CsvTable({ rows, fz = 13 }) {
  const [head, ...body] = rows;
  if (!head) return null;
  return (
    <Box
      component="table"
      fz={fz}
      c="var(--gm-on-surface)"
      style={{ borderCollapse: 'collapse' }}
    >
      <Box component="thead" bg="var(--gm-surface-1)">
        <tr>
          {head.map((cell, index) => (
            <Box
              key={index}
              component="th"
              fz={12.5}
              fw={600}
              c="var(--gm-on-surface-variant)"
              style={cellStyle}
            >
              {cell}
            </Box>
          ))}
        </tr>
      </Box>
      <tbody>
        {body.map((cells, rowIndex) => (
          <tr key={rowIndex}>
            {cells.map((cell, index) => (
              <Box
                key={index}
                component="td"
                fw={500}
                style={{
                  ...cellStyle,
                  textAlign: /^[\d.,%+\-\s]+$/.test(cell) ? 'right' : 'left',
                }}
              >
                {cell}
              </Box>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

function IconPreview({ icon: Icon, label }) {
  return (
    <Box
      h="100%"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Icon size={32} stroke={1.5} color="var(--mantine-color-gray-5)" />
      <Text fz={12.5} fw={600} c="var(--gm-on-surface-variant)">
        {label}
      </Text>
    </Box>
  );
}

/** What the tile shows: the start of the file, drawn small. */
function Preview({ botId, file, kind }) {
  const url = fileUrl(botId, file.path);
  const isText =
    ['csv', 'markdown', 'text', 'html'].includes(kind) &&
    file.size <= PREVIEW_LIMIT;
  const text = useFileText(url, isText);

  if (kind === 'image') {
    return (
      <Image
        src={url}
        alt={file.name}
        loading="lazy"
        h="100%"
        w="100%"
        fit="cover"
        style={{ objectPosition: 'top' }}
      />
    );
  }
  if (kind === 'html' && !isText)
    return <IconPreview icon={IconFileTypeHtml} label="Page" />;
  if (kind === 'pdf') return <IconPreview icon={IconFileTypePdf} label="PDF" />;
  if (!isText)
    return (
      <IconPreview
        icon={IconFile}
        label={file.name.split('.').pop() || 'arquivo'}
      />
    );
  if (text === null) return <Skeleton h="100%" />;

  if (kind === 'html') {
    // The page itself, drawn at a desktop width and scaled into the tile. No
    // scripts in a thumbnail: the frame is fully sandboxed.
    return (
      <Miniature scale={0.25}>
        <Box
          component="iframe"
          title={file.name}
          srcDoc={drawablePage(text, { keepScripts: false })}
          sandbox=""
          tabIndex={-1}
          w="100%"
          h="100%"
          bg="var(--gm-surface)"
          style={{ border: 0, pointerEvents: 'none' }}
        />
      </Miniature>
    );
  }
  if (kind === 'csv') {
    return (
      <Miniature scale={0.5}>
        <Box p={6}>
          <CsvTable rows={parseCsv(text, 9)} fz={12} />
        </Box>
      </Miniature>
    );
  }
  return (
    <Miniature scale={0.5}>
      <Box
        p={10}
        fz={12}
        fw={500}
        c="var(--gm-on-surface-variant)"
        ff={kind === 'text' ? 'monospace' : undefined}
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
        }}
      >
        {text.slice(0, 900)}
      </Box>
    </Miniature>
  );
}

/**
 * A thumbnail is a picture of the content: drawn at full size and scaled down,
 * so the 12px floor holds in the drawing and the tile stays small.
 */
/*
 * A page the bot saved from a site refers to its own files by relative path
 * (/assets/index.js, /tools/x/assets/style.css). In a sandboxed frame those
 * paths point at this panel, which refuses them: the console filled with CORS
 * errors and the panel's own bundle was fetched again for every thumbnail.
 * They are dropped before drawing; the pages are pre-rendered, so the content
 * still shows. A thumbnail also drops every script, since none runs there.
 */
const isReachable = (url) =>
  /^(https?:|data:|blob:)/i.test(String(url || '').trim());

/**
 * Where a saved page came from, when it says so: a <base href>, a canonical
 * link, or an og:url. With it, the page's own stylesheet and fonts load from
 * the site and the preview looks like the site (24/10/2026); without it, the
 * relative assets are dropped as before.
 */
export function originOf(doc) {
  const candidates = [
    doc.querySelector('base[href]')?.getAttribute('href'),
    doc.querySelector('link[rel="canonical"][href]')?.getAttribute('href'),
    doc
      .querySelector('meta[property="og:url"][content]')
      ?.getAttribute('content'),
  ];
  for (const candidate of candidates) {
    if (isReachable(candidate)) return candidate;
  }
  return null;
}

export function drawablePage(html, { keepScripts = true } = {}) {
  if (typeof DOMParser === 'undefined' || !html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const origin = originOf(doc);
  if (origin && !doc.querySelector('base[href]')) {
    const base = doc.createElement('base');
    base.setAttribute('href', origin);
    doc.head.prepend(base);
  }
  for (const element of doc.querySelectorAll('script[src], link[href]')) {
    const url = element.getAttribute('src') ?? element.getAttribute('href');
    const isAsset =
      element.tagName === 'SCRIPT' ||
      /stylesheet|preload|modulepreload|icon|manifest/i.test(
        element.getAttribute('rel') || '',
      );
    if (isAsset && !isReachable(url) && !origin) element.remove();
  }
  if (!keepScripts)
    for (const element of doc.querySelectorAll('script')) element.remove();
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function Miniature({ scale, children }) {
  return (
    <Box
      w={`${100 / scale}%`}
      h={`${100 / scale}%`}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      {children}
    </Box>
  );
}

/** − / % / + / Ajustar / 100%: the same bar on every kind of file. */
function ZoomControls({ zoom, isFit, isActual, onZoom, onFit, hint }) {
  return (
    <Group gap={6} mb={10}>
      <Button
        size="compact-sm"
        variant="default"
        aria-label="Diminuir"
        onClick={() => onZoom(zoom / 1.25)}
      >
        <IconMinus size={14} stroke={1.5} />
      </Button>
      <Text fz={12} fw={700} c="var(--gm-on-surface)" w={48} ta="center">
        {Math.round(zoom * 100)}%
      </Text>
      <Button
        size="compact-sm"
        variant="default"
        aria-label="Aumentar"
        onClick={() => onZoom(zoom * 1.25)}
      >
        <IconPlus size={14} stroke={1.5} />
      </Button>
      <Button
        size="compact-sm"
        variant={isFit ? 'filled' : 'default'}
        onClick={onFit}
      >
        Adjust
      </Button>
      <Button
        size="compact-sm"
        variant={isActual ? 'filled' : 'default'}
        onClick={() => onZoom(1)}
      >
        100%
      </Button>
      {hint && (
        <Text
          fz={12}
          fw={500}
          c="var(--gm-on-surface-variant)"
          visibleFrom="sm"
        >
          {hint}
        </Text>
      )}
    </Group>
  );
}

/** ⌘ or Ctrl + scroll (and a trackpad pinch) zooms the element it is bound to. */
function useWheelZoom(ref, zoom, setZoom) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(clampZoom(zoom * Math.exp(-event.deltaY * 0.01)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  });
}

/**
 * A page the bot made, at any zoom: the frame is drawn at the window's size
 * divided by the zoom and scaled back, so zooming out shows more of the page as
 * a wider screen would, and zooming in enlarges it. Fit is the page at the
 * window's own width.
 */
function ZoomablePage({ html, title }) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  useWheelZoom(boxRef, zoom, setZoom);
  return (
    <Box>
      <ZoomControls
        zoom={zoom}
        isFit={zoom === 1}
        isActual={zoom === 1}
        onZoom={(value) => setZoom(clampZoom(value))}
        onFit={() => setZoom(1)}
        hint="⌘ or Ctrl + scroll to zoom"
      />
      <Box
        ref={boxRef}
        h="74vh"
        bg="var(--gm-surface)"
        bd="var(--rlg-border)"
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        {/* Its scripts run, but in an opaque origin: no cookies, no token, no access to this page. */}
        <Box
          component="iframe"
          title={title}
          srcDoc={drawablePage(html)}
          sandbox="allow-scripts"
          w={`${100 / zoom}%`}
          h={`${100 / zoom}%`}
          style={{
            border: 0,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            position: 'absolute',
            inset: 0,
          }}
        />
      </Box>
    </Box>
  );
}

/** Tables, documents and text: the content itself grows or shrinks. */
function ZoomableContent({ children }) {
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  useWheelZoom(boxRef, zoom, setZoom);
  return (
    <Box>
      <ZoomControls
        zoom={zoom}
        isFit={zoom === 1}
        isActual={zoom === 1}
        onZoom={(value) => setZoom(clampZoom(value))}
        onFit={() => setZoom(1)}
        hint="⌘ or Ctrl + scroll to zoom"
      />
      <Box ref={boxRef} h="74vh" style={{ overflow: 'auto' }}>
        <Box style={{ zoom }}>{children}</Box>
      </Box>
    </Box>
  );
}

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/**
 * An image to read: fits the window by default; − / + and ⌘ or Ctrl + scroll
 * (a trackpad pinch arrives the same way) zoom, a double click toggles fit and
 * actual size, and dragging pans when it is larger than the window.
 */
function ZoomableImage({ src, alt }) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(null);

  const fitZoom = () => {
    const viewport = viewportRef.current;
    if (!viewport || !natural) return 1;
    return clampZoom(
      Math.min(
        viewport.clientWidth / natural.width,
        viewport.clientHeight / natural.height,
        1,
      ),
    );
  };
  const current = zoom ?? fitZoom();

  // Zooming keeps the point under the cursor (or the center) in place.
  const zoomTo = (next, anchor) => {
    const viewport = viewportRef.current;
    const target = clampZoom(next);
    if (!viewport) return setZoom(target);
    const point = anchor ?? {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2,
    };
    const ratio = target / current;
    const left = (viewport.scrollLeft + point.x) * ratio - point.x;
    const top = (viewport.scrollTop + point.y) * ratio - point.y;
    setZoom(target);
    requestAnimationFrame(() => viewport.scrollTo({ left, top }));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const box = viewport.getBoundingClientRect();
      zoomTo(current * Math.exp(-event.deltaY * 0.01), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  });

  const startDrag = (event) => {
    const viewport = viewportRef.current;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    viewportRef.current.scrollTo({
      left: drag.left - (event.clientX - drag.x),
      top: drag.top - (event.clientY - drag.y),
    });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const isFit = zoom === null;
  return (
    <Box>
      <ZoomControls
        zoom={current}
        isFit={isFit}
        isActual={zoom === 1}
        onZoom={(value) => zoomTo(value)}
        onFit={() => setZoom(null)}
        hint="⌘ or Ctrl + scroll to zoom · double-click to toggle"
      />
      <Box
        ref={viewportRef}
        h="74vh"
        bg="var(--gm-surface-1)"
        style={{
          overflow: 'auto',
          cursor: isFit ? 'zoom-in' : dragRef.current ? 'grabbing' : 'grab',
          display: 'flex',
        }}
        onMouseDown={startDrag}
        onMouseMove={moveDrag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={(event) => {
          const box = viewportRef.current.getBoundingClientRect();
          if (isFit)
            zoomTo(1, {
              x: event.clientX - box.left,
              y: event.clientY - box.top,
            });
          else setZoom(null);
        }}
      >
        <Image
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) =>
            setNatural({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          w={natural ? natural.width * current : 'auto'}
          h={natural ? natural.height * current : 'auto'}
          maw="none"
          m="auto"
          style={{ flex: 'none', userSelect: 'none' }}
        />
      </Box>
    </Box>
  );
}

/** The whole file, inside the modal. */
function Viewer({ botId, file }) {
  const kind = kindOf(file.name);
  const url = fileUrl(botId, file.path);
  const isText = ['csv', 'markdown', 'text', 'html'].includes(kind);
  const text = useFileText(url, isText);

  if (kind === 'image') {
    return <ZoomableImage src={url} alt={file.name} />;
  }
  if (kind === 'pdf') {
    return (
      <Box
        component="iframe"
        src={url}
        title={file.name}
        w="100%"
        h="78vh"
        bd="var(--rlg-border)"
      />
    );
  }
  if (!isText) {
    return (
      <Text fz={14} c="var(--gm-on-surface-variant)">
        No preview for this file type. Use the Download button.
      </Text>
    );
  }
  if (text === null) return <Skeleton h={320} />;
  if (kind === 'html') {
    return <ZoomablePage html={text} title={file.name} />;
  }
  if (kind === 'csv') {
    return (
      <ZoomableContent>
        <CsvTable rows={parseCsv(text, 5000)} />
      </ZoomableContent>
    );
  }
  if (kind === 'markdown') {
    return (
      <ZoomableContent>
        <Box maw={820}>
          <RichText text={text} color="var(--gm-on-surface)" />
        </Box>
      </ZoomableContent>
    );
  }
  return (
    <ZoomableContent>
      <Box
        component="pre"
        m={0}
        fz={12}
        c="var(--gm-on-surface)"
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {text}
      </Box>
    </ZoomableContent>
  );
}

/** The folder a file sits in, from its workspace path: tells apart files with the same name. */
const folderOf = (path) =>
  path.replace('/home/sprite/', '').split('/').slice(0, -1).join('/');

export function FileGallery({ botId, files }) {
  const [open, setOpen] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // The file lives on the worker's domain, where the browser ignores the
  // download attribute; the bytes come here first and are saved by name.
  const download = async (file) => {
    setIsDownloading(true);
    try {
      const response = await fetch(fileUrl(botId, file.path));
      if (!response.ok) throw new Error(failureText(response.status));
      const href = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement('a'), {
        href,
        download: file.name,
      });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (error) {
      notify.error(`Couldn't download: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };
  const isPhone = useMediaQuery('(max-width: 48em)');
  return (
    <>
      <SimpleGrid cols={{ base: 3, sm: 6 }} spacing={6}>
        {files.map((file) => {
          const kind = kindOf(file.name);
          return (
            <UnstyledButton
              key={file.path}
              onClick={() => setOpen(file)}
              aria-label={`Open ${file.name}`}
              bd="var(--rlg-border)"
              bg="var(--gm-surface)"
              miw={0}
            >
              <Box
                h={84}
                bg={kind === 'image' ? 'gray.1' : undefined}
                style={{
                  overflow: 'hidden',
                  borderBottom: 'var(--rlg-border)',
                }}
              >
                <Preview botId={botId} file={file} kind={kind} />
              </Box>
              <Box
                px={8}
                py={6}
                title={`${file.name} · ${formatSize(file.size)} · ${folderOf(file.path)}`}
              >
                <Text fz={12} fw={700} c="var(--gm-on-surface)" lineClamp={1}>
                  {file.name}
                </Text>
                <Text
                  fz={12}
                  fw={500}
                  c="var(--gm-on-surface-variant)"
                  lineClamp={1}
                >
                  {formatSize(file.size)}
                </Text>
              </Box>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
      <Modal
        opened={Boolean(open)}
        onClose={() => setOpen(null)}
        size={isPhone ? '100%' : '90%'}
        fullScreen={isPhone}
        title={
          <Group gap={12} wrap="nowrap" miw={0}>
            <Text fz={14} fw={800} c="var(--gm-on-surface)" lineClamp={1}>
              {open?.name}
            </Text>
            <Text
              fz={12}
              fw={500}
              c="var(--gm-on-surface-variant)"
              lineClamp={1}
              visibleFrom="sm"
            >
              {open && `${formatSize(open.size)} · ${folderOf(open.path)}`}
            </Text>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconDownload size={14} stroke={1.5} />}
              loading={isDownloading}
              onClick={() => download(open)}
              style={{ flex: 'none' }}
            >
              Download
            </Button>
          </Group>
        }
      >
        {open && <Viewer botId={botId} file={open} />}
      </Modal>
    </>
  );
}
