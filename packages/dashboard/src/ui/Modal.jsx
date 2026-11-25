import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** The prototype's modal: a title with its glyph, the body, closed by Escape, the X or a click outside. */
export function Modal({ title, icon, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="backdrop"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div className="modal" role="dialog" aria-label={title}>
        <div className="mh">
          <i className={`ti ${icon}`} />
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="mb">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
