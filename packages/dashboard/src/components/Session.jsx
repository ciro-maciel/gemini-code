import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Outlet } from 'react-router-dom';
import { Button, Flex, Stack, Text } from '@mantine/core';

import { fetchMe } from '../services/api';
import { AuthLoader, Wordmark } from './zen';

export function SessionLoader() {
  return <AuthLoader name="Gemini Code" label="Connecting to workspace…" />;
}

const AccountContext = createContext(null);

/** The person using Gemini Code, as the server on this machine knows them. */
export const useAccount = () => useContext(AccountContext);

/**
 * Before the product: the server on this machine answers who is using it.
 * When it does not answer, the screen says so and offers to try again,
 * instead of failing every call.
 */
export function RequireSession() {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetchMe()
      .then((me) => {
        setAccount(me);
        setError(null);
      })
      .catch(setError);
  }, []);

  useEffect(load, [load]);

  if (error)
    return (
      <Flex h="100dvh" px="md" justify="center" align="center">
        <Stack gap={16} maw={460} align="center">
          <Wordmark name="Gemini Code" />
          <Text fz={28} fw={600} c="var(--gm-on-surface)" lh={1.2} ta="center">
            {"Couldn't reach Gemini Code"}
          </Text>
          <Text fz={15} c="var(--gm-on-surface-variant)" lh={1.6} ta="center">
            {`${error.message}. Check that it is running on this machine, then try again.`}
          </Text>
          <Button onClick={load}>Try again</Button>
        </Stack>
      </Flex>
    );
  if (!account) return <SessionLoader />;

  return (
    <AccountContext.Provider value={{ ...account, reload: load }}>
      <Outlet />
    </AccountContext.Provider>
  );
}
