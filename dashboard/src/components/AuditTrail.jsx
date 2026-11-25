import { useEffect, useState } from 'react'
import { Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { IconDownload } from '@tabler/icons-react'

import { downloadAudit, fetchApprovalRate, fetchAudit } from '../services/api'
import { formatWhen } from '../labels'
import { Metric, notify, Tag } from './zen'

// The word carries the state; the red is only for what was refused.
const OUTCOME_TONE = { rejected: 'no', refused: 'no', pending: 'neutral', approved: 'dark', approved_task: 'dark', approved_always: 'dark', ran: 'neutral', cancelled: 'neutral' }

function save({ blob, fileName }) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Entry({ entry }) {
    const risk = entry.risk === 'high' ? 'risco alto' : entry.risk === 'low' ? 'risco baixo' : null
    const decidedBy = entry.resolvedBy && entry.resolvedAt ? `${entry.resolvedBy}, ${formatWhen(entry.resolvedAt)}` : null
    return (
        <Group
            gap={8}
            wrap="nowrap"
            align="flex-start"
            justify="space-between"
        >
            <Box miw={0}>
                <Text
                    fz={13}
                    fw={500}
                    c="gray.7"
                    lineClamp={2}
                    title={entry.action}
                >
                    {entry.action}
                </Text>
                <Text
                    fz={12}
                    c="gray.5"
                >
                    {[entry.ruleLabel, risk, formatWhen(entry.createdAt)].filter(Boolean).join(' · ')}
                </Text>
                {decidedBy && (
                    <Text
                        fz={12}
                        c="gray.5"
                        truncate
                    >
                        Decidido por {decidedBy}
                    </Text>
                )}
            </Box>
            <Tag
                tone={OUTCOME_TONE[entry.outcome] ?? 'neutral'}
                style={{ flex: 'none' }}
            >
                {entry.outcomeLabel}
            </Tag>
        </Group>
    )
}

const percent = ({ approved, decided }) => (decided ? Math.round((approved / decided) * 100) : null)
const countNote = ({ approved, decided }) => (decided ? `${approved} de ${decided} decididos` : 'nenhum pedido decidido')

/**
 * Of the approvals you decided, how many were a yes: the last 7 days against
 * the 7 before, and the last 8 weeks. It goes up when the agent gets it right
 * before asking.
 */
function ApprovalRate({ botId }) {
    const [weeks, setWeeks] = useState(null)

    useEffect(() => {
        fetchApprovalRate(botId)
            .then(data => setWeeks(data.weeks))
            .catch(() => setWeeks([]))
    }, [botId])

    const isLoading = weeks === null
    const [last = { approved: 0, decided: 0 }, before = { approved: 0, decided: 0 }] = weeks ?? []
    const all = (weeks ?? []).reduce((sum, week) => ({ approved: sum.approved + week.approved, decided: sum.decided + week.decided }), { approved: 0, decided: 0 })
    const lastPercent = percent(last)
    const beforePercent = percent(before)
    const tiles = [
        { label: 'Últimos 7 dias', value: lastPercent, note: countNote(last), delta: lastPercent != null && beforePercent != null ? lastPercent - beforePercent : null },
        { label: 'Os 7 dias antes', value: beforePercent, note: countNote(before) },
        { label: 'Últimas 8 semanas', value: percent(all), note: countNote(all) },
    ]
    return (
        <Box
            bg="white"
            p={16}
            mb={8}
            style={{ border: 'var(--rlg-border)' }}
        >
            <Text
                fz={12}
                c="gray.6"
                mb={12}
            >
                Dos pedidos de aprovação que você decidiu, quantos você aprovou. Sobe quando o agente acerta antes de pedir.
            </Text>
            <SimpleGrid
                cols={{ base: 1, xs: 3 }}
                spacing={16}
            >
                {tiles.map(tile => (
                    <Metric
                        key={tile.label}
                        {...tile}
                        unit={tile.value == null ? null : '%'}
                        deltaSuffix=" pontos"
                        size="sm"
                        loading={isLoading}
                    />
                ))}
            </SimpleGrid>
        </Box>
    )
}

/**
 * What the bot did that went through a judgment — a rule of yours, the risk
 * judge or an approval — newest first, and the whole of it to download.
 */
export function AuditTrail({ botId }) {
    const [trail, setTrail] = useState(null)
    const [downloading, setDownloading] = useState(null)

    useEffect(() => {
        fetchAudit(botId)
            .then(data => setTrail(data))
            .catch(() => setTrail({ items: [], page: { total: 0 } }))
    }, [botId])

    const download = async format => {
        setDownloading(format)
        try {
            save(await downloadAudit(botId, format))
        } catch (error) {
            notify.error('Não consegui baixar o registro', error.message)
        } finally {
            setDownloading(null)
        }
    }

    if (!trail) return null
    const total = trail.page?.total ?? trail.items.length
    return (
        <Stack gap={10}>
            <ApprovalRate botId={botId} />
            <Text
                fz={12}
                c="gray.6"
            >
                As ações que passaram por uma regra sua, pelo julgamento de risco ou por uma aprovação: o que era, como foi decidido, quem aprovou e o ponto de restauração.
            </Text>
            {trail.items.length === 0 && (
                <Text
                    fz={12}
                    c="gray.5"
                >
                    Nada ainda. A primeira aparece quando o bot clicar, digitar ou usar um aplicativo que escreve.
                </Text>
            )}
            {trail.items.map(entry => (
                <Entry
                    key={entry.id}
                    entry={entry}
                />
            ))}
            {total > trail.items.length && (
                <Text
                    fz={12}
                    c="gray.5"
                >
                    Mostrando as {trail.items.length} mais recentes de {total}. O arquivo traz todas.
                </Text>
            )}
            {total > 0 && (
                <Group gap={6}>
                    {['csv', 'json'].map(format => (
                        <Button
                            key={format}
                            size="compact-xs"
                            radius={0}
                            variant="default"
                            loading={downloading === format}
                            leftSection={
                                <IconDownload
                                    size={14}
                                    stroke={1.5}
                                />
                            }
                            onClick={() => download(format)}
                        >
                            Baixar {format.toUpperCase()}
                        </Button>
                    ))}
                </Group>
            )}
        </Stack>
    )
}
