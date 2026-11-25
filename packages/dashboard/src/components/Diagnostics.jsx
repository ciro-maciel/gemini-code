import { useCallback, useEffect, useState } from 'react';

import { fetchDiagnostics } from '../services/api';
import { notify } from './zen';
import { locale } from '../lib/language';
import { SettingsHeader } from '../pages/settings/kit';

const STATUS = {
  ok: { icon: 'ti-circle-check', label: 'OK' },
  warn: { icon: 'ti-alert-triangle', label: 'Attention' },
  fail: { icon: 'ti-circle-x', label: 'Failing' },
  off: { icon: 'ti-circle-minus', label: 'Off' },
};
const GROUPS = ['System', 'Gemini', 'Agents', 'Connectors', 'Permissions'];

const reportOf = (result) =>
  [
    `Gemini Code diagnostics · ${new Date(result.checkedAt).toISOString()}`,
    `ok ${result.summary.ok} · attention ${result.summary.warn} · failing ${result.summary.fail} · off ${result.summary.off}`,
    ...GROUPS.flatMap((group) => [
      '',
      group,
      ...result.items
        .filter((item) => item.group === group)
        .map(
          (item) =>
            `  [${item.status}] ${item.title}: ${item.detail} (${item.ms} ms)`,
        ),
    ]),
  ].join('\n');

/**
 * Settings › Diagnostics: every part of Gemini Code checked for real, now,
 * the server, the database, the Gemini key, each agent and its folder, the
 * connectors and the permissions, each with its state, the reason in words
 * and how long it took. The report copies as text for whoever helps.
 */
export function Diagnostics() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const run = useCallback(() => {
    setIsRunning(true);
    setError(null);
    fetchDiagnostics()
      .then(setResult)
      .catch((reason) => setError(reason.message || 'no answer'))
      .finally(() => setIsRunning(false));
  }, []);
  useEffect(run, [run]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportOf(result));
      notify.success('Report copied');
    } catch {
      notify.error('The browser did not let the report be copied');
    }
  };

  return (
    <div className="diag">
      <SettingsHeader
        title="Diagnostics"
        description="Every part of Gemini Code checked now: whether it works, is connected and is allowed. Copy the report to send it to whoever helps."
        actions={
          <>
            <button
              className="btn outline sm"
              onClick={copy}
              disabled={!result || isRunning}
            >
              <i className="ti ti-copy" />
              Copy report
            </button>
            <button
              className="btn filled sm"
              onClick={run}
              disabled={isRunning}
            >
              <i className={`ti ti-refresh${isRunning ? ' diag-spin' : ''}`} />
              {isRunning ? 'Checking…' : 'Run again'}
            </button>
          </>
        }
      />

      {error && (
        <div className="st-notice is-fail diag-error">
          <i className="ti ti-plug-connected-x" />
          <div>
            <b>The server did not answer</b>
            <p>{error}. Check that Gemini Code is running, then run again.</p>
          </div>
        </div>
      )}

      {!result && !error && <DiagnosticsSkeleton />}

      {result && (
        <>
          <div className="diag-summary">
            {Object.entries(STATUS).map(([status, meta]) => (
              <span key={status} className={`diag-pill is-${status}`}>
                <i className={`ti ${meta.icon}`} />
                <b>{result.summary[status]}</b>
                {meta.label}
              </span>
            ))}
            <span className="diag-when">
              {`Checked at ${new Date(result.checkedAt).toLocaleTimeString(locale())}`}
            </span>
          </div>
          {GROUPS.map((group) => {
            const items = result.items.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <section key={group} className="st-group diag-group">
                <h3>{group}</h3>
                {items.map((item) => (
                  <div key={item.id} className={`diag-row is-${item.status}`}>
                    <i
                      className={`ti ${STATUS[item.status].icon}`}
                      aria-label={STATUS[item.status].label}
                    />
                    <span className="diag-text">
                      <span className="diag-title">{item.title}</span>
                      <span className="diag-detail">{item.detail}</span>
                    </span>
                    <span className="diag-ms">{item.ms} ms</span>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function DiagnosticsSkeleton() {
  return GROUPS.slice(0, 3).map((group) => (
    <section key={group} className="st-group diag-group" aria-hidden="true">
      <h3>{group}</h3>
      {[0, 1, 2].map((row) => (
        <div key={row} className="diag-row sk">
          <span className="sk-dot" />
          <span className="diag-text">
            <span className="sk-line" style={{ width: '32%' }} />
            <span className="sk-line" style={{ width: '58%' }} />
          </span>
        </div>
      ))}
    </section>
  ));
}
