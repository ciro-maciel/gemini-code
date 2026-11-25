import { useCallback, useEffect, useState } from 'react'
import { Box, Button, Group, ScrollArea, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core'

import { fetchAccounts, fetchOutcomeMetrics, updateAccount } from '../services/api'
import { formatWhen } from '../labels'
import { useAccount } from '../components/Session'
import { EmptyState, Metric, notify } from '../components/zen'

const STATUS_LABEL = { active: 'Liberada', pending: 'Esperando', blocked: 'Bloqueada' }

// Grid, not <Table> (09-painel.md): the same template for the header and the rows.
const COLUMNS = 'minmax(0, 2.4fr) 110px 70px 110px 110px 220px'

function money(value) {
    return `US$ ${(value || 0).toFixed(2).replace('.', ',')}`
}

function HeadCell({ children }) {
    return (
        <Text
            fz={10}
            fw={800}
            c="gray.4"
            tt="uppercase"
            lts="1.5px"
        >
            {children}
        </Text>
    )
}

function Row({ account, onChange }) {
    const [isSaving, setIsSaving] = useState(false)
    const change = async status => {
        setIsSaving(true)
        try {
            await updateAccount(account.id, { status })
            onChange()
        } catch (error) {
            notify.error('Não consegui mudar o acesso', error.message)
        } finally {
            setIsSaving(false)
        }
    }
    return (
        <Box
            px={24}
            py={12}
            style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 16, alignItems: 'center', borderTop: 'var(--rlg-border)' }}
        >
            <Box miw={0}>
                <Text
                    fz={13}
                    fw={700}
                    c="gray.9"
                    truncate
                >
                    {account.name || account.email}
                    {account.isOwner ? ' (você)' : ''}
                </Text>
                <Text
                    fz={12}
                    fw={500}
                    c="gray.5"
                    truncate
                >
                    {account.email}
                </Text>
                {account.firstWish && (
                    <Text
                        fz={12}
                        fw={500}
                        c="gray.7"
                        lh={1.4}
                        mt={4}
                        lineClamp={2}
                        title={account.firstWish}
                    >
                        Primeiro bot: {account.firstWish}
                    </Text>
                )}
            </Box>
            <Text
                fz={13}
                fw={500}
                c={account.status === 'pending' ? 'gray.9' : 'gray.7'}
            >
                {STATUS_LABEL[account.status]}
            </Text>
            <Text
                fz={13}
                fw={500}
                c="gray.7"
            >
                {account.botCount}
            </Text>
            <Text
                fz={13}
                fw={500}
                c="gray.7"
            >
                {money(account.costToday)}
            </Text>
            <Text
                fz={13}
                fw={500}
                c="gray.7"
            >
                {formatWhen(account.lastSeenAt)}
            </Text>
            <Group
                gap={8}
                justify="flex-end"
                wrap="nowrap"
            >
                {!account.isOwner && account.status !== 'active' && (
                    <Button
                        size="xs"
                        h={30}
                        loading={isSaving}
                        onClick={() => change('active')}
                    >
                        Liberar
                    </Button>
                )}
                {!account.isOwner && account.status !== 'blocked' && (
                    <Button
                        size="xs"
                        h={30}
                        variant="default"
                        loading={isSaving}
                        onClick={() => change('blocked')}
                    >
                        Bloquear
                    </Button>
                )}
            </Group>
        </Box>
    )
}

const FAILURE_LABEL = {
    approval_rejected: 'Aprovação recusada',
    ask_user: 'Pergunta à pessoa',
    takeover: 'Pessoa assumiu a tela',
    checkpoint_restored: 'Volta a um ponto',
    tool_error: 'Erro de ferramenta',
    judge_unavailable: 'Risco sem avaliação',
    task_failed: 'Tarefa falhou',
    task_cancelled: 'Tarefa parada',
    step_limit: 'Limite de passos',
    empty_reply: 'Resposta vazia',
    daily_limit: 'Limite do dia',
    concurrency: 'Esperou vaga',
}

const METRICS_DAYS = 30

