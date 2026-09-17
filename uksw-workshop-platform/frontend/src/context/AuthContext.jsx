import { createContext, useContext, useState, useEffect } from 'react'
import SessionTimeoutModal from '../components/SessionTimeoutModal'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [token, setToken] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [notification, setNotification] = useState(null) // For server errors
    const [showTimeoutModal, setShowTimeoutModal] = useState(false)

    useEffect(() => {
        // Check for existing auth on mount
        const savedToken = sessionStorage.getItem('authToken')
        const savedUser = sessionStorage.getItem('user')

        if (savedToken && savedUser) {
            import('../api/client').then(({ api }) => {
                api.setToken(savedToken)
            })
            setToken(savedToken)
            setUser(JSON.parse(savedUser))
        }
        setIsLoading(false)

        // Event Listeners for Global Error Handling
        const handleAuthError = () => {
            // If 401 occurs, session is likely dead, so skip API logout attempt
            // Clear session immediately to prevent restore on refresh
            sessionStorage.removeItem('authToken')
            sessionStorage.removeItem('user')
            setToken(null)
            setUser(null)
            setShowTimeoutModal(true)
        }

        const handleServerConnectionError = (event) => {
            setNotification({
                message: event.detail.message,
                type: 'error'
            })
            setTimeout(() => setNotification(null), 5000)
        }

        window.addEventListener('auth_error', handleAuthError)
        window.addEventListener('server_connection_error', handleServerConnectionError)

        return () => {
            window.removeEventListener('auth_error', handleAuthError)
            window.removeEventListener('server_connection_error', handleServerConnectionError)
        }
    }, []) // Dependencies empty to run once on mount

    // Session TTL monitoring - check JWT expiration
    useEffect(() => {
        if (!token) return

        // Helper function to decode JWT
        const decodeJWT = (token) => {
            try {
                const base64Url = token.split('.')[1]
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                }).join(''))
                return JSON.parse(jsonPayload)
            } catch (error) {
                console.error('Failed to decode JWT:', error)
                return null
            }
        }

        const payload = decodeJWT(token)
        if (!payload || !payload.exp) return

        // Check token expiration every 30 seconds
        const checkExpiration = () => {
            const now = Math.floor(Date.now() / 1000) // Current time in seconds
            const expiresAt = payload.exp

            if (now >= expiresAt) {
                // Token has expired
                // Clear session immediately to prevent restore on refresh
                sessionStorage.removeItem('authToken')
                sessionStorage.removeItem('user')
                setToken(null)
                setUser(null)
                setShowTimeoutModal(true)
            }
        }

        // Check immediately
        checkExpiration()

        // Then check every 30 seconds
        const intervalId = setInterval(checkExpiration, 30000)

        return () => clearInterval(intervalId)
    }, [token])

    const login = async (userData, authToken) => {
        setUser(userData)
        setToken(authToken)

        const { api } = await import('../api/client')
        api.setToken(authToken)

        sessionStorage.setItem('user', JSON.stringify(userData))
    }

    const logout = async (skipApi = false) => {
        if (!skipApi) {
            try {
                const { api } = await import('../api/client')
                await api.logout()
                api.setToken(null)
            } catch (error) {
                console.error('Logout failed on backend:', error)
            }
        } else {
            // Ensure token is cleared from client even if we skip API call
            const { api } = await import('../api/client')
            api.setToken(null)
        }

        setUser(null)
        setToken(null)
        sessionStorage.removeItem('user')
    }

    const handleTimeoutModalClose = () => {
        setShowTimeoutModal(false)
        logout(true) // Skip API call since session is already expired
    }

    const value = {
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
            {/* Session Timeout Modal */}
            <SessionTimeoutModal
                show={showTimeoutModal}
                onClose={handleTimeoutModalClose}
            />
            {/* Global Notification Toast */}
            {notification && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-lg shadow-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 bg-red-900/90 border-red-500 text-white shadow-red-900/20">
                    <span className="material-symbols-outlined">wifi_off</span>
                    <span className="font-bold">{notification.message}</span>
                </div>
            )}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
