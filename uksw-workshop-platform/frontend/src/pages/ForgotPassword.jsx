import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'

const STEPS = { VERIFY: 'verify', PASSWORD: 'password', SUCCESS: 'success' }

function getPasswordStrength(pw) {
    if (!pw) return null
    let score = 0
    if (pw.length >= 8) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/4', textColor: 'text-red-400' }
    if (score === 2) return { label: 'Fair', color: 'bg-yellow-500', width: 'w-2/4', textColor: 'text-yellow-400' }
    if (score === 3) return { label: 'Good', color: 'bg-blue-400', width: 'w-3/4', textColor: 'text-blue-400' }
    return { label: 'Strong', color: 'bg-green-500', width: 'w-full', textColor: 'text-green-400' }
}

export default function ForgotPassword() {
    const navigate = useNavigate()
    const [step, setStep] = useState(STEPS.VERIFY)

    // Step 1
    const [nim, setNim] = useState('')
    const [email, setEmail] = useState('')
    const [nimError, setNimError] = useState('')
    const [emailError, setEmailError] = useState('')

    // Step 2
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPwd, setShowPwd] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    // ── Validators ────────────────────────────────────────────────────────────
    const validateNim = (value) => {
        if (!value.trim()) return 'NIM is required.'
        if (!/^\d+$/.test(value.trim())) return 'NIM must contain only numbers.'
        if (value.trim().length < 9) return 'NIM must be at least 9 digits.'
        return ''
    }

    const validateEmail = (value) => {
        if (!value.trim()) return 'Email is required.'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email address.'
        return ''
    }

    // ── Step 1 handler ────────────────────────────────────────────────────────
    const handleVerify = (e) => {
        e.preventDefault()
        const ne = validateNim(nim)
        const ee = validateEmail(email)
        setNimError(ne)
        setEmailError(ee)
        if (ne || ee) return
        setError('')
        setStep(STEPS.PASSWORD)
    }

    // ── Step 2 handler ────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.')
            return
        }

        setIsLoading(true)
        try {
            await api.forgotPassword(nim.trim(), email.trim(), newPassword)
            setStep(STEPS.SUCCESS)
        } catch (err) {
            if (err.message && err.message.includes('USER_NOT_FOUND')) {
                setError('No account found with that NIM and email. Please check your details.')
                setStep(STEPS.VERIFY)
            } else {
                setError(err.message || 'Something went wrong. Please try again.')
            }
        } finally {
            setIsLoading(false)
        }
    }

    const strength = getPasswordStrength(newPassword)
    const passwordsMatch = confirmPassword.length > 0 && confirmPassword === newPassword
    const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

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
                    <Link to="/" className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary transition-colors font-medium">
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Back to Login
                    </Link>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md flex flex-col gap-6 animate-in">

                    {/* Step Indicator */}
                    <div className="flex items-center gap-2 justify-center">
                        {[STEPS.VERIFY, STEPS.PASSWORD, STEPS.SUCCESS].map((s, i) => (
                            <div key={s} className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${step === s
                                    ? 'border-primary bg-primary text-background-dark'
                                    : (i < [STEPS.VERIFY, STEPS.PASSWORD, STEPS.SUCCESS].indexOf(step)
                                        ? 'border-primary bg-primary/20 text-primary'
                                        : 'border-border-dark text-text-muted')
                                    }`}>
                                    {i < [STEPS.VERIFY, STEPS.PASSWORD, STEPS.SUCCESS].indexOf(step)
                                        ? <span className="material-symbols-outlined text-[14px]">check</span>
                                        : i + 1}
                                </div>
                                {i < 2 && <div className={`w-8 h-0.5 ${i < [STEPS.VERIFY, STEPS.PASSWORD, STEPS.SUCCESS].indexOf(step) ? 'bg-primary' : 'bg-border-dark'}`} />}
                            </div>
                        ))}
                    </div>

                    <div className="bg-surface-dark rounded-xl shadow-xl border border-border-dark overflow-hidden">
                        {/* Icon header */}
                        <div className="px-8 pt-8 pb-4 flex flex-col items-center text-center">
                            <div className="size-16 mb-4 rounded-full bg-background-dark border border-border-dark flex items-center justify-center shadow-sm">
                                <span className={`material-symbols-outlined text-3xl ${step === STEPS.SUCCESS ? 'text-green-400' : 'text-primary'}`}>
                                    {step === STEPS.SUCCESS ? 'check_circle' : 'lock_reset'}
                                </span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800 mb-1">
                                {step === STEPS.VERIFY && 'Verify Identity'}
                                {step === STEPS.PASSWORD && 'New Password'}
                                {step === STEPS.SUCCESS && 'Request Submitted!'}
                            </h1>
                            <p className="text-sm text-text-muted max-w-[280px] leading-relaxed">
                                {step === STEPS.VERIFY && 'Enter your NIM and email address to verify your account.'}
                                {step === STEPS.PASSWORD && 'Enter your new password. A mentor will approve your request.'}
                                {step === STEPS.SUCCESS && 'Your password reset request has been sent for mentor approval. You can login with your new password after approval.'}
                            </p>
                        </div>

                        <div className="px-8 pb-10">
                            {error && (
                                <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 rounded-lg text-sm flex items-start gap-2">
                                    <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
                                    {error}
                                </div>
                            )}

                            {/* STEP 1: Verify NIM + Email */}
                            {step === STEPS.VERIFY && (
                                <form onSubmit={handleVerify} className="flex flex-col gap-5" noValidate>
                                    {/* NIM Field */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">NIM (Student ID)</label>
                                        <div className="relative group">
                                            <div className={`absolute left-3 top-3 transition-colors ${nimError ? 'text-red-400' : 'text-text-muted group-focus-within:text-primary'}`}>
                                                <span className="material-symbols-outlined text-[20px]">badge</span>
                                            </div>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={nim}
                                                onChange={(e) => {
                                                    setNim(e.target.value)
                                                    if (nimError) setNimError(validateNim(e.target.value))
                                                }}
                                                onBlur={() => setNimError(validateNim(nim))}
                                                placeholder="Enter your NIM (e.g. 672019001)"
                                                className={`w-full h-11 rounded-lg border bg-background-dark pl-10 pr-4 text-gray-800 placeholder:text-text-muted/50 focus:outline-none transition-all font-medium text-sm ${nimError
                                                    ? 'border-red-500 focus:ring-1 focus:ring-red-500'
                                                    : 'border-border-dark focus:border-primary focus:ring-1 focus:ring-primary'
                                                    }`}
                                            />
                                        </div>
                                        {nimError && (
                                            <p className="text-red-400 text-xs flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px]">error</span>
                                                {nimError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Email Field */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Email Address</label>
                                        <div className="relative group">
                                            <div className={`absolute left-3 top-3 transition-colors ${emailError ? 'text-red-400' : 'text-text-muted group-focus-within:text-primary'}`}>
                                                <span className="material-symbols-outlined text-[20px]">email</span>
                                            </div>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => {
                                                    setEmail(e.target.value)
                                                    if (emailError) setEmailError(validateEmail(e.target.value))
                                                }}
                                                onBlur={() => setEmailError(validateEmail(email))}
                                                placeholder="Enter your registered email"
                                                className={`w-full h-11 rounded-lg border bg-background-dark pl-10 pr-4 text-gray-800 placeholder:text-text-muted/50 focus:outline-none transition-all font-medium text-sm ${emailError
                                                    ? 'border-red-500 focus:ring-1 focus:ring-red-500'
                                                    : 'border-border-dark focus:border-primary focus:ring-1 focus:ring-primary'
                                                    }`}
                                            />
                                        </div>
                                        {emailError && (
                                            <p className="text-red-400 text-xs flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px]">error</span>
                                                {emailError}
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-lg h-11 px-4 bg-primary text-background-dark text-sm font-bold hover:bg-yellow-400 active:scale-[0.98] transition-all shadow-md"
                                    >
                                        Verify Account
                                        <span className="material-symbols-outlined text-[18px] ml-2">arrow_forward</span>
                                    </button>
                                </form>
                            )}

                            {/* STEP 2: Enter new password */}
                            {step === STEPS.PASSWORD && (
                                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-[18px]">person_check</span>
                                        <div>
                                            <p className="text-xs text-text-muted">Verified account</p>
                                            <p className="text-sm font-bold text-gray-800">{nim}</p>
                                        </div>
                                        <button type="button" onClick={() => setStep(STEPS.VERIFY)} className="ml-auto text-text-muted hover:text-primary text-xs hover:underline">
                                            Change
                                        </button>
                                    </div>

                                    {/* New Password */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">New Password</label>
                                        <div className="relative group">
                                            <div className="absolute left-3 top-3 text-text-muted group-focus-within:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-[20px]">lock</span>
                                            </div>
                                            <input
                                                type={showPwd ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="At least 6 characters"
                                                className="w-full h-11 rounded-lg border border-border-dark bg-background-dark pl-10 pr-10 text-gray-800 placeholder:text-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
                                            />
                                            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-text-muted hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-[20px]">{showPwd ? 'visibility' : 'visibility_off'}</span>
                                            </button>
                                        </div>

                                        {/* Password Strength Bar */}
                                        {newPassword.length > 0 && strength && (
                                            <div className="flex flex-col gap-1">
                                                <div className="h-1.5 bg-border-dark rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                                                </div>
                                                <p className={`text-xs font-medium ${strength.textColor}`}>
                                                    Password strength: {strength.label}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Confirm Password */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">Confirm New Password</label>
                                        <div className="relative group">
                                            <div className={`absolute left-3 top-3 transition-colors ${passwordsMatch ? 'text-green-400' : passwordsMismatch ? 'text-red-400' : 'text-text-muted group-focus-within:text-primary'}`}>
                                                <span className="material-symbols-outlined text-[20px]">
                                                    lock
                                                </span>
                                            </div>
                                            <input
                                                type={showConfirm ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Repeat your new password"
                                                className={`w-full h-11 rounded-lg border bg-background-dark pl-10 pr-10 text-gray-800 placeholder:text-text-muted/50 focus:outline-none transition-all font-medium text-sm ${passwordsMatch
                                                    ? 'border-green-500 focus:ring-1 focus:ring-green-500'
                                                    : passwordsMismatch
                                                        ? 'border-red-500 focus:ring-1 focus:ring-red-500'
                                                        : 'border-border-dark focus:border-primary focus:ring-1 focus:ring-primary'
                                                    }`}
                                            />
                                            <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-3 text-text-muted hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-[20px]">{showConfirm ? 'visibility' : 'visibility_off'}</span>
                                            </button>
                                            {/* Match / Mismatch Icon */}
                                            {passwordsMatch && (
                                                <div className="absolute right-10 top-3 text-green-400">
                                                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                                </div>
                                            )}
                                        </div>
                                        {passwordsMismatch && (
                                            <p className="text-red-400 text-xs flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px]">error</span>
                                                Passwords do not match.
                                            </p>
                                        )}
                                        {passwordsMatch && (
                                            <p className="text-green-400 text-xs flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                                Passwords match!
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading || passwordsMismatch}
                                        className="mt-2 flex w-full cursor-pointer items-center justify-center rounded-lg h-11 px-4 bg-primary text-background-dark text-sm font-bold hover:bg-yellow-400 active:scale-[0.98] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? 'Submitting...' : 'Submit Reset Request'}
                                        {!isLoading && <span className="material-symbols-outlined text-[18px] ml-2">send</span>}
                                    </button>
                                </form>
                            )}

                            {/* STEP 3: Success */}
                            {step === STEPS.SUCCESS && (
                                <div className="flex flex-col items-center gap-6 text-center mt-2">
                                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl w-full text-left">
                                        <div className="flex items-start gap-3">
                                            <span className="material-symbols-outlined text-green-400 text-[22px] mt-0.5">info</span>
                                            <div>
                                                <p className="text-green-400 font-bold text-sm mb-1">What happens next?</p>
                                                <ul className="text-text-muted text-xs space-y-1 leading-relaxed">
                                                    <li>• Your mentor will review your request</li>
                                                    <li>• If approved, your password will be updated</li>
                                                    <li>• You can then log in with your new password</li>
                                                    <li>• If rejected, submit a new request or contact support</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/')}
                                        className="flex w-full items-center justify-center rounded-lg h-11 px-4 bg-primary text-background-dark text-sm font-bold hover:bg-yellow-400 active:scale-[0.98] transition-all shadow-md gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">login</span>
                                        Back to Login
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-center">
                        <p className="text-xs text-text-muted">© 2024 Satya Wacana Christian University</p>
                    </div>
                </div>
            </main>
        </div>
    )
}
