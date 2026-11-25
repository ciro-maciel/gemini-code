import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Button, Flex, Stack, Text } from '@mantine/core';
import { useAuth, useSignOut } from '../auth/AuthContext';

import { fetchMe, onUnauthorized } from '../services/api';
import { AuthLoader, Wordmark } from './zen';
import { WaitingRoom } from './WaitingRoom';

export function SessionLoader() {
  return <AuthLoader name="Gemini Code" label="Connecting to workspace…" />;
}

/** A redirect with the session screen under it, so no blank frame shows. */
export function RedirectWithLoader({ to }) {
  return (
    <>
      <Navigate to={to} replace />
      <SessionLoader />
    </>
  );
}

export function RequireSession() {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoader />;
  if (!user) return <RedirectWithLoader to="/auth/signin" />;
  return <AccessGate />;
}

const AccountContext = createContext(null);

/** The signed-in account as the control server sees it: status, owner, limits. */
export const useAccount = () => useContext(AccountContext);

function Notice({ title, text, onSignOut }) {
  return (
    <Flex h="100dvh" px="md" justify="center" align="center">
      <Stack gap={16} maw={460} align="center">
        <Wordmark name="Gemini Code" />
        <Text
          fz={32}
          fw={900}
          c="var(--gm-on-surface)"
          lh={1.1}
          lts="-0.04em"
          ta="center"
        >
          {title}
        </Text>
        <Text
          fz={15}
          fw={500}
          c="var(--gm-on-surface-variant)"
          lh={1.6}
          ta="center"
        >
          {text}
        </Text>
        <Button variant="default" onClick={onSignOut}>
          Sign out
        </Button>
      </Stack>
    </Flex>
  );
}

/**
 * Between the session and the product: the control server decides whether
 * this account may use it yet. A new account waits until the owner lets it
 * in (Pessoas), and the screen says so instead of failing every call.
 */
function AccessGate() {
  const signOut = useSignOut();
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {}
  }, [signOut]);

  const load = useCallback(() => {
    fetchMe()
      .then((me) => {
        setAccount(me);
        setError(null);
      })
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
    return onUnauthorized(handleSignOut);
  }, [load, handleSignOut]);

  // A pending account checks again every half minute, and whenever the tab
  // comes back into view: the owner's "Liberar" opens the product without a
  // reload.
  useEffect(() => {
    if (account?.status !== 'pending') return;
    const timer = setInterval(load, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [account?.status, load]);

  if (error?.code === 'ACCESS_BLOCKED')
    return (
      <Notice
        title="No access"
        text="This account doesn't have access to Gemini Code. If this is a mistake, contact whoever invited you."
        onSignOut={handleSignOut}
      />
    );
  if (error)
    return (
      <Notice
        title="Couldn't reach Gemini Code"
        text={`${error.message}. Try again in a moment.`}
        onSignOut={handleSignOut}
      />
    );
  if (!account) return <SessionLoader />;
  // Invited into someone's agent while still waiting: the shared agents open.
  if (account.status === 'pending' && !account.isGuest)
    return (
      <WaitingRoom
        account={account}
        onSaved={setAccount}
        onSignOut={handleSignOut}
      />
    );

  return (
    <AccountContext.Provider value={{ ...account, reload: load }}>
      <Outlet />
    </AccountContext.Provider>
  );
}
