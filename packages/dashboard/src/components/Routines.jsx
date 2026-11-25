import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconClock, IconDots, IconPlus, IconTrash } from '@tabler/icons-react';

import {
  createRoutine,
  deleteRoutine,
  fetchRoutines,
  updateRoutine,
} from '../services/api';
import { notify } from './zen';
import { keepIfSame } from '../state/keep-if-same';

const REPEAT_OPTIONS = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Business day' },
  { value: 'weekly', label: 'Every week' },
];

const WEEKDAYS = [
  'Domingo',
  'Segunda',
  'Tuesday',
  'Quarta',
  'Quinta',
  'Sexta',
  'Saturday',
];

function tomorrowAt() {
  const date = new Date(Date.now() + 86_400_000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A routine by hand: what to do and when. The bot also creates them from the conversation. */
function NewRoutineModal({ opened, onClose, botId, onCreated }) {
  const [name, setName] = useState('');
  const [instruction, setInstruction] = useState('');
  const [repeat, setRepeat] = useState('once');
  const [date, setDate] = useState(tomorrowAt());
  const [time, setTime] = useState('06:00');
  const [weekday, setWeekday] = useState('1');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName('');
    setInstruction('');
    setRepeat('once');
    setDate(tomorrowAt());
    setTime('06:00');
  }, [opened]);

  const submit = async (event) => {
    event.preventDefault();
    const [hour, minute] = time.split(':').map(Number);
    const cron = {
      daily: `${minute} ${hour} * * *`,
      weekdays: `${minute} ${hour} * * 1-5`,
      weekly: `${minute} ${hour} * * ${weekday}`,
    }[repeat];
    setIsSaving(true);
    try {
      await createRoutine(botId, {
        name,
        instruction,
        ...(repeat === 'once' ? { at: `${date}T${time}` } : { cron }),
      });
      notify.success('Routine created');
      onCreated();
      onClose();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fz={16} fw={800} c="var(--gm-on-surface)">
          New routine
        </Text>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            data-autofocus
            label="Nome"
            placeholder="E.g.: Email summary"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Textarea
            label="What to do"
            description="Write it as a complete request: when the time comes, it acts without asking. Anything that needs approval waits for you."
            placeholder="E.g.: Read my emails from the last 24 hours and send me a summary of what needs a reply"
            autosize
            minRows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
          <Box>
            <Text fz={13} fw={700} mb={6}>
              When
            </Text>
            <SegmentedControl
              fullWidth
              data={REPEAT_OPTIONS}
              value={repeat}
              onChange={setRepeat}
              mb={10}
            />
            <Group gap={8} grow>
              {repeat === 'once' && (
                <TextInput
                  type="date"
                  aria-label="Dia"
                  value={date}
                  onChange={(event) => setDate(event.currentTarget.value)}
                />
              )}
              {repeat === 'weekly' && (
                <Select
                  aria-label="Day of the week"
                  data={WEEKDAYS.map((label, index) => ({
                    value: String(index),
                    label,
                  }))}
                  value={weekday}
                  onChange={(value) => value && setWeekday(value)}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                />
              )}
              <TextInput
                type="time"
                aria-label="Hora"
                value={time}
                onChange={(event) => setTime(event.currentTarget.value)}
              />
            </Group>
            <Text fz={12} fw={500} c="var(--gm-on-surface-variant)" mt={6}>
              Brasília time.
            </Text>
          </Box>
          <Group justify="flex-end">
            <Button
              type="submit"
              loading={isSaving}
              disabled={!name.trim() || !instruction.trim() || !time}
            >
              Create routine
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function RoutineRow({ routine, onChange }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const toggle = async (isEnabled) => {
    try {
      await updateRoutine(routine.id, { isEnabled });
      onChange();
    } catch (error) {
      notify.error(error.message);
    }
  };
  const remove = async () => {
    try {
      await deleteRoutine(routine.id);
      onChange();
    } catch (error) {
      notify.error(error.message);
    }
  };
  const isOnceAndDone =
    !routine.cron && !routine.isEnabled && routine.runCount > 0;
  return (
    <Group
      gap={10}
      wrap="nowrap"
      align="flex-start"
      py={10}
      style={{ borderBottom: 'var(--rlg-border)' }}
    >
      <IconClock
        size={16}
        stroke={1.5}
        color="var(--mantine-color-gray-5)"
        style={{ flex: 'none', marginTop: 2 }}
      />
      <Box flex={1} miw={0}>
        <Text fz={13} fw={700} c="var(--gm-on-surface)" lineClamp={1}>
          {routine.name}
        </Text>
        <Text fz={12} fw={500} c="var(--gm-on-surface-variant)" lineClamp={2}>
          {routine.scheduleLabel}
          {routine.isEnabled && routine.nextRunLabel && routine.cron
            ? `· next ${routine.nextRunLabel}`
            : ''}
          {isOnceAndDone ? '· already ran' : ''}
        </Text>
      </Box>
      {!isOnceAndDone && (
        <Switch
          size="sm"
          checked={routine.isEnabled}
          onChange={(event) => toggle(event.currentTarget.checked)}
          aria-label={routine.isEnabled ? 'Pause routine' : 'Turn on routine'}
        />
      )}
      <Menu
        position="bottom-end"
        width={220}
        closeOnItemClick={false}
        onClose={() => setIsConfirming(false)}
      >
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            size={24}
            aria-label={`Routine options for ${routine.name}`}
          >
            <IconDots size={14} stroke={1.5} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Does</Menu.Label>
          <Text
            fz={12}
            fw={500}
            c="var(--gm-on-surface-variant)"
            px={12}
            pb={8}
            lineClamp={5}
          >
            {routine.instruction}
          </Text>
          <Menu.Divider />
          <Menu.Item
            color="red.6"
            className="rlg-danger"
            leftSection={<IconTrash size={14} stroke={1.5} />}
            onClick={() => (isConfirming ? remove() : setIsConfirming(true))}
          >
            {isConfirming ? 'Click again to delete' : 'Delete routine'}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

/** The bot's routines, in its details panel — Grok Bot's "Rotinas". */
export function Routines({ botId }) {
  const [routines, setRoutines] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const load = useCallback(() => {
    fetchRoutines(botId)
      .then((data) => setRoutines(keepIfSame(data.items)))
      .catch(() => setRoutines((current) => current ?? []));
  }, [botId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <Stack gap={0}>
      {routines?.length === 0 && (
        <Text
          fz={12}
          fw={500}
          c="var(--gm-on-surface-variant)"
          lh={1.5}
          mb={10}
        >
          None yet. Ask in the conversation (“tomorrow at 6am, send me a summary
          of my e-mails”) or create one here.
        </Text>
      )}
      {(routines ?? []).map((routine) => (
        <RoutineRow key={routine.id} routine={routine} onChange={load} />
      ))}
      <Group mt={12}>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconPlus size={14} stroke={1.5} />}
          onClick={() => setIsCreating(true)}
        >
          New routine
        </Button>
      </Group>
      <NewRoutineModal
        opened={isCreating}
        onClose={() => setIsCreating(false)}
        botId={botId}
        onCreated={load}
      />
    </Stack>
  );
}
