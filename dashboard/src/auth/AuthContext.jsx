import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'

export const TOKEN_STORAGE_KEY = 'gemini_code_auth_token'

const LOCAL_USER = {
    id: 'local-developer',
    name: 'Developer',
    email: 'developer@local.gemini-code',
}

const AuthContext = createContext({
    user: LOCAL_USER,
    loading: false,
    isLocalMode: true,
    signInWithToken: () => {},
    signOut: async () => {},
})

export function AuthProvider({ apiUrl = '', children }) {
    const isLocalMode = !String(apiUrl || '').trim()
    const [token, setToken] = useState(() => {
        try {
            return localStorage.getItem(TOKEN_STORAGE_KEY) || null
        } catch {
            return null
        }
    })

    const signInWithToken = useCallback(nextToken => {
        const clean = String(nextToken || '').trim()
        if (!clean) return
        try {
            localStorage.setItem(TOKEN_STORAGE_KEY, clean)
        } catch {}
        setToken(clean)
    }, [])

    const signOut = useCallback(async () => {
        try {
            localStorage.removeItem(TOKEN_STORAGE_KEY)
        } catch {}
        setToken(null)
    }, [])

    const value = useMemo(
        () => ({
            user: isLocalMode ? LOCAL_USER : token ? { id: 'token-user', name: 'User', email: '' } : null,
            loading: false,
            isLocalMode,
            signInWithToken,
            signOut,
        }),
        [isLocalMode, token, signInWithToken, signOut]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
export const useSignOut = () => useContext(AuthContext).signOut

export function GuestOnly({ children }) {
    const { user, loading } = useAuth()
    if (loading) return null
    if (user) return <Navigate to="/" replace />
    return children
}

export function AccountSwitcher() {
    return null
}
