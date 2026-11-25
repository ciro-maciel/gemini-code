import { useState } from 'react';

import { Modal } from './Modal';

/** A name asked in the prototype's modal: the field, then the one button. */
export function NameModal({
  title,
  icon,
  initial = '',
  action = 'Salvar',
  onSave,
  onClose,
}) {
  const [value, setValue] = useState(initial);
  const save = () => value.trim() && onSave(value.trim());
  return (
    <Modal title={title} icon={icon} onClose={onClose}>
      <input
        className="input"
        autoFocus
        aria-label={title}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
      />
      <div className="mf">
        <button className="btn filled" onClick={save} disabled={!value.trim()}>
          {action}
        </button>
      </div>
    </Modal>
  );
}
