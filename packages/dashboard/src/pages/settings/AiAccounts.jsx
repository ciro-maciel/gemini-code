import { useEffect, useState } from 'react';

import {
  createAiAccount,
  deleteAiAccount,
  fetchAiAccounts,
  fetchAiProviders,
  fetchAvailableModels,
  setAiAccountModels,
} from '../../services/api';
import { DeleteModal, notify } from '../../components/zen';
import { locale } from '../../lib/language';
import {
  Notice,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsSkeleton,
  StateTag,
} from './kit';

const money = (value) =>
  `US$ ${(value || 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const launchedOn = (seconds) =>
  new Date(seconds * 1000).toLocaleDateString(locale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
const perMillion = (value) =>
  value.toLocaleString(locale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
const priceLine = (price) =>
  price && price.input !== null && price.output !== null
    ? price.input === 0 && price.output === 0
      ? 'free'
      : `${perMillion(price.input)} / ${perMillion(price.output)}`
    : 'no price';

/** Every chat model the key opens, newest first, searched and turned on one by one. */
function ModelPicker({ item, onSaved }) {
  const [available, setAvailable] = useState(null);
  const [query, setQuery] = useState('');
  const [on, setOn] = useState(item.models);
  useEffect(() => {
    fetchAvailableModels(item.id)
      .then((data) => setAvailable(data.items))
      .catch((error) => {
        setAvailable([]);
        notify.error(error.message);
      });
  }, [item.id]);
  const toggle = async (id) => {
    const next = on.includes(id)
      ? on.filter((model) => model !== id)
      : [...on, id];
    setOn(next);
    try {
      await setAiAccountModels(item.id, next);
      onSaved();
    } catch (error) {
      setOn(on);
      notify.error(error.message);
    }
  };
  const q = query.trim().toLowerCase();
  const shown = (available ?? []).filter(
    (model) => !q || `${model.id} ${model.label}`.toLowerCase().includes(q),
  );
  return (
    <div className="st-form">
      <input
        className="st-field"
        autoFocus
        placeholder="Search a model"
        aria-label="Search a model"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {available === null && (
        <p className="st-desc">Asking Google for the list…</p>
      )}
      {available?.length > 0 && (
        <div className="model-head">
          <span className="grow">Model</span>
          <span className="model-when">Released</span>
          <span className="model-price">US$ per million, in / out</span>
        </div>
      )}
      <div className="model-pick">
        {shown.map((model) => (
          <button
            key={model.id}
            className={`model-opt${on.includes(model.id) ? ' on' : ''}`}
            onClick={() => toggle(model.id)}
          >
            <i
              className={`ti ${on.includes(model.id) ? 'ti-square-check' : 'ti-square'}`}
            />
            <span className="grow model-name">
              <b>{model.label}</b>
              {model.label !== model.id && (
                <small className="mono">{model.id}</small>
              )}
            </span>
            <span className="model-when">
              {model.createdAt ? launchedOn(model.createdAt) : '–'}
            </span>
            <span className="model-price">{priceLine(model.price)}</span>
          </button>
        ))}
      </div>
      {available && (
        <p className="st-desc">
          {`${on.length} of ${available.length} turned on. Agents choose among the ones turned on, in their model chip.`}
        </p>
      )}
    </div>
  );
}

/**
 * Settings › AI accounts: where the agents' thinking comes from. Gemini Code
 * works with Gemini through a Gemini API key from Google AI Studio; each key
 * lists the models it opens, and the ones turned on are the ones agents pick.
 */
export function AiAccounts() {
  const [items, setItems] = useState(null);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(null);
  const [picking, setPicking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const reload = () =>
    fetchAiAccounts()
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  useEffect(() => {
    reload();
    fetchAiProviders()
      .then((data) => setProviders(data.items))
      .catch(() => {});
  }, []);
  const gemini = providers.find((item) => item.id === 'google') ?? null;
  const openForm = () => setForm({ name: '', token: '' });
  const add = async () => {
    try {
      const created = await createAiAccount({ ...form, provider: 'google' });
      setForm(null);
      await reload();
      setPicking(created.id);
      notify.success(
        `${created.providerName} turned on`,
        'Now choose the models agents can use.',
      );
    } catch (error) {
      notify.error(error.message);
    }
  };
  const removeModel = async (item, model) => {
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, models: row.models.filter((id) => id !== model) }
          : row,
      ),
    );
    try {
      await setAiAccountModels(
        item.id,
        item.models.filter((id) => id !== model),
      );
    } catch (error) {
      notify.error(error.message);
    }
    reload();
  };
  const remove = async () => {
    setIsRemoving(true);
    try {
      await deleteAiAccount(removing.id);
      notify.success(`${removing.name} removed`);
      setRemoving(null);
      reload();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <SettingsHeader
        title="AI accounts"
        description="Agents think with Gemini through your own Gemini API key. Each key opens a list of models; the ones you turn on are the ones agents can pick. Usage is billed to your Google account, and the free tier is enough to start."
        actions={
          !form && (
            <button className="btn filled sm" onClick={openForm}>
              <i className="ti ti-plus" />
              Add a Gemini API key
            </button>
          )
        }
      />

      {form && (
        <SettingsGroup
          title="New Gemini API key"
          note="Create it in Google AI Studio, then paste it here. It is stored encrypted on the server; agents and the dashboard only see its name."
        >
          <div className="st-form">
            <div className="st-form-row">
              <input
                className="st-field"
                type="password"
                autoFocus
                placeholder={`Key (${gemini?.keyHint ?? 'AIza…'})`}
                aria-label="Gemini API key"
                value={form.token}
                onChange={(event) =>
                  setForm({ ...form, token: event.target.value })
                }
                onKeyDown={(event) =>
                  event.key === 'Enter' && form.token.trim() && add()
                }
              />
              <input
                className="st-field"
                placeholder="Name (optional), like Personal"
                aria-label="Name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="st-form-row">
              <a
                className="st-link grow"
                href={gemini?.keyUrl ?? 'https://aistudio.google.com/apikey'}
                target="_blank"
                rel="noreferrer"
              >
                Get a key in Google AI Studio
              </a>
              <button className="btn outline sm" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button
                className="btn filled sm"
                onClick={add}
                disabled={!form.token.trim()}
              >
                Turn on
              </button>
            </div>
          </div>
        </SettingsGroup>
      )}

      {items === null && <SettingsSkeleton rows={2} />}

      {items?.length === 0 && !form && (
        <Notice icon="ti-key" title="No Gemini API key yet" tone="warn">
          Agents cannot think without one. Add a key from Google AI Studio to
          start.
        </Notice>
      )}

      {(items ?? []).map((item) => (
        <SettingsGroup key={item.id}>
          <SettingsRow
            icon="ti-sparkles"
            title={
              item.name !== item.providerName
                ? `${item.providerName} · ${item.name}`
                : item.providerName
            }
            description={`${money(item.usage?.today)} today · ${money(item.usage?.last30Days)} in 30 days · ${
              item.agents
                ? `${item.agents} ${item.agents === 1 ? 'agent' : 'agents'}`
                : 'no agents yet'
            }`}
          >
            <button
              className="btn outline sm"
              onClick={() => setPicking(picking === item.id ? null : item.id)}
            >
              {picking === item.id ? 'Done' : 'Choose models'}
            </button>
            <button
              className="btn outline sm"
              onClick={() => setRemoving(item)}
              aria-label={`Remove ${item.name}`}
            >
              Remove
            </button>
          </SettingsRow>
          {picking === item.id ? (
            <ModelPicker item={item} onSaved={reload} />
          ) : item.models.length ? (
            <div className="st-chips">
              {item.models.map((model) => (
                <span className="st-chip" key={model}>
                  {model}
                  <button
                    title="Turn off"
                    aria-label={`Turn off ${model}`}
                    onClick={() => removeModel(item, model)}
                  >
                    <i className="ti ti-x" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="st-chips">
              <StateTag status="warn">
                No model turned on: agents cannot see this key yet
              </StateTag>
            </div>
          )}
        </SettingsGroup>
      ))}

      <DeleteModal
        opened={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        target={removing?.name ?? ''}
        context={`AI account · ${removing?.providerName ?? ''}`}
        consequences={[
          `${removing?.agents ? `${removing.agents} ${removing.agents === 1 ? 'agent stops' : 'agents stop'}` : 'Agents using this key stop'} until they get another model in the model chip.`,
          'Its models leave the model chip.',
          "The key is deleted from the server and this can't be undone. To use it again, paste it again.",
        ]}
        confirmLabel="Remove key"
        loading={isRemoving}
      />
    </>
  );
}
