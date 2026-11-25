import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Group,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';

import {
  fetchAccounts,
  fetchOutcomeMetrics,
  updateAccount,
} from '../services/api';
import { formatWhen } from '../labels';
import { useAccount } from '../components/Session';
import { EmptyState, Metric, notify } from '../components/zen';

const STATUS_LABEL = {
  active: 'Liberada',
  pending: 'Esperando',
  blocked: 'Bloqueada',
};

// Grid, not <Table> (09-painel.md): the same template for the header and the rows.
const COLUMNS = 'minmax(0, 2.4fr) 110px 70px 110px 110px 220px';

function money(value) {
  return `US$ ${(value || 0).toFixed(2).replace('.', ',')}`;
}

function HeadCell({ children }) {
  return (
    <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px">
      {children}
    </Text>
  );
}

function Row({ account, onChange }) {
  const [isSaving, setIsSaving] = useState(false);
  const change = async (status) => {
    setIsSaving(true);
    try {
      await updateAccount(account.id, { status });
      onChange();
    } catch (error) {
      notify.error("Couldn't change access", error.message);
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Box
      px={24}
      py={12}
      style={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 16,
        alignItems: 'center',
        borderTop: 'var(--rlg-border)',
      }}
    >
      <Box miw={0}>
        <Text fz={13} fw={700} c="gray.9" truncate>
          {account.name || account.email}
          {account.isOwner ? '(you)' : ''}
        </Text>
        <Text fz={12} fw={500} c="gray.5" truncate>
          {account.email}
        </Text>
        {account.firstWish && (
          <Text
            fz={12}
            fw={500}
            c="gray.7"
            lh={1.4}
            mt={4}
            lineClamp={2}
            title={account.firstWish}
          >
            First bot: {account.firstWish}
          </Text>
        )}
      </Box>
      <Text
        fz={13}
        fw={500}
        c={account.status === 'pending' ? 'gray.9' : 'gray.7'}
      >
        {STATUS_LABEL[account.status]}
      </Text>
      <Text fz={13} fw={500} c="gray.7">
        {account.botCount}
      </Text>
      <Text fz={13} fw={500} c="gray.7">
        {money(account.costToday)}
      </Text>
      <Text fz={13} fw={500} c="gray.7">
        {formatWhen(account.lastSeenAt)}
      </Text>
      <Group gap={8} justify="flex-end" wrap="nowrap">
        {!account.isOwner && account.status !== 'active' && (
          <Button
            size="xs"
            h={30}
            loading={isSaving}
            onClick={() => change('active')}
          >
            Allow
          </Button>
        )}
        {!account.isOwner && account.status !== 'blocked' && (
          <Button
            size="xs"
            h={30}
            variant="default"
            loading={isSaving}
            onClick={() => change('blocked')}
          >
            Block
          </Button>
        )}
      </Group>
    </Box>
  );
}

const FAILURE_LABEL = {
  approval_rejected: 'Approval denied',
  ask_user: 'Question for the person',
  takeover: 'Person took over the screen',
  checkpoint_restored: 'Restore point',
  tool_error: 'Tool error',
  judge_unavailable: 'Risk not assessed',
  task_failed: 'Task failed',
  task_cancelled: 'Task stopped',
  step_limit: 'Step limit',
  empty_reply: 'Empty answer',
  daily_limit: 'Daily limit',
  concurrency: 'Waited for a slot',
};

const METRICS_DAYS = 30;

