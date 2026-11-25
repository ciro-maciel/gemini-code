import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCheck, IconCopy, IconX } from '@tabler/icons-react';

import {
  createSecret,
  deleteSecret,
  fetchInbox,
  fetchSecrets,
  rotateInbox,
  updateSecret,
} from '../services/api';
import { formatWhen } from '../labels';
import { notify } from './zen';

/**
 * The bot's door (23/10/2026): one address another system posts to, and what
 * arrives becomes a message in this conversation. The address is the key, so
 * it is copied from here and changed here when it leaks.
 */
export function InboxDoor({ botId }) {
  const [inbox, setInbox] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  useEffect(() => {
    fetchInbox(botId)
      .then(setInbox)
      .catch(() => setInbox(null));
  }, [botId]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inbox.url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      notify.error("Couldn't copy. Select the address and copy it.");
    }
  };
  const rotate = async () => {
    setIsRotating(true);
    try {
      setInbox(await rotateInbox(botId));
      notify.success(
        'Address changed',
        'The old one no longer receives anything. Put the new one in the other system.',
      );
      setIsAsking(false);
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsRotating(false);
    }
  };
  if (!inbox) return null;
  return (
    <Stack gap={8}>
      <Text fz={12} c="gray.6">
        Another system sends to this address (a POST with text or JSON), and
        what arrives becomes a message in this chat. In the bot’s instructions,
        say what to do with incoming messages.
      </Text>
      <Group gap={6} wrap="nowrap">
        <TextInput
          flex={1}
          size="xs"
          radius={0}
          readOnly
          value={inbox.url}
          aria-label="Entry point address"
          onFocus={(event) => event.currentTarget.select()}
          styles={{
            input: { fontFamily: 'var(--mantine-font-family-monospace)' },
          }}
        />
        <ActionIcon
          size={30}
          variant="default"
          radius={0}
          aria-label="Copy the address"
          onClick={copy}
        >
          {isCopied ? (
            <IconCheck size={14} stroke={1.5} />
          ) : (
            <IconCopy size={14} stroke={1.5} />
          )}
        </ActionIcon>
      </Group>
      <Group justify="space-between">
        <Text fz={12} c="gray.5">
          Anyone with the address can send. Since {formatWhen(inbox.createdAt)}.
        </Text>
        <Button
          size="xs"
          radius={0}
          variant="subtle"
          color="gray"
          onClick={() => setIsAsking(true)}
        >
          Change address
        </Button>
      </Group>
      <Modal
        opened={isAsking}
        onClose={() => setIsAsking(false)}
        size="sm"
        title={
          <Text fz={16} fw={800} c="gray.9">
            Change address
          </Text>
        }
      >
        <Text fz={13} c="gray.7" mb="md">
          The current address stops receiving immediately. Anyone sending to it
          needs the new one.
        </Text>
        <Group justify="flex-end">
          <Button loading={isRotating} onClick={rotate}>
            Change
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}

const NAME = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * The bot's vault: keys for its terminal, by name. A value goes in and never
 * comes back to the panel, the conversation or the model.
 */
export function Vault({ botId }) {
  const [secrets, setSecrets] = useState([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const load = useCallback(() => {
    fetchSecrets(botId)
      .then((data) => setSecrets(data.items))
      .catch(() => {});
  }, [botId]);
  useEffect(load, [load]);
  const isNameValid = NAME.test(name);
  const save = async () => {
    setIsSaving(true);
    try {
      // A name already in the vault changes that secret's value, by its id.
      const existing = secrets.find((secret) => secret.name === name);
      if (existing) await updateSecret(botId, existing.id, value);
      else await createSecret(botId, name, value);
      notify.success(
        `${name} saved to vault`,
        'The bot uses it by name; the value is no longer shown.',
      );
      setName('');
      setValue('');
      load();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };
  const remove = async (secretId) => {
    try {
      await deleteSecret(botId, secretId);
      load();
    } catch (error) {
      notify.error(error.message);
    }
  };
  return (
    <Stack gap={8}>
      <Text fz={12} c="gray.6">
        Chaves para o terminal do bot, como GITHUB_TOKEN ou
        CLAUDE_CODE_OAUTH_TOKEN. Ele as usa pelo nome; o valor nunca volta para
        a tela, para a conversa nem para o modelo.
      </Text>
      {secrets.length === 0 && (
        <Text fz={12} c="gray.5">
          No keys yet.
        </Text>
      )}
      {secrets.map((secret) => (
        <Group key={secret.id} gap={8} wrap="nowrap">
          <Box flex={1} miw={0}>
            <Text fz={12} ff="monospace" c="gray.9" truncate>
              {secret.name}
            </Text>
            <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px">
              Guardada {formatWhen(secret.updatedAt)}
            </Text>
          </Box>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            radius={0}
            aria-label={`Remove ${secret.name} from vault`}
            onClick={() => remove(secret.id)}
          >
            <IconX size={14} stroke={1.5} />
          </ActionIcon>
        </Group>
      ))}
      <TextInput
        size="xs"
        radius={0}
        placeholder="NOME_DA_CHAVE"
        aria-label="Key name"
        value={name}
        onChange={(event) =>
          setName(
            event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          )
        }
        error={
          name && !isNameValid
            ? 'Start with a letter; only letters, numbers, and _'
            : null
        }
        styles={{
          input: { fontFamily: 'var(--mantine-font-family-monospace)' },
        }}
      />
      <Group gap={6} wrap="nowrap">
        <PasswordInput
          flex={1}
          size="xs"
          radius={0}
          placeholder="Valor"
          aria-label="Key value"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        <Button
          size="xs"
          radius={0}
          variant="default"
          disabled={!isNameValid || !value.trim()}
          loading={isSaving}
          onClick={save}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
