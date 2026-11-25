import { useEffect, useRef, useState } from 'react'
import { Box, Button, Group, Text } from '@mantine/core'
import RFB from '@novnc/novnc'

import { screenSocketUrl } from '../services/api'

// A sleeping Sprite drops the first connection while its services come back
// (measured: ~7 s, then the second try opens in under a second). The screen
// retries on its own before asking for a click.
const AUTO_RETRIES = 6
const RETRY_DELAY_MS = 1500


/**
 * The bot's screen, live, over VNC through the control server. It watches by
 * default; `isInteractive` hands mouse and keyboard to the person (taking over).
 */
export function LiveScreen({ botId, isInteractive, height = 420 }) {
    const targetRef = useRef(null)
    const rfbRef = useRef(null)
    const retriesRef = useRef(0)
    const [state, setState] = useState('connecting')
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        if (!targetRef.current) return
        setState('connecting')
        const rfb = new RFB(targetRef.current, screenSocketUrl(botId), { shared: true })
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfb.background = 'var(--mantine-color-gray-1)'
        rfb.viewOnly = !isInteractive
        let retryTimer = null
        rfb.addEventListener('connect', () => {
            retriesRef.current = 0
            setState('connected')
        })
        rfb.addEventListener('disconnect', () => {
            if (rfbRef.current !== rfb) return
            if (retriesRef.current < AUTO_RETRIES) {
                retriesRef.current += 1
                setState('connecting')
                retryTimer = setTimeout(() => setAttempt(value => value + 1), RETRY_DELAY_MS)
            } else {
                setState('disconnected')
            }
        })
        rfbRef.current = rfb
        return () => {
            clearTimeout(retryTimer)
            rfbRef.current = null
            try {
                rfb.disconnect()
            } catch {}
        }
        // isInteractive is applied below without reconnecting.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [botId, attempt])

    useEffect(() => {
        if (!rfbRef.current) return
        rfbRef.current.viewOnly = !isInteractive
        if (isInteractive) rfbRef.current.focus()
    }, [isInteractive])

    return (
        <Box
            pos="relative"
            h={height}
            bg="gray.1"
            style={{ border: isInteractive ? '2px solid var(--mantine-color-gray-9)' : 'var(--rlg-border)', overflow: 'hidden' }}
        >
            <Box
                ref={targetRef}
                w="100%"
                h="100%"
            />
            {state !== 'connected' && (
                <Group
                    pos="absolute"
                    inset={0}
                    justify="center"
                    align="center"
                    style={{ pointerEvents: state === 'disconnected' ? 'auto' : 'none' }}
                >
                    <Box ta="center">
                        <Text
                            fz={10}
                            fw={800}
                            c="gray.4"
                            tt="uppercase"
                            lts="1.5px"
                        >
                            {state === 'connecting' ? 'Acordando o computador' : 'Tela desconectada'}
                        </Text>
                        {state === 'disconnected' && (
                            <Button
                                mt={12}
                                size="xs"
                                radius={0}
                                variant="default"
                                onClick={() => {
                                    retriesRef.current = 0
                                    setAttempt(value => value + 1)
                                }}
                            >
                                Conectar de novo
                            </Button>
                        )}
                    </Box>
                </Group>
            )}
        </Box>
    )
}
