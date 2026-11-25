import { Button, Modal, Stack, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'

import { LANGUAGES, currentLanguage, setLanguage } from '../lib/language'

/**
 * Idioma · Language (15/11/2026): the panel in Portuguese or in English, chosen here and kept in this
 * browser. Both names stay in their own language, so whoever cannot read the current one still finds theirs.
 */
export function LanguageModal({ opened, onClose }) {
    const current = currentLanguage()
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Idioma · Language"
            centered
            radius={0}
        >
            <Stack gap="xs">
                <Text
                    size="sm"
                    c="gray.6"
                    data-no-translate
                >
                    Escolha o idioma do painel. · Choose the dashboard language.
                </Text>
                {LANGUAGES.map(language => (
                    <Button
                        key={language.id}
                        variant={language.id === current ? 'filled' : 'default'}
                        color="dark"
                        radius={0}
                        size="md"
                        justify="space-between"
                        rightSection={
                            language.id === current ? (
                                <IconCheck
                                    size={16}
                                    stroke={1.5}
                                />
                            ) : null
                        }
                        onClick={() => (language.id === current ? onClose() : setLanguage(language.id))}
                        data-no-translate
                    >
                        {language.label}
                    </Button>
                ))}
            </Stack>
        </Modal>
    )
}
