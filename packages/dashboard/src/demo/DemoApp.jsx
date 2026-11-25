import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from '../auth/AuthContext';
import { NOTIFICATIONS_PROPS } from '../components/zen';
import { Router } from '../router';
import { theme } from '../theme';
import { REPO_URL } from './fixtures';

// The app as App.jsx builds it, under the address it is published at
// (/gemini-code/ on GitHub Pages), with the demo's banner on top.
const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

export function DemoBanner() {
  return (
    <div className="demo-banner" role="note" data-no-translate>
      <span>Demo with example data. To use it for real:</span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
        github.com/ciro-maciel/gemini-code
      </a>
    </div>
  );
}

export default function DemoApp() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications {...NOTIFICATIONS_PROPS} />
      <DemoBanner />
      <AuthProvider>
        <BrowserRouter basename={BASENAME}>
          <Router />
        </BrowserRouter>
      </AuthProvider>
    </MantineProvider>
  );
}
