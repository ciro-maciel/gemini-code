import { Route, Routes } from 'react-router-dom';

import { GuestOnly } from './auth/AuthContext';
import { RequireSession, SessionLoader } from './components/Session';
import { Shell } from './shell/Shell';
import { SignIn } from './pages/SignIn';

export function Router() {
  return (
    <Routes>
      <Route
        path="/auth/signin"
        element={
          <GuestOnly fallback={<SessionLoader />}>
            <SignIn />
          </GuestOnly>
        }
      />
      <Route element={<RequireSession />}>
        <Route path="*" element={<Shell />} />
      </Route>
    </Routes>
  );
}
