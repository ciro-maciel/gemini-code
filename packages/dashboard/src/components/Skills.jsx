import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Collapse,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconPencil,
  IconX,
} from '@tabler/icons-react';

import { deleteSkill, fetchSkills, updateSkill } from '../services/api';
import { RichText } from './RichText';
import { notify } from './zen';

/** Name, when to use, and the steps, as the bot will read them. */
export function SkillModal({ skill, opened, onClose, onSaved }) {
  const [fields, setFields] = useState(skill);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => setFields(skill), [skill]);
  if (!fields) return null;
  const save = async () => {
    setIsSaving(true);
    try {
      const saved = await updateSkill(skill.id, {
        name: fields.name,
        whenToUse: fields.whenToUse,
        steps: fields.steps,
      });
      onSaved?.(saved);
      onClose();
    } catch (error) {
      notify.error("Couldn't save", error.message);
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Skill" size="lg" centered>
      <Stack gap={16}>
        <TextInput
          label="Name"
          value={fields.name}
          onChange={(event) =>
            setFields({ ...fields, name: event.currentTarget.value })
          }
        />
        <TextInput
          label="When to use"
          value={fields.whenToUse}
          onChange={(event) =>
            setFields({ ...fields, whenToUse: event.currentTarget.value })
          }
        />
        <Textarea
          label="Steps"
          description="In Markdown. This is what the agent reads before doing the task."
          autosize
          minRows={8}
          maxRows={20}
          styles={{
            input: {
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 13,
            },
          }}
          value={fields.steps}
          onChange={(event) =>
            setFields({ ...fields, steps: event.currentTarget.value })
          }
        />
        <Button onClick={save} loading={isSaving}>
          Save
        </Button>
      </Stack>
    </Modal>
  );
}

/** The card a taught task leaves in the conversation. */
export function SkillCard({ data }) {
  const [skill, setSkill] = useState({
    id: data.skillId,
    name: data.name,
    whenToUse: data.whenToUse,
    steps: data.steps,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDiscarded, setIsDiscarded] = useState(false);

  if (isDiscarded)
    return (
      <Text fz={12} c="var(--gm-on-surface-variant)">
        Skill “{skill.name}” discarded.
      </Text>
    );

  return (
    <Paper
      p={16}
      bg="var(--gm-surface)"
      maw="88%"
      style={{ border: 'var(--rlg-border)' }}
    >
      <Stack gap={10}>
        <Box>
          <Text fz={12.5} fw={600} c="var(--gm-on-surface-variant)">
            Skill learned
            {data.stepCount ? ` · ${data.stepCount} steps recorded` : ''}
          </Text>
          <Text fz={15} fw={800} c="var(--gm-on-surface)" mt={4}>
            {skill.name}
          </Text>
          <Text fz={13} fw={500} c="var(--gm-on-surface-variant)">
            {skill.whenToUse}
          </Text>
        </Box>
        <UnstyledButton
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
        >
          <Group gap={6}>
            {isOpen ? (
              <IconChevronDown size={14} stroke={1.5} />
            ) : (
              <IconChevronRight size={14} stroke={1.5} />
            )}
            <Text fz={12} fw={700} c="var(--gm-on-surface)">
              {isOpen ? 'Hide steps' : 'View steps'}
            </Text>
          </Group>
        </UnstyledButton>
        <Collapse in={isOpen}>
          <Box p={12} bg="var(--gm-surface-1)">
            <RichText text={skill.steps} color="var(--gm-on-surface)" />
          </Box>
        </Collapse>
        <Group gap={8}>
          <Button size="xs" h={30} onClick={() => setIsEditing(true)}>
            Review
          </Button>
          <Button
            size="xs"
            h={30}
            variant="default"
            onClick={() =>
              deleteSkill(skill.id)
                .then(() => setIsDiscarded(true))
                .catch((error) =>
                  notify.error("Couldn't discard", error.message),
                )
            }
          >
            Discard
          </Button>
        </Group>
      </Stack>
      <SkillModal
        skill={skill}
        opened={isEditing}
        onClose={() => setIsEditing(false)}
        onSaved={setSkill}
      />
    </Paper>
  );
}

/** The skills section of the bot's details. */
export function SkillList({ botId }) {
  const [skills, setSkills] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    fetchSkills(botId)
      .then((data) => setSkills(data.items))
      .catch(() => {});
  }, [botId]);
  useEffect(load, [load]);
  return (
    <Stack gap={8}>
      {skills.length === 0 && (
        <Text fz={12} c="var(--gm-on-surface-variant)">
          None yet. Use + › Teach a task in the chat: do the task once and it
          learns.
        </Text>
      )}
      {skills.map((skill) => (
        <Group key={skill.id} gap={8} wrap="nowrap" align="flex-start">
          <Box flex={1} miw={0}>
            <Text fz={13} fw={700} c="var(--gm-on-surface)">
              {skill.name}
            </Text>
            <Text fz={12} fw={500} c="var(--gm-on-surface-variant)">
              {skill.whenToUse}
            </Text>
          </Box>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={`Edit ${skill.name}`}
            onClick={() => setEditing(skill)}
          >
            <IconPencil size={14} stroke={1.5} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={`Delete ${skill.name}`}
            onClick={() => deleteSkill(skill.id).then(load)}
          >
            <IconX size={14} stroke={1.5} />
          </ActionIcon>
        </Group>
      ))}
      <SkillModal
        skill={editing}
        opened={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </Stack>
  );
}
