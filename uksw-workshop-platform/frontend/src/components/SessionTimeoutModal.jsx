import { useEffect, useState } from 'react'

export default function SessionTimeoutModal({ show, onClose }) {
    const [countdown, setCountdown] = useState(5)

    useEffect(() => {
        if (show) {
            setCountdown(5)
            const interval = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(interval)
                        onClose()
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)

            return () => clearInterval(interval)
        }
    }, [show, onClose])

    if (!show) return null

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] animate-in fade-in" />

            {/* Modal */}
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                <div className="bg-surface-dark border border-red-500/50 rounded-2xl shadow-2xl shadow-red-500/20 max-w-md w-full animate-in zoom-in-95 slide-in-from-bottom-4">
                    {/* Icon */}
                    <div className="pt-8 pb-4 flex justify-center">
                        <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500 flex items-center justify-center">
                            <span className="material-symbols-outlined text-red-500 text-5xl">
                                schedule
                            </span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-8 pb-8 text-center">
                        <h2 className="text-2xl font-bold text-white mb-3">
                            Session Timeout
                        </h2>
                        <p className="text-text-muted mb-6">
                            Your login session has expired due to inactivity. You will be redirected to the login page.
                        </p>

                        {/* Countdown */}
                        <div className="mb-6">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                                <span className="material-symbols-outlined text-red-500 animate-pulse">
                                    timer
                                </span>
                                <span className="text-red-500 font-bold text-lg">
                                    {countdown}s
                                </span>
                            </div>
                        </div>

                        {/* Button */}
                        <button
                            onClick={onClose}
                            className="w-full px-6 py-3 bg-primary hover:bg-primary-dark text-surface-darker font-bold rounded-lg transition-colors"
                        >
                            Login Again
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes zoom-in-95 {
                    0% {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                @keyframes slide-in-from-bottom-4 {
                    0% {
                        transform: translateY(1rem);
                    }
                    100% {
                        transform: translateY(0);
                    }
                }

                .animate-in {
                    animation: fade-in 0.2s ease-out, zoom-in-95 0.3s ease-out, slide-in-from-bottom-4 0.3s ease-out;
                }

                @keyframes fade-in {
                    0% {
                        opacity: 0;
                    }
                    100% {
                        opacity: 1;
                    }
                }
            `}</style>
        </>
    )
}
