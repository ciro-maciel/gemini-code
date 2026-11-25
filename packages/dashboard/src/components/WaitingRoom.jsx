import { useState } from 'react'
import { Box, Button, Flex, Group, Stack, Text, Textarea, UnstyledButton } from '@mantine/core'

import { saveFirstWish } from '../services/api'
import { AI_EXAMPLES } from '../labels'

const WISH_MAX = 1000

/** One step of the way in: done, the one happening now, or still ahead. */
function Step({ state, title, text, isLast }) {
    return (
        <Group
            gap={16}
            align="flex-start"
            wrap="nowrap"
        >
            <Stack
                gap={0}
                align="center"
                pt={6}
                style={{ alignSelf: 'stretch' }}
            >
                <Box
                    w={10}
                    h={10}
                    bg={state === 'done' ? 'gray.9' : state === 'now' ? 'gray.0' : 'gray.2'}
                    bd={state === 'now' ? '2px solid var(--mantine-color-gray-9)' : undefined}
                    style={{ flexShrink: 0 }}
                />
                {!isLast && (
                    <Box
                        w={1}
                        bg="gray.2"
                        style={{ flex: 1 }}
                        mt={6}
                    />
                )}
            </Stack>
            <Box
                pb={isLast ? 0 : 20}
                miw={0}
            >
                <Text
                    fz={14}
                    fw={state === 'later' ? 500 : 800}
                    c={state === 'later' ? 'gray.5' : 'gray.9'}
                >
                    {title}
                </Text>
                <Text
                    fz={13}
                    fw={500}
                    c="gray.6"
                    lh={1.5}
                >
                    {text}
                </Text>
            </Box>
        </Group>
    )
}

function queueLine(queue) {
    if (!queue) return 'Você está na fila. As entradas são liberadas uma a uma.'
    if (queue.position === 1) return 'Você é a próxima pessoa da fila.'
    return `Você é a ${queue.position}ª pessoa da fila. As entradas são liberadas uma a uma.`
}

/**
 * The screen of an account still waiting to be let in. Not a wall: the person
 * says what the first bot should do, and that bot is designed the moment the
 * owner lets the account in, so the product opens onto work already under way.
 */
export function WaitingRoom({ account, onSaved, onSignOut }) {
    const [wish, setWish] = useState(account.firstWish || '')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState(null)
    const saved = account.firstWish || ''
    const isDirty = wish.trim() !== saved

    const save = async () => {
        setIsSaving(true)
        setError(null)
        try {
            onSaved(await saveFirstWish(wish))
        } catch (failure) {
            setError(failure.message)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Flex
            mih="100dvh"
            px="md"
            py={64}
            justify="center"
            align="center"
        >
            <Stack
                gap={40}
                w="100%"
                maw={520}
            >
                <Stack gap={10}>
                    <Text
                        fz={10}
                        fw={800}
                        c="gray.4"
                        tt="uppercase"
                        lts="1.5px"
                    >
                        Assistant · Lista de espera
                    </Text>
                    <Text
                        component="h1"
                        m={0}
                        fz="clamp(2rem, 5vw + 1rem, 2.75rem)"
                        fw={900}
                        c="gray.9"
                        lh={1.1}
                        lts="-0.04em"
                    >
                        Seu acesso está a caminho
                    </Text>
                    <Text
                        fz={16}
                        fw={500}
                        c="gray.6"
                        lh={1.7}
                    >
                        Cada bot ganha um computador próprio na nuvem. Enquanto a sua entrada não sai, conte o que o seu primeiro bot vai fazer: ele já começa montado.
                    </Text>
                </Stack>

                <Stack gap={0}>
                    <Step
                        state="done"
                        title="Conta criada"
                        text={account.email}
                    />
                    <Step
                        state="now"
                        title="Liberação"
                        text={queueLine(account.queue)}
                    />
                    <Step
                        state="later"
                        title="O seu primeiro bot"
                        text={saved ? 'Montado com o seu pedido assim que a entrada sair. Ele conecta o que precisar e faz o trabalho uma vez.' : 'Escreva o pedido abaixo e ele é montado assim que a entrada sair.'}
                        isLast
                    />
                </Stack>

                <Stack gap={12}>
                    <Textarea
                        label="O que o seu primeiro bot deve fazer"
                        placeholder={AI_EXAMPLES[0]}
                        autosize
                        minRows={3}
                        maxRows={8}
                        maxLength={WISH_MAX}
                        value={wish}
                        onChange={event => setWish(event.currentTarget.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && isDirty) save()
                        }}
                        error={error}
                    />
                    {!wish.trim() && (
                        <Stack gap={6}>
                            {AI_EXAMPLES.map(example => (
                                <UnstyledButton
                                    key={example}
                                    onClick={() => setWish(example)}
                                >
                                    <Text
                                        fz={12}
                                        fw={500}
                                        c="gray.5"
                                    >
                                        “{example}”
                                    </Text>
                                </UnstyledButton>
                            ))}
                        </Stack>
                    )}
                    <Group
                        justify="space-between"
                        gap={12}
                    >
                        <Text
                            fz={12}
                            fw={500}
                            c="gray.5"
                        >
                            {saved && !isDirty ? 'Pedido guardado. Dá para mudar até a entrada sair.' : 'Você pode mudar o pedido até a entrada sair.'}
                        </Text>
                        <Button
                            onClick={save}
                            loading={isSaving}
                            disabled={!isDirty}
                        >
                            {saved ? 'Atualizar pedido' : 'Guardar pedido'}
                        </Button>
                    </Group>
                </Stack>

                <Group
                    justify="space-between"
                    gap={12}
                    pt={20}
                    style={{ borderTop: 'var(--rlg-border)' }}
                >
                    <Text
                        fz={13}
                        fw={500}
                        c="gray.6"
                        truncate
                        miw={0}
                    >
                        Entrou como <strong>{account.email}</strong>
                    </Text>
                    <Button
                        variant="default"
                        size="xs"
                        onClick={onSignOut}
                    >
                        Trocar de conta
                    </Button>
                </Group>
            </Stack>
        </Flex>
    )
}
