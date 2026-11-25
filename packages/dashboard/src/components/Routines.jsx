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
  { value: 'once', label: 'Uma vez' },
  { value: 'daily', label: 'Todo dia' },
  { value: 'weekdays', label: 'Dia útil' },
  { value: 'weekly', label: 'Toda semana' },
];

const WEEKDAYS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
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
      notify.success('Rotina criada');
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
        <Text fz={16} fw={800} c="gray.9">
          Nova rotina
        </Text>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            data-autofocus
            label="Nome"
            placeholder="Ex.: Resumo dos e-mails"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Textarea
            label="O que fazer"
            description="Escreva como um pedido completo: na hora, ele faz sem perguntar. O que precisar de aprovação espera por você."
            placeholder="Ex.: Leia meus e-mails das últimas 24 horas e me mande um resumo do que precisa de resposta"
            autosize
            minRows={3}
            value={instruction}
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
          <Box>
            <Text fz={13} fw={700} mb={6}>
              Quando
            </Text>
            <SegmentedControl
              fullWidth
              radius={0}
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
                  aria-label="Dia da semana"
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
            <Text fz={12} fw={500} c="gray.5" mt={6}>
              Horário de Brasília.
            </Text>
          </Box>
          <Group justify="flex-end">
            <Button
              type="submit"
              loading={isSaving}
              disabled={!name.trim() || !instruction.trim() || !time}
            >
              Criar rotina
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
        <Text fz={13} fw={700} c="gray.9" lineClamp={1}>
          {routine.name}
        </Text>
        <Text fz={12} fw={500} c="gray.5" lineClamp={2}>
          {routine.scheduleLabel}
          {routine.isEnabled && routine.nextRunLabel && routine.cron
            ? ` · próxima ${routine.nextRunLabel}`
            : ''}
          {isOnceAndDone ? ' · já executou' : ''}
        </Text>
      </Box>
      {!isOnceAndDone && (
        <Switch
          size="sm"
          color="gray.9"
          checked={routine.isEnabled}
          onChange={(event) => toggle(event.currentTarget.checked)}
          aria-label={routine.isEnabled ? 'Pausar rotina' : 'Ligar rotina'}
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
            aria-label={`Opções da rotina ${routine.name}`}
          >
            <IconDots size={14} stroke={1.5} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Faz</Menu.Label>
          <Text fz={12} fw={500} c="gray.6" px={12} pb={8} lineClamp={5}>
            {routine.instruction}
          </Text>
          <Menu.Divider />
          <Menu.Item
            color="red.6"
            className="rlg-danger"
            leftSection={<IconTrash size={14} stroke={1.5} />}
            onClick={() => (isConfirming ? remove() : setIsConfirming(true))}
          >
            {isConfirming ? 'Clique de novo para excluir' : 'Excluir rotina'}
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
        <Text fz={12} fw={500} c="gray.5" lh={1.5} mb={10}>
          Nenhuma ainda. Peça na conversa ("amanhã às 6h, me mande um resumo dos
          e-mails") ou crie aqui.
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
          Nova rotina
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
