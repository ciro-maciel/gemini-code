import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';

import { cancelTeaching, finishTeaching, startTeaching } from '../services/api';
import { openMicrophone } from '../audio/microphone';
import { LevelBars } from '../agent/Composer';
import { LiveScreen } from './LazyLiveScreen';
import { notify } from './zen';

const clock = (ms) => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Step one: what is being taught. Starting turns the computer on if needed. */
function NameStep({ bot, opened, onClose, onStarted }) {
  const [name, setName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const start = async () => {
    if (!name.trim()) return;
    setIsStarting(true);
    try {
      await startTeaching(bot.id, name.trim());
      onStarted(name.trim());
      setName('');
    } catch (error) {
      notify.error("Couldn't start recording", error.message);
    } finally {
      setIsStarting(false);
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Teach a task" centered>
      <Stack gap={16}>
        <Text fz={14} c="gray.6" lh={1.6}>
          Do the task once on the computer of {bot.name}, como faria no seu. Ele
          grava os passos e, se você quiser, a sua narração, e escreve o
          procedimento para repetir sozinho. Senhas e códigos não são gravados.
        </Text>
        <TextInput
          label="What you'll teach"
          placeholder="Publish the weekly changelog"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Enter' && start()}
          data-autofocus
        />
        <Button onClick={start} loading={isStarting} disabled={!name.trim()}>
          {isStarting ? 'Preparing the computer' : 'Start recording'}
        </Button>
      </Stack>
    </Modal>
  );
}

/** Step two: the computer, the person in control, the recording running. */
function RecordingStep({ bot, name, onDone, isPhone }) {
  const [elapsed, setElapsed] = useState(0);
  const [isNarrating, setIsNarrating] = useState(true);
  const [level, setLevel] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const micRef = useRef(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(
      () => setElapsed(Date.now() - startedAt.current),
      500,
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isNarrating) return;
    let mic = null;
    let isOpen = true;
    openMicrophone({ onLevel: setLevel })
      .then((opened) => {
        if (!isOpen) return opened.close();
        mic = opened;
        micRef.current = opened;
      })
      .catch(() => {
        notify.info(
          'No microphone',
          'Recording continues with on-screen steps only.',
        );
        setIsNarrating(false);
      });
    return () => {
      isOpen = false;
      // Turning the narration off keeps what was said so far.
      if (mic)
        micRef.current = {
          ...mic,
          isClosed: true,
          recording: mic.takeRecording(),
        };
      mic?.close();
      setLevel(0);
    };
  }, [isNarrating]);

  const finish = async () => {
    setIsFinishing(true);
    const mic = micRef.current;
    const narration = mic?.isClosed
      ? mic.recording
      : mic?.hasSpoken()
        ? mic.takeRecording()
        : null;
    if (mic && !mic.isClosed) mic.close();
    try {
      const skill = await finishTeaching(bot.id, narration);
      notify.success('Skill learned', `${bot.name} now knows: ${skill.name}.`);
      onDone();
    } catch (error) {
      notify.error("Couldn't write the skill", error.message);
      setIsFinishing(false);
    }
  };

  const cancel = async () => {
    micRef.current?.close?.();
    await cancelTeaching(bot.id).catch(() => {});
    onDone();
  };

  return (
    <Stack h="100dvh" gap={0} bg="gray.0">
      <Group
        justify="space-between"
        px={isPhone ? 'md' : 24}
        py={12}
        gap={12}
        bg="white"
        wrap={isPhone ? 'wrap' : 'nowrap'}
        style={{ borderBottom: 'var(--rlg-border)' }}
      >
        <Group gap={12} wrap="nowrap" miw={0}>
          <Box
            w={12}
            h={12}
            bg="red.6"
            className="assistant-pulse"
            style={{ borderRadius: '0', flex: 'none' }}
            aria-hidden
          />
          <Box miw={0}>
            <Text fz={10} fw={800} c="gray.4" tt="uppercase" lts="1.5px">
              Gravando · {clock(elapsed)}
            </Text>
            <Text fz={14} fw={800} c="gray.9" truncate>
              Ensinando {bot.name}: {name}
            </Text>
          </Box>
        </Group>
        <Group gap={12} wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            {isNarrating && <LevelBars level={level} />}
            <Switch
              checked={isNarrating}
              onChange={(event) => setIsNarrating(event.currentTarget.checked)}
              label="Narrar"
              disabled={isFinishing}
            />
          </Group>
          <Button onClick={finish} loading={isFinishing}>
            {isFinishing ? 'Writing the skill' : 'Terminar'}
          </Button>
          <Button variant="default" onClick={cancel} disabled={isFinishing}>
            Cancel
          </Button>
        </Group>
      </Group>
      <Box flex={1} p={isPhone ? 0 : 16} mih={0}>
        <LiveScreen botId={bot.id} isInteractive height="100%" />
      </Box>
    </Stack>
  );
}

/** "Ensinar uma tarefa": the name, then the recording, full screen. */
export function TeachScreen({ bot, opened, onClose, isPhone }) {
  const [name, setName] = useState(null);
  const close = () => {
    setName(null);
    onClose();
  };
  return (
    <>
      <NameStep
        bot={bot}
        opened={opened && !name}
        onClose={close}
        onStarted={setName}
      />
      <Modal
        opened={opened && Boolean(name)}
        onClose={() => {}}
        fullScreen
        padding={0}
        withCloseButton={false}
        closeOnEscape={false}
        transitionProps={{ duration: 0 }}
      >
        {name && (
          <RecordingStep
            bot={bot}
            name={name}
            onDone={close}
            isPhone={isPhone}
          />
        )}
      </Modal>
    </>
  );
}
