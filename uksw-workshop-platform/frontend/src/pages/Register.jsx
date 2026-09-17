import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Register() {
    const [formData, setFormData] = useState({
        name: '',
        nimNidn: '',
        email: '',
        password: '',
        confirmPassword: '',
        major: '',
        role: 'STUDENT'
    })
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        // Validation
        if (!formData.name || !formData.nimNidn || !formData.email || !formData.password) {
            setError('Please fill in all required fields')
            return
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        setIsLoading(true)

        try {
            const response = await api.register(formData)

            if (response.success) {
                setSuccess(true)
                setTimeout(() => navigate('/'), 3000)
            }
        } catch (err) {
            setError(err.message || 'Registration failed. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    if (success) {
        return (
            <div className="relative flex min-h-screen w-full flex-col bg-background-dark overflow-x-hidden items-center justify-center">
                <div className="w-full max-w-[480px] p-8">
                    <div className="bg-surface-dark rounded-xl shadow-xl border border-border-dark p-8 text-center animate-in zoom-in-95">
                        <div className="size-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-green-500 text-5xl">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Registration Successful!</h2>
                        <p className="text-text-muted mb-6">
                            Your account has been created. Please wait for admin approval before you can log in.
                        </p>
                        <p className="text-sm text-text-muted/70 mb-6">
                            You will be redirected to the login page in 3 seconds...
                        </p>
                        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-background-dark font-bold rounded-lg hover:bg-primary-hover transition-colors">
                            <span className="material-symbols-outlined">arrow_back</span>
                            Go to Login
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex min-h-screen w-full flex-col bg-background-dark overflow-x-hidden">
            {/* Header */}
            <header className="flex items-center justify-center border-b border-border-dark py-3 px-4">
                <div className="w-full max-w-7xl flex items-center justify-between">
                    <div className="flex items-center gap-3 text-gray-800">
                        <div className="size-8 flex items-center justify-center bg-primary/20 rounded-lg text-primary">
                            <span className="material-symbols-outlined text-[20px]">school</span>
                        </div>
                        <h2 className="text-gray-800 text-lg font-bold leading-tight tracking-tight">UKSW Workshops</h2>
                    </div>
                    <Link to="/" className="flex items-center justify-center rounded-lg h-9 px-4 bg-transparent hover:bg-border-dark text-gray-800 text-sm font-medium transition-colors gap-2">
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        <span className="hidden sm:inline">Back to Login</span>
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-lg flex flex-col gap-6 animate-in">
                    <div className="bg-surface-dark rounded-xl shadow-xl border border-border-dark overflow-hidden">
                        {/* Title */}
                        <div className="px-8 pt-8 pb-4 flex flex-col items-center border-b border-border-dark bg-background-dark/50">
                            <div className="size-16 mb-4 rounded-full bg-background-dark border border-border-dark flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-3xl">person_add</span>
                            </div>
                            <h1 className="text-2xl font-bold leading-tight mb-2 text-gray-800 text-center">
                                Create Account
                            </h1>
                            <p className="text-sm text-text-muted text-center">
                                Get started by creating your account
                            </p>
                        </div>

                        {/* Form */}
                        <div className="px-8 py-8">
                            {error && (
                                <div className="mb-6 p-3 bg-red-900/20 border border-red-500/30 text-red-400 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Enter your full name"
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 placeholder:text-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        Register as *
                                    </label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    >
                                        <option value="STUDENT">Student</option>
                                        <option value="MENTOR">Mentor</option>
                                    </select>
                                    <p className="text-xs text-text-muted/70 mt-1">
                                        {formData.role === 'STUDENT' ? 'Register as a student to enroll in workshops' : 'Register as a mentor to teach workshops'}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        {formData.role === 'STUDENT' ? 'Student ID (NIM) *' : 'Mentor ID (NIDN) *'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.nimNidn}
                                        onChange={(e) => setFormData({ ...formData, nimNidn: e.target.value })}
                                        placeholder={formData.role === 'STUDENT' ? 'e.g. 712021001' : 'e.g. 0123456789'}
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 placeholder:text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        Email *
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="student@uksw.edu"
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 placeholder:text-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        {formData.role === 'STUDENT' ? 'Major' : 'Department'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.major}
                                        onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                                        placeholder={formData.role === 'STUDENT' ? 'e.g. Computer Science' : 'e.g. Faculty of Information Technology'}
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 placeholder:text-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        Password *
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="At least 6 characters"
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 placeholder:text-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                                        Confirm Password *
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        placeholder="Re-enter password"
                                        className="w-full h-11 rounded-lg border border-border-dark bg-background-dark px-4 text-gray-800 placeholder:text-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="mt-4 flex w-full cursor-pointer items-center justify-center rounded-lg h-11 px-4 bg-primary text-background-dark text-sm font-bold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Creating Account...' : 'Create Account'}
                                </button>
                            </form>

                            <div className="mt-6 pt-6 border-t border-border-dark text-center">
                                <p className="text-sm text-text-muted">
                                    Already have an account?{' '}
                                    <Link to="/" className="text-primary font-semibold hover:text-primary-hover hover:underline transition-all">
                                        Sign in here
                                    </Link>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
