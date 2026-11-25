import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The prototype's one menu: fixed under its anchor (above it when there is no
 * room), a calm height with the title and the search held on top while the
 * list scrolls, closed by Escape or a click outside. A chip's menu aligns with
 * the chip's left edge.
 */
// `maxHeight`: a short menu of actions shows whole; the 420px cap is for long lists with a search.
export function Menu({
  anchor,
  title,
  search = false,
  width = 300,
  alignLeft = false,
  maxHeight = null,
  onClose,
  onQuery = null,
  children,
}) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    const left = Math.max(
      8,
      Math.min(innerWidth - w - 8, alignLeft ? r.left : r.right - w),
    );
    const isUp = r.bottom + 4 + h > innerHeight - 8;
    setPlace({ left, top: Math.max(8, isUp ? r.top - h - 6 : r.bottom + 4) });
  }, [anchor, alignLeft, children]);

  useEffect(() => {
    const onDown = (event) => {
      if (
        !ref.current?.contains(event.target) &&
        !anchor?.contains(event.target)
      )
        onClose();
    };
    const onKey = (event) => event.key === 'Escape' && onClose();
    addEventListener('pointerdown', onDown);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('pointerdown', onDown);
      removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  // The search hides the options whose text does not have what was typed.
  useEffect(() => {
    const q = query.toLowerCase();
    ref.current?.querySelectorAll('.opt').forEach((option) => {
      option.hidden =
        Boolean(q) && !option.textContent.toLowerCase().includes(q);
    });
  }, [query, children]);

  return createPortal(
    <div
      ref={ref}
      className="menu opts"
      role="menu"
      style={{ width, ...(maxHeight ? { maxHeight } : {}), ...place }}
    >
      {title && <div className="h label">{title}</div>}
      {search && (
        <input
          className="search-in"
          placeholder="Buscar…"
          aria-label="Buscar"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onQuery?.(event.target.value);
          }}
        />
      )}
      {children}
    </div>,
    document.body,
  );
}

/** Holds which menu is open and on what element: `open(name)(event)`, `close()`. */
export function useMenu() {
  const [menu, setMenu] = useState(null);
  return {
    menu,
    is: (name) => menu?.name === name,
    anchor: menu?.anchor ?? null,
    // The anchor is read now: React clears currentTarget once the handler returns,
    // and the updater may run later when another state changes in the same click.
    open: (name) => (event) => {
      const anchor = event.currentTarget;
      setMenu((current) => (current?.name === name ? null : { name, anchor }));
    },
    close: () => setMenu(null),
  };
}

/** An option with a bold first line and a small second line, as the prototype draws them. */
export function Opt({
  title,
  note,
  icon = null,
  isOn = false,
  onClick,
  mono = false,
}) {
  return (
    <button className={`opt${isOn ? ' hl' : ''}`} onClick={onClick}>
      <b>
        {icon}
        <span className={mono ? 'mono' : undefined}>{title}</span>
        {isOn && <i className="ti ti-check" />}
      </b>
      {note && <small>{note}</small>}
    </button>
  );
}

/** An option that marks and unmarks, for lists like connections and skills. */
export function CheckOpt({ isOn, title, note, onClick, mono = false }) {
  return (
    <button className={`opt check${isOn ? ' hl' : ''}`} onClick={onClick}>
      <b>
        <i className={`ti ${isOn ? 'ti-square-check' : 'ti-square'}`} />
        <span className={mono ? 'mono' : undefined}>{title}</span>
      </b>
      {note && <small>{note}</small>}
    </button>
  );
}
