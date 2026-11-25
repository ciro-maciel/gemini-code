import { useCallback, useEffect, useId, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

/**
 * Gemini Code UI Primitives — Open-source Google / Gemini Material Design 3 kit.
 * Replaces proprietary dashboard-kit components with native Material 3 tokens.
 */

export function GeminiSparkle({ size = 24, className = '' }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={`gm-sparkle ${className}`.trim()}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={id}
          x1="2"
          y1="2"
          x2="26"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="52%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M14 1.5C14.7 8.1 19.9 13.3 26.5 14C19.9 14.7 14.7 19.9 14 26.5C13.3 19.9 8.1 14.7 1.5 14C8.1 13.3 13.3 8.1 14 1.5Z"
        fill={`url(#${id})`}
      />
    </svg>
  );
}

export function Wordmark({ name = 'Gemini Code', size = 22 }) {
  return (
    <Group gap={10} align="center" wrap="nowrap">
      <GeminiSparkle size={size} />
      <Text
        fw={600}
        fz={18}
        lts="-0.02em"
        style={{ color: 'var(--gm-on-surface)' }}
      >
        {name}
      </Text>
    </Group>
  );
}

export function ColumnBrand({ name = 'Gemini Code' }) {
  return <Wordmark name={name} size={20} />;
}

export function AuthLoader({
  name = 'Gemini Code',
  label = 'Loading workspace…',
}) {
  return (
    <Flex
      h="100dvh"
      justify="center"
      align="center"
      style={{ background: 'var(--gm-canvas)' }}
    >
      <Stack align="center" gap={16}>
        <GeminiSparkle size={40} className="assistant-pulse" />
        <Text fw={600} fz={18} style={{ color: 'var(--gm-on-surface)' }}>
          {name}
        </Text>
        <Text fz={13} style={{ color: 'var(--gm-on-surface-variant)' }}>
          {label}
        </Text>
      </Stack>
    </Flex>
  );
}

export const NOTIFICATIONS_PROPS = {
  position: 'bottom-right',
  autoClose: 4500,
  limit: 4,
};

export const notify = {
  success(title, message) {
    notifications.show({
      title: message ? title : undefined,
      message: message || title,
      color: 'teal',
      radius: 'lg',
    });
  },
  error(title, message) {
    notifications.show({
      title: message ? title : undefined,
      message: message || title,
      color: 'red',
      radius: 'lg',
    });
  },
  info(title, message) {
    notifications.show({
      title: message ? title : undefined,
      message: message || title,
      color: 'blue',
      radius: 'lg',
    });
  },
};

const TAG_STYLE = {
  dark: {
    background: 'var(--gm-primary-container)',
    color: 'var(--gm-on-primary-container)',
    borderColor: 'transparent',
  },
  up: {
    background: 'var(--gm-success-container)',
    color: 'var(--gm-success)',
    borderColor: 'transparent',
  },
  no: {
    background: 'var(--gm-error-container)',
    color: 'var(--gm-error)',
    borderColor: 'transparent',
  },
  neutral: {
    background: 'var(--gm-surface-2)',
    color: 'var(--gm-on-surface-variant)',
    borderColor: 'var(--gm-outline-variant)',
  },
};

