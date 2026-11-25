import { useState } from 'react'
import { Box, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { getHotkeyHandler } from '@mantine/hooks'

import { BotAvatar } from './BotAvatar'
import { LiveScreen } from './LazyLiveScreen'

/** Take over: the agent's computer, full screen, with the way back to the agent. */
export function TakeoverScreen({ bot, opened, onClose, onReturn, isPhone }) {
    const [note, setNote] = useState('')
    const giveBack = () => {
        onReturn(note.trim())
        setNote('')
    }
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            fullScreen
            padding={0}
            withCloseButton={false}
            transitionProps={{ duration: 0 }}
        >
            <Stack
                h="100dvh"
                gap={0}
                bg="gray.0"
            >
                <Group
                    justify="space-between"
                    px={isPhone ? 'md' : 24}
                    py={12}
                    gap={12}
                    bg="white"
                    wrap={isPhone ? 'wrap' : 'nowrap'}
                    style={{ borderBottom: 'var(--rlg-border)' }}
                >
                    <Group
                        gap={12}
                        wrap="nowrap"
                        miw={0}
                    >
                        <BotAvatar
                            bot={bot}
                            size={32}
                        />
                        <Box miw={0}>
                            <Text
                                fz={10}
                                fw={800}
                                c="gray.4"
                                tt="uppercase"
                                lts="1.5px"
                            >
                                Você está no controle
                            </Text>
                            <Text
                                fz={14}
                                fw={800}
                                c="gray.9"
                                truncate
                            >
                                Computador de {bot.name}
                            </Text>
                        </Box>
                    </Group>
                    <Group
                        gap={8}
                        wrap="nowrap"
                        flex={isPhone ? 1 : 'none'}
                    >
                        <Textarea
                            w={isPhone ? undefined : 360}
                            flex={isPhone ? 1 : undefined}
                            autosize
                            minRows={1}
                            placeholder="O que você fez (opcional)"
                            value={note}
                            onChange={event => setNote(event.currentTarget.value)}
                            onKeyDown={getHotkeyHandler([['Enter', giveBack]])}
                        />
                        <Button onClick={giveBack}>Devolver ao agente</Button>
                        <Button
                            variant="default"
                            onClick={onClose}
                        >
                            Minimizar
                        </Button>
                    </Group>
                </Group>
                <Box
                    flex={1}
                    p={isPhone ? 0 : 16}
                    mih={0}
                >
                    <LiveScreen
                        botId={bot.id}
                        isInteractive={opened}
                        height="100%"
                    />
                </Box>
            </Stack>
        </Modal>
    )
}
