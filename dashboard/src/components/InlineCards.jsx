import { useEffect, useState } from 'react'
import { Box, Button, Checkbox, Group, Paper, Text, Textarea, TextInput } from '@mantine/core'

import { fetchConnections, resolveApproval, retryConnection, retryTask, saveConnectionSecret } from '../services/api'
import { openSignIn } from '../connectors/sign-in'
import { notify } from './zen'

/**
 * What the bot waits on, inside the conversation: an elevated surface with the
 * system's hairline. The label names the kind of wait; the title, what exactly.
 */
function Card({ eyebrow, title, children }) {
    return (
        <Paper
            p={20}
            bg="white"
        >
            <Text
                fz={10}
                fw={800}
                c="gray.4"
                tt="uppercase"
                lts="1.5px"
                mb={8}
            >
                {eyebrow}
            </Text>
            {title && (
                <Text
                    fz={16}
                    fw={800}
                    c="gray.9"
                    lh={1.4}
                    mb={6}
                >
                    {title}
                </Text>
            )}
            {children}
        </Paper>
    )
}

function Description({ children, isError = false }) {
    return (
        <Text
            fz={13}
            fw={500}
            c={isError ? 'red.6' : 'gray.6'}
            lh={1.5}
            mb={14}
        >
            {children}
        </Text>
    )
}

const CLASS_LABELS = { read: 'ler', write: 'criar e alterar rascunhos, agendar e propor', external: 'publicar, enviar, pagar ou apagar' }
const KIND_LABELS = { send: 'enviar mensagens', pay: 'pagar ou comprar', delete: 'apagar ou sobrescrever', publish: 'publicar ou fazer deploy', form: 'enviar formulários', auth: 'entrar em serviços', other: 'ações deste tipo' }

/** What "Permitir" covers, in the person's unit: the service and its class, or the kind of computer action. */
export function reachSentence({ service, reach }) {
    if (service && CLASS_LABELS[reach]) return `o ${service} para ${CLASS_LABELS[reach]}`
    if (KIND_LABELS[reach]) return KIND_LABELS[reach]
    return 'esta ação'
}

