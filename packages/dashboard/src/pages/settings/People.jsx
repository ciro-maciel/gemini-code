import { useCallback, useEffect, useState } from 'react';

import {
  fetchAccounts,
  fetchOutcomeMetrics,
  updateAccount,
} from '../../services/api';
import { formatWhen } from '../../labels';
import { locale } from '../../lib/language';
import { useAccount } from '../../components/Session';
import { notify } from '../../components/zen';
import {
  Notice,
  Parts,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsSkeleton,
  StatGrid,
  StateTag,
} from './kit';

const ACCESS = {
  active: ['ok', 'Allowed'],
  pending: ['wait', 'Waiting'],
  blocked: ['fail', 'Blocked'],
};

const money = (value) =>
  `US$ ${(value || 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const initialsOf = (text) =>
  String(text || '?')
    .split(/[\s.@]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function PersonRow({ person, onChange }) {
  const [isSaving, setIsSaving] = useState(false);
  const change = async (status) => {
    setIsSaving(true);
    try {
      await updateAccount(person.id, { status });
      onChange();
    } catch (error) {
      notify.error("Couldn't change access", error.message);
    } finally {
      setIsSaving(false);
    }
  };
  const [status, label] = ACCESS[person.status] ?? ['off', person.status];
  const name = person.name || person.email;
  return (
    <SettingsRow
      step={initialsOf(name)}
      title={name}
      description={
        <Parts
          items={[
            person.email !== name && person.email,
            `${person.botCount} ${person.botCount === 1 ? 'agent' : 'agents'}`,
            `${money(person.costToday)} today`,
            `seen ${formatWhen(person.lastSeenAt)}`,
            person.firstWish && `wants: ${person.firstWish}`,
          ]}
        />
      }
    >
      {person.isOwner && <span className="st-tag">You</span>}
      <StateTag status={status}>{label}</StateTag>
      {!person.isOwner && person.status !== 'active' && (
        <button
          className="btn filled sm"
          disabled={isSaving}
          onClick={() => change('active')}
        >
          Allow
        </button>
      )}
      {!person.isOwner && person.status !== 'blocked' && (
        <button
          className="btn outline sm"
          disabled={isSaving}
          onClick={() => change('blocked')}
        >
          Block
        </button>
      )}
    </SettingsRow>
  );
}

const FAILURE_LABEL = {
  approval_rejected: 'Approval refused',
  ask_user: 'A question for the person',
  takeover: 'The person took over the screen',
  checkpoint_restored: 'Restore point',
  tool_error: 'Tool error',
  judge_unavailable: 'Risk not judged',
  task_failed: 'Task failed',
  task_cancelled: 'Task stopped',
  step_limit: 'Step limit',
  empty_reply: 'Empty answer',
  daily_limit: 'Daily limit',
  concurrency: 'Waited for a slot',
};

const DAYS = 30;

/** What happened to approvals, and when agents needed a person, in every account. */
function Outcomes() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetchOutcomeMetrics(DAYS)
      .then(setMetrics)
      .catch((reason) => setError(reason.message));
  }, []);
  const outcomes = metrics?.outcomes ?? {};
  const approved =
    (outcomes.approved ?? 0) +
    (outcomes.approved_task ?? 0) +
    (outcomes.approved_always ?? 0);
  const failures = Object.entries(metrics?.failures ?? {}).sort(
    (a, b) => b[1] - a[1],
  );
  if (error)
    return (
      <Notice
        tone="fail"
        icon="ti-alert-triangle"
        title="Approvals did not load"
      >
        {error}
      </Notice>
    );
  return (
    <SettingsGroup
      title="Approvals and failures"
      note={`The last ${DAYS} days, every account.`}
      footer={
        metrics &&
        (failures.length ? (
          <Parts
            items={failures.map(([kind, count]) => (
              <span key={kind}>
                <span>{FAILURE_LABEL[kind] ?? kind}</span>
                {`: ${count}`}
              </span>
            ))}
          />
        ) : (
          'No failure recorded.'
        ))
      }
    >
      <StatGrid
        isLoading={!metrics}
        items={[
          {
            label: 'Approval requests',
            value: outcomes.approval_requested ?? 0,
          },
          {
            label: 'Approved',
            value: approved,
            note: `${outcomes.approved_task ?? 0} for the task, ${outcomes.approved_always ?? 0} always`,
          },
          { label: 'Refused', value: outcomes.rejected ?? 0 },
          {
            label: 'No answer in 24 h',
            value: outcomes.timed_out ?? 0,
            note: `${metrics?.pendingApprovals ?? 0} waiting now`,
          },
          { label: 'Took over the screen', value: outcomes.takeover ?? 0 },
          { label: 'Restore points', value: outcomes.checkpoint_restored ?? 0 },
        ]}
      />
    </SettingsGroup>
  );
}

/**
 * Settings › People: who uses this Gemini Code, who waits for access, and
 * what happened to the approvals. Only the owner sees it.
 */
export function People() {
  const account = useAccount();
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    fetchAccounts()
      .then((data) => setPeople(data.items))
      .catch((reason) => setError(reason.message));
  }, []);
  useEffect(() => {
    if (account?.isOwner) load();
  }, [account?.isOwner, load]);

  if (!account?.isOwner)
    return (
      <>
        <SettingsHeader title="People" />
        <Notice icon="ti-lock" title="Only the owner sees this section">
          It lists the accounts of this Gemini Code and who waits for access.
        </Notice>
      </>
    );

  const waiting = (people ?? []).filter((item) => item.status === 'pending');
  const { limits } = account;
  return (
    <>
      <SettingsHeader
        title="People"
        description={`Who uses this Gemini Code and who waits for access. Each allowed account has up to ${limits.botsPerAccount} agents and ${limits.runningTasksPerAccount} tasks at a time, on its own Gemini API key.`}
      />
      {error && (
        <Notice
          tone="fail"
          icon="ti-alert-triangle"
          title="People did not load"
        >
          {error}
        </Notice>
      )}
      {!people && !error && <SettingsSkeleton rows={2} />}
      {people && (
        <SettingsGroup
          title={
            waiting.length
              ? `${waiting.length} waiting for access`
              : `${people.length} ${people.length === 1 ? 'account' : 'accounts'}`
          }
          note={waiting.length ? 'Allow or block each one.' : 'Nobody waiting.'}
        >
          {people.map((person) => (
            <PersonRow key={person.id} person={person} onChange={load} />
          ))}
        </SettingsGroup>
      )}
      <Outcomes />
    </>
  );
}
