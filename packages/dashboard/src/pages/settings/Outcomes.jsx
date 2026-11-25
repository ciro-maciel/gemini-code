import { useEffect, useState } from 'react';

import { fetchOutcomeMetrics } from '../../services/api';
import { Notice, Parts, SettingsGroup, StatGrid } from './kit';

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

/** What happened to approvals, and when agents needed a person, in the last 30 days. */
export function Outcomes() {
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
      note={`The last ${DAYS} days.`}
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
        ]}
      />
    </SettingsGroup>
  );
}
