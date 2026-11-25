import { createTheme } from '@mantine/core'

// Google / Gemini Material Design 3 theme for Mantine 8.
export const theme = createTheme({
    primaryColor: 'geminiBlue',
    primaryShade: { light: 7, dark: 3 },
    defaultRadius: 'md',
    fontFamily: "'Google Sans', 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMonospace: "'JetBrains Mono', 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    headings: {
        fontFamily: "'Google Sans', 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
    },
})
