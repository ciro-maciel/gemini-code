import { Route, Routes } from 'react-router-dom';

import { RequireSession } from './components/Session';
import { Shell } from './shell/Shell';

export function Router() {
  return (
    <Routes>
      <Route element={<RequireSession />}>
        <Route path="*" element={<Shell />} />
      </Route>
    </Routes>
  );
}
