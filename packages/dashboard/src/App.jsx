import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter } from 'react-router-dom';

import { NOTIFICATIONS_PROPS } from './components/zen';
import { Router } from './router';
import { theme } from './theme';

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications {...NOTIFICATIONS_PROPS} />
      <BrowserRouter>
        <Router />
      </BrowserRouter>
    </MantineProvider>
  );
}
