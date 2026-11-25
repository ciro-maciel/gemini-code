// The demo's entry: the panel as src/main.jsx starts it, with the fake control
// server installed first (start.js must stay the first import).
import './start.js'

import React from 'react'
import ReactDOM from 'react-dom/client'

import DemoApp from './DemoApp.jsx'
import { startLanguage } from '../lib/language'

import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import '../global.css'
import '@tabler/icons-webfont/dist/tabler-icons-300.min.css'
import '../assistant.css'
import '../gemini-theme.css'
import '../neural-expressive.css'
import './demo.css'

startLanguage({ skip: '.assistant-rich, .txt' }).finally(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <React.StrictMode>
            <DemoApp />
        </React.StrictMode>
    )
})
