import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'

import { AuthProvider } from './auth/AuthContext'
import { NOTIFICATIONS_PROPS } from './components/zen'
import { Router } from './router'
import { theme } from './theme'

export default function App() {
    return (
        <MantineProvider
            theme={theme}
            defaultColorScheme="auto"
        >
            <Notifications {...NOTIFICATIONS_PROPS} />
            <AuthProvider apiUrl={import.meta.env.VITE_AUTH_API_URL}>
                <BrowserRouter>
                    <Router />
                </BrowserRouter>
            </AuthProvider>
        </MantineProvider>
    )
}
