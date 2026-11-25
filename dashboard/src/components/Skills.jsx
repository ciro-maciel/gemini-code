import { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Box, Button, Collapse, Group, Modal, Paper, Stack, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconPencil, IconX } from '@tabler/icons-react'

import { deleteSkill, fetchSkills, updateSkill } from '../services/api'
import { RichText } from './RichText'
import { notify } from './zen'

/** Name, when to use, and the steps, as the bot will read them. */
export function SkillModal({ skill, opened, onClose, onSaved }) {
    const [fields, setFields] = useState(skill)
    const [isSaving, setIsSaving] = useState(false)
    useEffect(() => setFields(skill), [skill])
    if (!fields) return null
    const save = async () => {
        setIsSaving(true)
        try {
            const saved = await updateSkill(skill.id, { name: fields.name, whenToUse: fields.whenToUse, steps: fields.steps })
            onSaved?.(saved)
            onClose()
        } catch (error) {
            notify.error('Não consegui salvar', error.message)
        } finally {
            setIsSaving(false)
        }
    }
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Habilidade"
            size="lg"
            centered
        >
            <Stack gap={16}>
                <TextInput
                    label="Nome"
                    value={fields.name}
                    onChange={event => setFields({ ...fields, name: event.currentTarget.value })}
                />
                <TextInput
                    label="Quando usar"
                    value={fields.whenToUse}
                    onChange={event => setFields({ ...fields, whenToUse: event.currentTarget.value })}
                />
                <Textarea
                    label="Passos"
                    description="Em Markdown. É isso que o bot lê antes de fazer a tarefa."
                    autosize
                    minRows={8}
                    maxRows={20}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13 } }}
                    value={fields.steps}
                    onChange={event => setFields({ ...fields, steps: event.currentTarget.value })}
                />
                <Button
                    onClick={save}
                    loading={isSaving}
                >
                    Salvar
                </Button>
            </Stack>
        </Modal>
    )
}

/** The card a taught task leaves in the conversation. */
export function SkillCard({ data }) {
    const [skill, setSkill] = useState({ id: data.skillId, name: data.name, whenToUse: data.whenToUse, steps: data.steps })
    const [isOpen, setIsOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [isDiscarded, setIsDiscarded] = useState(false)

    if (isDiscarded)
        return (
            <Text
                fz={12}
                c="gray.5"
            >
                Habilidade “{skill.name}” descartada.
            </Text>
        )

    return (
        <Paper
            p={16}
            bg="white"
            maw="88%"
            style={{ border: 'var(--rlg-border)' }}
        >
            <Stack gap={10}>
                <Box>
                    <Text
                        fz={10}
                        fw={800}
                        c="gray.4"
                        tt="uppercase"
                        lts="1.5px"
                    >
                        Habilidade aprendida{data.stepCount ? ` · ${data.stepCount} passos gravados` : ''}
                    </Text>
                    <Text
                        fz={15}
                        fw={800}
                        c="gray.9"
                        mt={4}
                    >
                        {skill.name}
                    </Text>
                    <Text
                        fz={13}
                        fw={500}
                        c="gray.6"
                    >
                        {skill.whenToUse}
                    </Text>
                </Box>
                <UnstyledButton
                    onClick={() => setIsOpen(value => !value)}
                    aria-expanded={isOpen}
                >
                    <Group gap={6}>
                        {isOpen ? (
                            <IconChevronDown
                                size={14}
                                stroke={1.5}
                            />
                        ) : (
                            <IconChevronRight
                                size={14}
                                stroke={1.5}
                            />
                        )}
                        <Text
                            fz={12}
                            fw={700}
                            c="gray.7"
                        >
                            {isOpen ? 'Esconder os passos' : 'Ver os passos'}
                        </Text>
                    </Group>
                </UnstyledButton>
                <Collapse in={isOpen}>
                    <Box
                        p={12}
                        bg="gray.0"
                    >
                        <RichText
                            text={skill.steps}
                            color="gray.7"
                        />
                    </Box>
                </Collapse>
                <Group gap={8}>
                    <Button
                        size="xs"
                        h={30}
                        onClick={() => setIsEditing(true)}
                    >
                        Revisar
                    </Button>
                    <Button
                        size="xs"
                        h={30}
                        variant="default"
                        onClick={() =>
                            deleteSkill(skill.id)
                                .then(() => setIsDiscarded(true))
                                .catch(error => notify.error('Não consegui descartar', error.message))
                        }
                    >
                        Descartar
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
    )
}

/** The skills section of the bot's details. */
export function SkillList({ botId }) {
    const [skills, setSkills] = useState([])
    const [editing, setEditing] = useState(null)
    const load = useCallback(() => {
        fetchSkills(botId)
            .then(data => setSkills(data.items))
            .catch(() => {})
    }, [botId])
    useEffect(load, [load])
    return (
        <Stack gap={8}>
            {skills.length === 0 && (
                <Text
                    fz={12}
                    c="gray.5"
                >
                    Nenhuma ainda. Use + › Ensinar uma tarefa na conversa: faça a tarefa uma vez e ele aprende.
                </Text>
            )}
            {skills.map(skill => (
                <Group
                    key={skill.id}
                    gap={8}
                    wrap="nowrap"
                    align="flex-start"
                >
                    <Box
                        flex={1}
                        miw={0}
                    >
                        <Text
                            fz={13}
                            fw={700}
                            c="gray.9"
                        >
                            {skill.name}
                        </Text>
                        <Text
                            fz={12}
                            fw={500}
                            c="gray.6"
                        >
                            {skill.whenToUse}
                        </Text>
                    </Box>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label={`Editar ${skill.name}`}
                        onClick={() => setEditing(skill)}
                    >
                        <IconPencil
                            size={14}
                            stroke={1.5}
                        />
                    </ActionIcon>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label={`Apagar ${skill.name}`}
                        onClick={() => deleteSkill(skill.id).then(load)}
                    >
                        <IconX
                            size={14}
                            stroke={1.5}
                        />
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
    )
}
