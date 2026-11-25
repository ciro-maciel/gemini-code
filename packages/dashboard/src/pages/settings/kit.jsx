// The pieces every Settings section is built from (docs/settings.md):
// a header that says what the section is for, groups of rows on a tonal
// surface, a state said in words, numbers that read at a glance, and the
// loading, empty and error states. A new section uses these and nothing else.

/** The section's top: its name, what it is for in one or two sentences, and its one main action. */
export function SettingsHeader({ title, description, actions = null }) {
  return (
    <header className="st-head">
      <div className="st-head-text">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="st-head-actions">{actions}</div>}
    </header>
  );
}

/** A group of rows on a tonal surface, with an optional title, note and foot. */
export function SettingsGroup({
  title,
  note,
  actions = null,
  footer,
  children,
}) {
  return (
    <section className="st-group">
      {(title || actions) && (
        <div className="st-group-head">
          <div>
            {title && <h3>{title}</h3>}
            {note && <p>{note}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="st-rows">{children}</div>
      {footer && <div className="st-group-foot">{footer}</div>}
    </section>
  );
}

/**
 * One row: an icon in a circle (or an image, or a number for a step), what
 * it is, a line on what it means, and on the right its value or control.
 */
export function SettingsRow({
  icon,
  image,
  step,
  title,
  description,
  children,
  isMono = false,
}) {
  return (
    <div className="st-row">
      {(icon || image || step) && (
        <span className={`st-icon${image ? ' is-image' : ''}`}>
          {image ? (
            <img alt="" src={image} />
          ) : step ? (
            <b>{step}</b>
          ) : (
            <i className={`ti ${icon}`} />
          )}
        </span>
      )}
      <span className="st-text">
        <span className={`st-title${isMono ? ' mono' : ''}`}>{title}</span>
        {description && <span className="st-desc">{description}</span>}
      </span>
      {children && <span className="st-trail">{children}</span>}
    </div>
  );
}

const STATE_ICON = {
  ok: 'ti-circle-check',
  warn: 'ti-alert-triangle',
  fail: 'ti-circle-x',
  off: 'ti-circle-minus',
  wait: 'ti-clock',
};

/**
 * Parts of a line, joined with a middle dot, each its own text so the
 * Portuguese layer translates each one ("3 agents", "seen just now").
 */
export function Parts({ items }) {
  const shown = items.filter(Boolean);
  return shown.map((item, index) => (
    <span key={index}>
      {index > 0 && ' · '}
      {item}
    </span>
  ));
}

/** A state as a word with its icon: never a color alone. */
export function StateTag({ status, children }) {
  return (
    <span className={`st-tag is-${status}`}>
      <i className={`ti ${STATE_ICON[status]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Numbers that read at a glance: the value, what it counts, and over what. */
export function StatGrid({ items, isLoading = false }) {
  return (
    <div className="st-stats">
      {items.map((item) => (
        <div className="st-stat" key={item.label}>
          <span className="st-stat-label">{item.label}</span>
          {isLoading ? (
            <span className="st-sk" style={{ width: 48, height: 28 }} />
          ) : (
            <b className="st-stat-value">{item.value}</b>
          )}
          {item.note && <span className="st-stat-note">{item.note}</span>}
        </div>
      ))}
    </div>
  );
}

/** A short notice inside a section: what is true here and what to do. */
export function Notice({
  tone = 'info',
  icon = 'ti-info-circle',
  title,
  children,
}) {
  return (
    <div className={`st-notice is-${tone}`}>
      <i className={`ti ${icon}`} aria-hidden="true" />
      <div>
        {title && <b>{title}</b>}
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

/** The rows' shape while they load, after the one loader of the page. */
export function SettingsSkeleton({ rows = 3 }) {
  return (
    <section className="st-group" aria-hidden="true">
      <div className="st-rows">
        {Array.from({ length: rows }, (_, index) => (
          <div className="st-row" key={index}>
            <span className="st-icon st-sk" />
            <span className="st-text">
              <span className="st-sk" style={{ width: '34%', height: 12 }} />
              <span className="st-sk" style={{ width: '62%', height: 10 }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