/** What happened to the approvals, and the moments the bots needed a person, in every account. */
function Outcomes() {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => {
    fetchOutcomeMetrics(METRICS_DAYS)
      .then(setMetrics)
      .catch((error) => notify.error("Couldn't load approvals", error.message));
  }, []);
  const outcomes = metrics?.outcomes ?? {};
  const isLoading = metrics === null;
  const note = `last ${METRICS_DAYS} days, all accounts`;
  const approved =
    (outcomes.approved ?? 0) +
    (outcomes.approved_task ?? 0) +
    (outcomes.approved_always ?? 0);
  const tiles = [
    {
      label: 'Approval requests',
      value: outcomes.approval_requested ?? 0,
      note,
    },
    {
      label: 'Aprovados',
      value: approved,
      note: `${outcomes.approved_task ?? 0} until the task ends, ${outcomes.approved_always ?? 0} always`,
    },
    { label: 'Recusados', value: outcomes.rejected ?? 0, note },
    {
      label: 'No reply in 24 h',
      value: outcomes.timed_out ?? 0,
      note: `${metrics?.pendingApprovals ?? 0} waiting now`,
    },
    { label: 'Took over the screen', value: outcomes.takeover ?? 0, note },
    {
      label: 'Restore points',
      value: outcomes.checkpoint_restored ?? 0,
      note,
    },
  ];
  const failures = Object.entries(metrics?.failures ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  return (
    <Stack gap={16}>
      <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px">
        Approvals and failures
      </Text>
      <Box bg="white" p={24} style={{ border: 'var(--rlg-border)' }}>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing={24}>
          {tiles.map((tile) => (
            <Metric key={tile.label} {...tile} size="sm" loading={isLoading} />
          ))}
        </SimpleGrid>
        {!isLoading && (
          <Text
            fz={12}
            fw={500}
            c="gray.6"
            mt={24}
            pt={16}
            style={{ borderTop: 'var(--rlg-border)' }}
          >
            {failures.length
              ? failures
                  .map(
                    ([kind, count]) =>
                      `${FAILURE_LABEL[kind] ?? kind}: ${count}`,
                  )
                  .join(' · ')
              : 'No failures recorded.'}
          </Text>
        )}
      </Box>
    </Stack>
  );
}

/** The owner's view of who uses the Assistant, and the door for whoever waits. */
export function People() {
  const account = useAccount();
  const [accounts, setAccounts] = useState(null);

  const load = useCallback(() => {
    fetchAccounts()
      .then((data) => setAccounts(data.items))
      .catch((error) => notify.error("Couldn't load people", error.message));
  }, []);

  useEffect(() => {
    if (account?.isOwner) load();
  }, [account?.isOwner, load]);

  if (!account?.isOwner)
    return (
      <Box p={48}>
        <EmptyState
          title="Only the owner sees this screen"
          description="Gemini Code accounts and people waiting for access are listed here."
        />
      </Box>
    );

  const waiting = (accounts ?? []).filter(
    (item) => item.status === 'pending',
  ).length;
  const { limits } = account;
  const limitsLine = `Each approved account can have up to ${limits.botsPerAccount} bots and ${limits.runningTasksPerAccount} tasks at a time. The model runs on each account's AI key.`;

  return (
    <ScrollArea h="100%" bg="gray.0">
      <Stack
        px={{ base: 16, sm: 48 }}
        pt={40}
        pb={80}
        maw={1280}
        // Centered in the main area, as the conversation's reading line is.
        mx="auto"
        gap={32}
      >
        <Stack gap={8}>
          <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px">
            Assistant · Access
          </Text>
          <Text fz={36} fw={900} c="gray.9" lh={1.1} lts="-0.04em">
            People
          </Text>
          <Text fz={15} fw={500} c="gray.6" lh={1.6} maw={620}>
            {accounts === null
              ? 'Gemini Code accounts and people waiting for access.'
              : `${waiting ? `${waiting} ${waiting === 1 ? 'person is waiting' : 'people are waiting'} for access.` : 'Nobody waiting.'} ${limitsLine}`}
          </Text>
        </Stack>

        <Box
          bg="white"
          style={{ border: 'var(--rlg-border)', overflowX: 'auto' }}
        >
          <Box miw={840}>
            <Box
              px={24}
              py={12}
              bg="gray.1"
              style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 16 }}
            >
              <HeadCell>Account</HeadCell>
              <HeadCell>Access</HeadCell>
              <HeadCell>Bots</HeadCell>
              <HeadCell>Today</HeadCell>
              <HeadCell>Seen</HeadCell>
              <Box />
            </Box>
            {accounts === null
              ? Array.from({ length: 4 }, (_, index) => (
                  <Box
                    key={index}
                    px={24}
                    py={12}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: COLUMNS,
                      gap: 16,
                      borderTop: 'var(--rlg-border)',
                    }}
                  >
                    <Skeleton h={32} radius={0} />
                    <Skeleton h={14} radius={0} />
                    <Skeleton h={14} radius={0} />
                    <Skeleton h={14} radius={0} />
                    <Skeleton h={14} radius={0} />
                    <Box />
                  </Box>
                ))
              : accounts.map((item) => (
                  <Row key={item.id} account={item} onChange={load} />
                ))}
          </Box>
        </Box>

        <Outcomes />
      </Stack>
    </ScrollArea>
  );
}
