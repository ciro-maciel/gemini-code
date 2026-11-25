import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Flex, Stack, Text, TextInput } from '@mantine/core'

import { useAuth } from '../auth/AuthContext'
import { notify, Wordmark } from '../components/zen'

/**
 * Optional Sign-In screen used only when external JWT/API-key auth is enabled.
 * In default open-source local mode, users go straight into the workspace.
 */
export function SignIn() {
    const navigate = useNavigate()
    const { signInWithToken } = useAuth()
    const [token, setToken] = useState('')

    const handleSubmit = event => {
        event.preventDefault()
        if (!token.trim()) return notify.error('Enter an access token or API key')
        signInWithToken(token)
        navigate('/', { replace: true })
    }

    return (
        <Flex h="100dvh" px="md" justify="center" align="center" style={{ background: 'var(--gm-canvas)' }}>
            <Box
                component="form"
                onSubmit={handleSubmit}
                w={420}
                maw="100%"
                p={32}
                style={{
                    background: 'var(--gm-surface)',
                    borderRadius: 24,
                    border: '1px solid var(--gm-outline-variant)',
                    boxShadow: 'var(--gm-shadow-2)',
                }}
            >
                <Stack gap={18}>
                    <Wordmark name="Gemini Code" size={26} />
                    <div>
                        <Text fz={22} fw={600} style={{ color: 'var(--gm-on-surface)' }}>
                            Sign in to your workspace
                        </Text>
                        <Text fz={13} mt={4} style={{ color: 'var(--gm-on-surface-variant)' }}>
                            Enter your Gemini Code API key or session token to connect to the control server.
                        </Text>
                    </div>
                    <TextInput
                        label="Access token or API key"
                        placeholder="Paste token…"
                        type="password"
                        radius="md"
                        value={token}
                        onChange={event => setToken(event.currentTarget.value)}
                    />
                    <Button type="submit" radius="xl" size="md">
                        Continue
                    </Button>
                </Stack>
            </Box>
        </Flex>
    )
}