// What leaves, exactly as it will: a person approves an act, not a sentence
// about it. Long values keep their full text in a scrolling block.
const HIDDEN_KEYS = new Set(['ref', 'target', 'element', 'selector', 'id', 'ids'])
function OutgoingContent({ args }) {
    const entries = Object.entries(args || {}).filter(([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined && value !== null && value !== '')
    if (!entries.length) return null
    const show = value => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    return (
        <Box
            mb={12}
            p={12}
            bg="gray.1"
            style={{ border: '1px solid var(--mantine-color-gray-2)' }}
        >
            <Text
                fz={10}
                fw={800}
                c="gray.4"
                tt="uppercase"
                lts="1.5px"
                mb={6}
            >
                O que vai sair
            </Text>
            {entries.map(([key, value]) => (
                <Box
                    key={key}
                    mb={6}
                >
                    <Text
                        fz={11}
                        fw={700}
                        c="gray.5"
                    >
                        {key}
                    </Text>
                    <Text
                        fz={13}
                        fw={500}
                        c="gray.9"
                        lh={1.5}
                        component="pre"
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit', maxHeight: 320, overflow: 'auto' }}
                    >
                        {show(value)}
                    </Text>
                </Box>
            ))}
        </Box>
    )
}

export function ApprovalCard({ taskId, approvalId, toolName, summary, reason, checkpointId, service = null, reach = null, isAlwaysAsk = false, args = null, onDone = () => {} }) {
    const [note, setNote] = useState('')
    const [shouldRemember, setShouldRemember] = useState(true)
    const [busy, setBusy] = useState(null)

    // "Permitir" covers the same unit (the service and its class, or the kind
    // of computer action) until the task ends; "Sempre permitir", on this bot
    // from now on. One permission per unit, never one per step (24/10/2026).
    const covers = reachSentence({ service, reach })

    const decide = async (isApproved, scope) => {
        setBusy(isApproved ? scope || 'approve' : 'reject')
        try {
            await resolveApproval(taskId, approvalId, { isApproved, note: note.trim() || undefined, shouldRemember, scope: scope ?? 'task' })
            onDone()
        } catch (error) {
            notify.error(error.message)
        } finally {
            setBusy(null)
        }
    }

    return (
        <Card
            eyebrow="Precisa da sua aprovação"
            title={summary}
        >
            <Description>
                {reason}
                {checkpointId ? ' O computador foi fotografado antes: dá para desfazer o que mudar nele, não o que sair para fora.' : ''}
                {isAlwaysAsk ? ` Permitir libera ${covers} até o fim da tarefa. Pagamentos e contas pedem sempre: não há "sempre permitir" para isto.` : ` Permitir libera ${covers} até o fim da tarefa. Sempre permitir libera ${covers} neste bot por 90 dias.`}
            </Description>
            <OutgoingContent args={args} />
            <Textarea
                placeholder="Opcional: peça uma mudança (Permitir com a mudança) ou diga por que recusa (o motivo vale como 'pergunte antes' para isto)"
                value={note}
                onChange={event => setNote(event.currentTarget.value)}
                autosize
                minRows={1}
                radius={0}
                mb={8}
            />
            <Group
                justify="space-between"
                gap={8}
            >
                <Checkbox
                    size="xs"
                    label="Lembrar o motivo da recusa"
                    checked={shouldRemember}
                    onChange={event => setShouldRemember(event.currentTarget.checked)}
                />
                <Group gap={8}>
                    <Button
                        radius={0}
                        variant="default"
                        loading={busy === 'reject'}
                        onClick={() => decide(false)}
                    >
                        Recusar
                    </Button>
                    {!isAlwaysAsk && (
                        <Button
                            radius={0}
                            variant="default"
                            loading={busy === 'always'}
                            onClick={() => decide(true, 'always')}
                        >
                            Sempre permitir
                        </Button>
                    )}
                    <Button
                        radius={0}
                        color="gray.9"
                        loading={busy === 'approve' || busy === 'task'}
                        onClick={() => decide(true, 'task')}
                        title={note.trim() ? 'O agente refaz a ação com a sua mudança; a permissão vale para ela' : undefined}
                    >
                        {note.trim() ? 'Permitir com a mudança' : 'Permitir'}
                    </Button>
                </Group>
            </Group>
        </Card>
    )
}

/** The Connect card: sign-in is OAuth with the provider, never the bot's computer. */
/**
 * A connection the bot asked for, where it asked: with its reason, usable
 * whenever the person wants. It does not hold the conversation; once the app
 * is connected it shrinks to one line (`isReady` comes from the conversation).
 */
export function ConnectCard({ connectionId, reason, isReady = false, onDone = () => {} }) {
    const [connection, setConnection] = useState(null)
    const [secret, setSecret] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const isConnected = isReady || connection?.status === 'connected'

    useEffect(() => {
        if (isReady) return
        let isAlive = true
        let timer = null
        const load = () =>
            fetchConnections()
                .then(data => {
                    if (!isAlive) return
                    const found = data.items.find(item => item.id === connectionId) ?? null
                    setConnection(found)
                    // Once connected there is nothing left to watch.
                    if (found?.status === 'connected') clearInterval(timer)
                })
                .catch(() => {})
        load()
        timer = setInterval(load, 3000)
        return () => {
            isAlive = false
            clearInterval(timer)
        }
    }, [connectionId, isReady])

    if (isConnected) return null
    if (!connection) return null

    const run = async action => {
        setIsBusy(true)
        try {
            await action()
            onDone()
        } catch (error) {
            notify.error(error.message)
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <Card
            eyebrow="Conectar aplicativo"
            title={connection.title}
        >
            {reason && (
                <Text
                    fz={14}
                    fw={500}
                    c="gray.9"
                    lh={1.5}
                    mb={6}
                >
                    {reason}
                </Text>
            )}
            {connection.status === 'pending_auth' && (
                <>
                    <Description>
                        Entre na sua conta e aprove o acesso quando quiser. O bot é avisado quando você conectar.
                    </Description>
                    <Button
                        radius={0}
                        color="gray.9"
                        onClick={() => openSignIn(connection.statusDetail)}
                    >
                        Conectar
                    </Button>
                </>
            )}
            {connection.status === 'needs_secret' && (
                <>
                    <Description>
                        Este serviço pede um token de API. Ele fica criptografado na central, fora desta conversa e do computador do bot.
                    </Description>
                    <Group
                        gap={8}
                        wrap="nowrap"
                    >
                        <TextInput
                            flex={1}
                            type="password"
                            placeholder="Cole o token"
                            value={secret}
                            onChange={event => setSecret(event.currentTarget.value)}
                            radius={0}
                        />
                        <Button
                            radius={0}
                            color="gray.9"
                            loading={isBusy}
                            disabled={!secret.trim()}
                            onClick={() => run(() => saveConnectionSecret(connection.id, { value: secret }))}
                        >
                            Conectar
                        </Button>
                    </Group>
                </>
            )}
            {(connection.status === 'failed' || connection.status === 'connecting') && (
                <>
                    <Description isError={connection.status === 'failed'}>
                        {connection.status === 'failed' ? `Não consegui falar com o serviço: ${connection.statusDetail || 'sem detalhe'}` : 'Conectando…'}
                    </Description>
                    {connection.status === 'failed' && (
                        <Button
                            radius="xl"
                            variant="default"
                            loading={isBusy}
                            onClick={() => run(() => retryConnection(connection.id))}
                        >
                            Tentar de novo
                        </Button>
                    )}
                </>
            )}
        </Card>
    )
}

export function TakeoverCard({ onOpen }) {
    return (
        <Card
            eyebrow="O computador é seu"
            title="Você assumiu a tela"
        >
            <Description>
                Faça o login, o código ou o que precisar. Quando terminar, mande uma mensagem dizendo o que fez — isso devolve ao bot.
            </Description>
            <Button
                radius={0}
                color="gray.9"
                onClick={onOpen}
            >
                Abrir o computador
            </Button>
        </Card>
    )
}

export function FailedCard({ taskId, error, onDone = () => {} }) {
    const [isBusy, setIsBusy] = useState(false)
    const retry = async () => {
        setIsBusy(true)
        try {
            await retryTask(taskId)
            onDone()
        } catch (failure) {
            notify.error(failure.message)
        } finally {
            setIsBusy(false)
        }
    }
    return (
        <Group
            gap={8}
            pl={22}
        >
            <Button
                size="xs"
                radius="xl"
                variant="default"
                loading={isBusy}
                onClick={retry}
            >
                Tentar de novo
            </Button>
            <Text
                fz={12}
                c="gray.5"
            >
                ou mande uma mensagem dizendo como seguir
            </Text>
        </Group>
    )
}
