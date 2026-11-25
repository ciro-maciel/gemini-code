import { useNavigate } from 'react-router-dom';

import { useAccount } from '../components/Session';
import { Diagnostics } from '../components/Diagnostics';
import { LanguageSettings } from '../components/LanguageSettings';
import { AiAccounts } from './settings/AiAccounts';
import { MyChrome, Notifications, Security } from './settings/AccountSections';
import { AgentSafety, Dictation, Projects } from './settings/AgentSections';

// The sections, grouped by what they are about: the agents, this app, help. Each is built from the kit in
// settings/kit.jsx and follows docs/settings.md.
const NAV = [
  [
    'Agents',
    [
      ['accounts', 'AI accounts', 'ti-sparkles', AiAccounts],
      ['projects', 'Projects', 'ti-folders', Projects],
      ['chrome', 'My Chrome', 'ti-brand-chrome', MyChrome],
      ['dictation', 'Dictation', 'ti-microphone', Dictation],
      ['safety', 'Agent safety', 'ti-scale', AgentSafety],
    ],
  ],
  [
    'This app',
    [
      ['language', 'Language · Idioma', 'ti-language', LanguageSettings],
      ['notifications', 'Notifications', 'ti-bell', Notifications],
      ['security', 'Security', 'ti-shield-lock', Security],
    ],
  ],
  ['Help', [['diagnostics', 'Diagnostics', 'ti-stethoscope', Diagnostics]]],
];

const SECTIONS = NAV.flatMap(([, items]) => items);

/** Settings: the sections on the left, the chosen one on the right. */
export function SettingsPage({ section }) {
  const account = useAccount();
  const navigate = useNavigate();
  const nav = NAV;
  const Section =
    SECTIONS.find(([id]) => id === section)?.[3] ?? SECTIONS[0][3];
  return (
    <main className="page">
      <div className="page-in">
        <div className="settings">
          <nav className="subnav st-nav" aria-label="Settings">
            <h1>Settings</h1>
            {nav.map(([group, items]) => [
              <div className="label" key={group}>
                {group}
              </div>,
              ...items.map(([id, label, icon]) => (
                <button
                  key={id}
                  className={section === id ? 'on' : ''}
                  aria-current={section === id ? 'page' : undefined}
                  onClick={() => navigate(`/settings/${id}`)}
                  data-no-translate={id === 'language' ? '' : undefined}
                >
                  <i className={`ti ${icon}`} aria-hidden="true" />
                  {label}
                </button>
              )),
            ])}
          </nav>
          <div className="grow">
            <Section account={account} />
          </div>
        </div>
      </div>
    </main>
  );
}