export function Tag({ children, tone = 'neutral' }) {
  const colors = TAG_STYLE[tone] || TAG_STYLE.neutral;
  return (
    <Box
      component="span"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        border: `1px solid ${colors.borderColor}`,
        background: colors.background,
        color: colors.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

export function Metric({ label, value, unit, note, delta, size = 'md' }) {
  return (
    <Box
      style={{
        padding: size === 'sm' ? '12px 14px' : '16px 18px',
        borderRadius: 16,
        background: 'var(--gm-surface-1)',
        border: '1px solid var(--gm-outline-variant)',
      }}
    >
      <Text fz={11} fw={600} style={{ color: 'var(--gm-on-surface-variant)' }}>
        {label}
      </Text>
      <Group gap={6} align="baseline" mt={4}>
        <Text
          fz={size === 'sm' ? 22 : 28}
          fw={600}
          lts="-0.02em"
          style={{ color: 'var(--gm-on-surface)' }}
        >
          {value}
        </Text>
        {unit && (
          <Text
            fz={12}
            fw={500}
            style={{ color: 'var(--gm-on-surface-variant)' }}
          >
            {unit}
          </Text>
        )}
        {delta && (
          <Text
            fz={12}
            fw={600}
            style={{
              color: String(delta).startsWith('-')
                ? 'var(--gm-error)'
                : 'var(--gm-success)',
            }}
          >
            {delta}
          </Text>
        )}
      </Group>
      {note && (
        <Text fz={12} mt={4} style={{ color: 'var(--gm-on-surface-variant)' }}>
          {note}
        </Text>
      )}
    </Box>
  );
}

export function DataTable({
  columns = [],
  rows = [],
  getRowKey = (_, i) => i,
}) {
  const template = columns.map((col) => col.width || '1fr').join(' ');
  return (
    <Box
      style={{
        borderRadius: 16,
        border: '1px solid var(--gm-outline-variant)',
        overflow: 'hidden',
        background: 'var(--gm-surface)',
      }}
    >
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: template,
          gap: 12,
          padding: '10px 14px',
          background: 'var(--gm-surface-1)',
          borderBottom: '1px solid var(--gm-outline-variant)',
        }}
      >
        {columns.map((col) => (
          <Text
            key={col.key}
            fz={11}
            fw={600}
            style={{ color: 'var(--gm-on-surface-variant)' }}
          >
            {col.label}
          </Text>
        ))}
      </Box>
      {rows.map((row, index) => (
        <Box
          key={getRowKey(row, index)}
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            gap: 12,
            padding: '10px 14px',
            fontSize: 13,
            color: 'var(--gm-on-surface)',
            borderBottom:
              index < rows.length - 1
                ? '1px solid var(--gm-outline-variant)'
                : 'none',
          }}
        >
          {columns.map((col) => (
            <Box key={col.key}>
              {col.render ? col.render(row) : row[col.key]}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function DeleteModal({
  opened,
  onClose,
  onConfirm,
  target,
  context,
  consequences = [],
  confirmLabel = 'Delete',
  loading = false,
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      radius="xl"
      padding={24}
      withCloseButton={false}
    >
      <Stack gap={14}>
        {context && (
          <Text
            fz={12}
            fw={600}
            style={{ color: 'var(--gm-on-surface-variant)' }}
          >
            {context}
          </Text>
        )}
        <Text fz={20} fw={600} style={{ color: 'var(--gm-on-surface)' }}>
          Delete {target || 'item'}?
        </Text>
        {consequences.length > 0 && (
          <Stack gap={6}>
            {consequences.map((line, i) => (
              <Text
                key={i}
                fz={13}
                lh={1.5}
                style={{ color: 'var(--gm-on-surface-variant)' }}
              >
                {line}
              </Text>
            ))}
          </Stack>
        )}
        <Group justify="flex-end" gap={8} mt={8}>
          <Button
            variant="subtle"
            radius="xl"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button color="red" radius="xl" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function EmptyState({ icon, title, description, action = null }) {
  return (
    <Stack align="center" justify="center" gap={10} py={40} px={20}>
      {icon}
      <Text fz={16} fw={600} style={{ color: 'var(--gm-on-surface)' }}>
        {title}
      </Text>
      {description && (
        <Text
          fz={13}
          ta="center"
          maw={420}
          style={{ color: 'var(--gm-on-surface-variant)' }}
        >
          {description}
        </Text>
      )}
      {action}
    </Stack>
  );
}

export function ListSkeleton({ count = 4 }) {
  return (
    <Stack gap={10}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={44} radius="md" />
      ))}
    </Stack>
  );
}

export function SupportModal({
  opened,
  onClose,
  productName = 'Gemini Code',
  apiUrl = '',
  contextRows = [],
}) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!opened) return;
    const start = performance.now();
    fetch(`${apiUrl}/api/health`)
      .then((r) =>
        setStatus(
          r.ok
            ? `Connected (${Math.round(performance.now() - start)} ms)`
            : `HTTP ${r.status}`,
        ),
      )
      .catch(() => setStatus('Offline'));
  }, [opened, apiUrl]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      radius="xl"
      padding={24}
      title={productName}
    >
      <Stack gap={12}>
        <Text fz={13} style={{ color: 'var(--gm-on-surface-variant)' }}>
          Open-source autonomous engineering workspace powered by Google Gemini.
        </Text>
        <Box
          style={{
            padding: 14,
            borderRadius: 12,
            background: 'var(--gm-surface-1)',
            border: '1px solid var(--gm-outline-variant)',
          }}
        >
          <Text fz={12} fw={600} style={{ color: 'var(--gm-on-surface)' }}>
            Control Server: {status || 'Checking…'}
          </Text>
          {contextRows.map((row, idx) => (
            <Text
              key={idx}
              fz={12}
              mt={4}
              style={{ color: 'var(--gm-on-surface-variant)' }}
            >
              {row}
            </Text>
          ))}
        </Box>
        <Group justify="flex-end" mt={4}>
          <Button variant="filled" radius="xl" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function ZenLabel({ children }) {
  return (
    <Text fz={11} fw={600} style={{ color: 'var(--gm-on-surface-variant)' }}>
      {children}
    </Text>
  );
}

export function NavItem({ label, active, onClick, icon }) {
  return (
    <button className={`item${active ? ' on' : ''}`} onClick={onClick}>
      {icon}
      <span className="t">{label}</span>
    </button>
  );
}

export function SidebarShell({ children }) {
  return <div className="app">{children}</div>;
}

export function useExclusiveModal() {
  const [active, setActive] = useState(null);
  const open = useCallback((name) => setActive(name), []);
  const close = useCallback(() => setActive(null), []);
  return { active, open, close, isOpen: (name) => active === name };
}

export const AUTH_LABELS = { signIn: { email: 'Email', submit: 'Continue' } };
export const AUTH_TEXTS = {
  signIn: {
    title: 'Sign in to Gemini Code',
    codeSent: 'Code sent',
    error: 'Sign in failed',
  },
};