/** What happened to the approvals, and the moments the bots needed a person, in every account. */
function Outcomes() {
    const [metrics, setMetrics] = useState(null)
    useEffect(() => {
        fetchOutcomeMetrics(METRICS_DAYS)
            .then(setMetrics)
            .catch(error => notify.error('Não consegui ler as aprovações', error.message))
    }, [])
    const outcomes = metrics?.outcomes ?? {}
    const isLoading = metrics === null
    const note = `últimos ${METRICS_DAYS} dias, todas as contas`
    const approved = (outcomes.approved ?? 0) + (outcomes.approved_task ?? 0) + (outcomes.approved_always ?? 0)
    const tiles = [
        { label: 'Pedidos de aprovação', value: outcomes.approval_requested ?? 0, note },
        { label: 'Aprovados', value: approved, note: `${outcomes.approved_task ?? 0} até o fim da tarefa, ${outcomes.approved_always ?? 0} para sempre` },
        { label: 'Recusados', value: outcomes.rejected ?? 0, note },
        { label: 'Sem resposta em 24 h', value: outcomes.timed_out ?? 0, note: `${metrics?.pendingApprovals ?? 0} esperando agora` },
        { label: 'Assumiram a tela', value: outcomes.takeover ?? 0, note },
        { label: 'Voltas a um ponto', value: outcomes.checkpoint_restored ?? 0, note },
    ]
    const failures = Object.entries(metrics?.failures ?? {}).sort((a, b) => b[1] - a[1])
    return (
        <Stack gap={16}>
            <Text
                fz={10}
                fw={800}
                c="gray.4"
                tt="uppercase"
                lts="1.5px"
            >
                Aprovações e falhas
            </Text>
            <Box
                bg="white"
                p={24}
                style={{ border: 'var(--rlg-border)' }}
            >
                <SimpleGrid
                    cols={{ base: 2, sm: 3, lg: 6 }}
                    spacing={24}
                >
                    {tiles.map(tile => (
                        <Metric
                            key={tile.label}
                            {...tile}
                            size="sm"
                            loading={isLoading}
                        />
                    ))}
                </SimpleGrid>
                {!isLoading && (
                    <Text
                        fz={12}
                        fw={500}
                        c="gray.6"
                        mt={24}
                        pt={16}
                        style={{ borderTop: 'var(--rlg-border)' }}
                    >
                        {failures.length ? failures.map(([kind, count]) => `${FAILURE_LABEL[kind] ?? kind}: ${count}`).join(' · ') : 'Nenhum momento de falha registrado.'}
                    </Text>
                )}
            </Box>
        </Stack>
    )
}

/** The owner's view of who uses the Assistant, and the door for whoever waits. */
export function People() {
    const account = useAccount()
    const [accounts, setAccounts] = useState(null)

    const load = useCallback(() => {
        fetchAccounts()
            .then(data => setAccounts(data.items))
            .catch(error => notify.error('Não consegui ler as pessoas', error.message))
    }, [])

    useEffect(() => {
        if (account?.isOwner) load()
    }, [account?.isOwner, load])

    if (!account?.isOwner)
        return (
            <Box p={48}>
                <EmptyState
                    title="Só o dono vê esta tela"
                    description="Aqui ficam as contas do Assistant e quem espera liberação."
                />
            </Box>
        )

    const waiting = (accounts ?? []).filter(item => item.status === 'pending').length
    const { limits } = account
    const limitsLine = `Cada conta liberada pode ter até ${limits.botsPerAccount} bots, ${limits.runningTasksPerAccount} tarefas ao mesmo tempo. O modelo roda na chave de IA de cada conta.`

    return (
        <ScrollArea
            h="100%"
            bg="gray.0"
        >
            <Stack
                px={{ base: 16, sm: 48 }}
                pt={40}
                pb={80}
                maw={1280}
                // Centered in the main area, as the conversation's reading line is.
                mx="auto"
                gap={32}
            >
                <Stack gap={8}>
                    <Text
                        fz={10}
                        fw={800}
                        c="gray.4"
                        tt="uppercase"
                        lts="1.5px"
                    >
                        Assistant · Acesso
                    </Text>
                    <Text
                        fz={36}
                        fw={900}
                        c="gray.9"
                        lh={1.1}
                        lts="-0.04em"
                    >
                        Pessoas
                    </Text>
                    <Text
                        fz={15}
                        fw={500}
                        c="gray.6"
                        lh={1.6}
                        maw={620}
                    >
                        {accounts === null ? 'Contas do Assistant e quem espera liberação.' : `${waiting ? `${waiting} ${waiting === 1 ? 'pessoa espera' : 'pessoas esperam'} liberação.` : 'Ninguém esperando.'} ${limitsLine}`}
                    </Text>
                </Stack>

                <Box
                    bg="white"
                    style={{ border: 'var(--rlg-border)', overflowX: 'auto' }}
                >
                    <Box miw={840}>
                        <Box
                            px={24}
                            py={12}
                            bg="gray.1"
                            style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 16 }}
                        >
                            <HeadCell>Conta</HeadCell>
                            <HeadCell>Acesso</HeadCell>
                            <HeadCell>Bots</HeadCell>
                            <HeadCell>Hoje</HeadCell>
                            <HeadCell>Visto</HeadCell>
                            <Box />
                        </Box>
                        {accounts === null
                            ? Array.from({ length: 4 }, (_, index) => (
                                  <Box
                                      key={index}
                                      px={24}
                                      py={12}
                                      style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 16, borderTop: 'var(--rlg-border)' }}
                                  >
                                      <Skeleton
                                          h={32}
                                          radius={0}
                                      />
                                      <Skeleton
                                          h={14}
                                          radius={0}
                                      />
                                      <Skeleton
                                          h={14}
                                          radius={0}
                                      />
                                      <Skeleton
                                          h={14}
                                          radius={0}
                                      />
                                      <Skeleton
                                          h={14}
                                          radius={0}
                                      />
                                      <Box />
                                  </Box>
                              ))
                            : accounts.map(item => (
                                  <Row
                                      key={item.id}
                                      account={item}
                                      onChange={load}
                                  />
                              ))}
                    </Box>
                </Box>

                <Outcomes />
            </Stack>
        </ScrollArea>
    )
}
