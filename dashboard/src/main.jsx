import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import { startLanguage } from './lib/language'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './global.css'
import '@tabler/icons-webfont/dist/tabler-icons-300.min.css'
import './assistant.css'
import './gemini-theme.css'
import './neural-expressive.css'

// Language layer starts before React paints so English (default) or Portuguese renders cleanly.
startLanguage({ skip: '.assistant-rich, .txt' }).finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    )
})
