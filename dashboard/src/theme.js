import { createTheme } from '@mantine/core'

// Google / Gemini theme for Mantine 8: Material 3 Expressive corners, Google Sans Flex (see docs/design.md).
export const theme = createTheme({
    primaryColor: 'geminiBlue',
    primaryShade: { light: 7, dark: 3 },
    defaultRadius: 'lg',
    radius: { xs: '8px', sm: '12px', md: '16px', lg: '20px', xl: '28px' },
    fontFamily: "'Google Sans Flex', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMonospace: "'Google Sans Code', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    headings: {
        fontFamily: "'Google Sans Flex', 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontWeight: '600',
    },
    colors: {
        geminiBlue: [
            '#e8f0fe',
            '#d3e3fd',
            '#aecbfa',
            '#a8c7fa',
            '#669df6',
            '#4285f4',
            '#1a73e8',
            '#0b57d0',
            '#0842a0',
            '#041e49',
        ],
    },
    components: {
        Button: { defaultProps: { radius: 'xl' } },
        Modal: { defaultProps: { radius: 'xl' } },
        TextInput: { defaultProps: { radius: 'md' } },
        Textarea: { defaultProps: { radius: 'md' } },
        Select: { defaultProps: { radius: 'md' } },
        Menu: { defaultProps: { radius: 'xl' } },
        Popover: { defaultProps: { radius: 'xl' } },
    },
})
