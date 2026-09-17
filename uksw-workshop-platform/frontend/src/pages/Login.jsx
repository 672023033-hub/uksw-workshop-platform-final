import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'

export default function Login() {
    const [userType, setUserType] = useState('STUDENT')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!username || !password) {
            setError('Please enter both username and password')
            return
        }

        setIsLoading(true)

        try {
            const response = await api.login(username, password, userType)

            if (response.success) {
                await login(response.user, response.token)

                if (userType === 'STUDENT') {
                    navigate('/welcome')
                } else {
                    navigate('/mentor')
                }
            }
        } catch (err) {
            // Show specific error messages based on error code
            if (err.message && err.message.includes('pending approval')) {
                setError('⏳ Your account is pending approval. Please wait for a mentor to approve your registration.')
            } else if (err.message && err.message.includes('ACCOUNT_PENDING_APPROVAL')) {
                setError('⏳ Your account is pending approval. Please wait for a mentor to approve your registration.')
            } else {
                setError('❌ ' + (err.message || 'Invalid credentials. Please try again.'))
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen w-full flex-col bg-background-dark overflow-x-hidden">
            {/* Header */}
            <header className="flex items-center justify-center border-b border-border-dark bg-white py-3 px-4 shadow-sm">
                <div className="w-full max-w-7xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-white border-2 border-border-dark flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                            <img src="/k2i-logo.png" alt="K2I UKSW" className="size-9 object-contain" />
                        </div>
                        <div className="flex flex-col leading-none">
                            <h2 className="text-primary text-base font-extrabold leading-tight tracking-tight">UKSW Workshops</h2>
                            <span className="text-text-muted text-[10px] font-medium uppercase tracking-widest">Fakultas Teknologi Informasi</span>
                        </div>
                    </div>
                    <button className="flex items-center justify-center rounded-lg h-9 px-4 bg-transparent hover:bg-primary-light text-text-muted hover:text-primary text-sm font-medium transition-colors gap-2 border border-border-dark">
                        <span className="material-symbols-outlined text-[18px]">help</span>
                        <span className="hidden sm:inline">Help Center</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md flex flex-col gap-6 animate-in">
                    <div className="bg-white rounded-xl shadow-xl border border-border-dark overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b border-border-dark bg-primary-light/50">
                            <button
                                onClick={() => setUserType('STUDENT')}
                                className={`flex-1 py-4 text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors ${userType === 'STUDENT'
                                    ? 'border-primary text-primary bg-white'
                                    : 'border-transparent text-text-muted hover:text-primary'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">person</span>
                                Student
                            </button>
                            <button
                                onClick={() => setUserType('MENTOR')}
                                className={`flex-1 py-4 text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors ${userType === 'MENTOR'
                                    ? 'border-primary text-primary bg-white'
                                    : 'border-transparent text-text-muted hover:text-primary'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">co_present</span>
                                Mentor
                            </button>
                        </div>

                        {/* Logo & Title */}
                        <div className="px-8 pt-8 pb-4 flex flex-col items-center">
                            {/* Actual K2I Logo with white background */}
                            <div className="size-24 mb-5 rounded-full bg-white border-4 border-primary/20 flex items-center justify-center overflow-hidden shadow-lg">
                                <img src="/k2i-logo.png" alt="K2I UKSW" className="size-[88px] object-contain" />
                            </div>
                            <h1 className="text-2xl font-bold leading-tight mb-1 text-gray-800 text-center">
                                Workshop Registration
                            </h1>
                            <p className="text-xs font-semibold text-primary uppercase tracking-widest text-center mb-1">Universitas Kristen Satya Wacana</p>
                            <p className="text-sm text-text-muted text-center max-w-[280px] leading-relaxed">
                                Sign in with your UKSW credentials to access your dashboard.
                            </p>
                        </div>

                        {/* Form */}
                        <div className="px-8 pb-10">
                            {error && (
                                <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        {userType === 'STUDENT' ? 'Student ID / NIM' : 'Mentor ID / NIDN'}
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute left-3 top-3 text-text-muted group-focus-within:text-primary transition-colors">
                                            <span className="material-symbols-outlined text-[20px]">badge</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="Enter your ID"
                                            className="w-full h-11 rounded-lg border border-border-dark bg-primary-light/30 pl-10 pr-4 text-gray-800 placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        Password
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute left-3 top-3 text-text-muted group-focus-within:text-primary transition-colors">
                                            <span className="material-symbols-outlined text-[20px]">lock</span>
                                        </div>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full h-11 rounded-lg border border-border-dark bg-primary-light/30 pl-10 pr-10 text-gray-800 placeholder:text-text-muted/60 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-3 text-text-muted hover:text-primary transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">
                                                {showPassword ? 'visibility' : 'visibility_off'}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-border-dark text-primary focus:ring-primary bg-white"
                                        />
                                        <span className="text-xs text-text-muted">Remember me</span>
                                    </label>
                                    <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:text-primary-hover hover:underline transition-all">
                                        Forgot Password?
                                    </Link>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-lg h-11 px-4 bg-primary text-white text-sm font-bold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Logging in...' : 'Log In'}
                                </button>
                            </form>

                            <div className="mt-6 pt-6 border-t border-border-dark text-center">
                                <p className="text-sm text-text-muted">
                                    Don't have an account?{' '}
                                    <Link to="/register" className="text-primary font-semibold hover:text-primary-hover hover:underline transition-all">
                                        Register here
                                    </Link>
                                </p>
                            </div>

                            <div className="mt-4 flex items-center justify-center gap-2">
                                <div className="size-2 rounded-full bg-green-500" />
                                <p className="text-xs text-text-muted font-medium">System Operational v4.2</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center space-y-2">
                        <p className="text-xs text-text-muted">© 2026 Satya Wacana Christian University</p>
                        <div className="flex items-center justify-center gap-4 text-xs text-text-muted">
                            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
                            <span className="text-border-dark">•</span>
                            <a href="#" className="hover:text-primary transition-colors">Workshop Calendar</a>
                            <span className="text-border-dark">•</span>
                            <a href="#" className="hover:text-primary transition-colors">Contact IT</a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
