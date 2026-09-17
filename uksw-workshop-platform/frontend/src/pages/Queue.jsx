import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Header from '../components/Header'

export default function Queue() {
    const navigate = useNavigate()
    const [position, setPosition] = useState(0)
    const [studentsInFront, setStudentsInFront] = useState(0)
    const [estimatedMinutes, setEstimatedMinutes] = useState(0)
    const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 })

    const wsConnected = useRef(false)
    const pollInterval = useRef(null)

    useEffect(() => { //menunjukkan mekanisme pembaruan status antrean secara real-time pada halaman Waiting Room
        // Initial check: Check status first (don't join immediately to prevent resetting position)
        checkQueueStatus()

        // REAL-TIME AUTO-PROMOTION: WebSocket
        if (!wsConnected.current) {
            api.connectWebSocket((message) => {
                handleQueueUpdate(message)
                if (message.type === 'WS_CONNECTED') {
                    wsConnected.current = true
                    checkQueueStatus()
                }
            })
        }

        // FALLBACK POLLING: Check every 10 seconds just in case WebSocket fails
        pollInterval.current = setInterval(checkQueueStatus, 10000)

        return () => {
            api.disconnectWebSocket()
            wsConnected.current = false
            if (pollInterval.current) clearInterval(pollInterval.current)
        }
    }, [])

    // Countdown timer
    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => {
                let { hours, minutes, seconds } = prev
                if (seconds > 0) {
                    seconds--
                } else if (minutes > 0) {
                    minutes--
                    seconds = 59
                } else if (hours > 0) {
                    hours--
                    minutes = 59
                    seconds = 59
                }
                return { hours, minutes, seconds }
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [])

    const joinQueue = async () => { // menunjukkan proses antrean pada halaman Waiting Room dari sisi frontend.
        try {
            const response = await api.joinQueue()
            if (response.success) {
                // Position 0 means already active - redirect immediately
                if (response.queuePosition === 0) {
                    navigate('/workshop-selection')
                    return
                }
                updateQueueUI(response.queuePosition, response.estimatedWaitMinutes, response.estimatedWaitSeconds)
            }
        } catch (err) {
            console.error('Failed to join queue:', err)
        }
    }

    const checkQueueStatus = async () => { // kode 8: menunjukkan proses redirect berbasis WebSocket dan validasi akses katalog workshop pada sisi frontend.
        try {
            const response = await api.getQueueStatus()

            if (!response.inQueue) {
                // Not in queue - rejoin
                await joinQueue()
                return
            }

            // Check if user has been promoted to ACTIVE
            if (response.status === 'ACTIVE' || response.position === 0) {
                // Access granted! Redirect to course selection
                navigate('/workshop-selection')
                return
            }

            // Still waiting - update UI with active count from response
            updateQueueUI(
                response.position,
                response.estimatedWaitMinutes,
                response.estimatedWaitSeconds,
                response.activeCount || 0
            )
        } catch (err) {
            console.error('Failed to check queue:', err)
        }
    }

    const updateQueueUI = (pos, minutes, seconds, activeCount = 0) => {
        setPosition(pos)
        setEstimatedMinutes(minutes)

        // Calculate students in front: active users + waiting users before you
        const waiting = Math.max(0, pos - 1)
        setStudentsInFront(activeCount + waiting)

        // Update countdown with precision if available
        let totalSeconds = seconds
        if (totalSeconds === undefined || totalSeconds === null) {
            totalSeconds = minutes * 60
        }

        const hrs = Math.floor(totalSeconds / 3600)
        const mins = Math.floor((totalSeconds % 3600) / 60)
        const secs = totalSeconds % 60
        setCountdown({ hours: hrs, minutes: mins, seconds: secs })
    }

    const handleQueueUpdate = (message) => {
        // Support both nested and flat structures
        const data = message.payload || message;
        const type = message.type;

        if (type === 'QUEUE_POSITION') {
            updateQueueUI(
                data.position,
                data.estimatedWaitMinutes,
                data.estimatedWaitSeconds,
                data.activeCount || 0
            )
        } else if (type === 'ACCESS_GRANTED' || type === 'AUTO_PROMOTE') {
            // INSTANT AUTO-PROMOTION - redirect immediately via WebSocket
            console.log('🎉 Auto-promoted! Redirecting to workshop selection...')
            navigate('/workshop-selection')
        }
    }

    const formatNumber = (n) => String(n).padStart(2, '0')

    return (
        <div className="bg-background-dark min-h-screen flex flex-col text-gray-800">
            <Header title="UKSW Workshop Platform" />

            {/* Main Content */}
            <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
                <div className="w-full max-w-3xl flex flex-col gap-8 animate-in">
                    {/* Headline */}
                    <div className="text-center space-y-2">
                        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4 border border-primary/20">
                            <span className="material-symbols-outlined text-sm">hourglass_top</span>
                            Waiting Room
                        </span>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-800">
                            You are currently in line
                        </h1>
                        <p className="text-text-muted text-base max-w-md mx-auto">
                            We are experiencing high traffic. Thank you for your patience as we process workshop registration requests.
                        </p>
                    </div>

                    {/* Status Card */}
                    <div className="bg-surface-dark border border-border-dark rounded-2xl p-8 shadow-xl relative overflow-hidden group">
                        <div className="absolute -top-24 -right-24 size-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />

                        <div className="relative z-10 flex flex-col items-center gap-8">
                            {/* Queue Position - Hero Number with Running Man */}
                            <div className="flex flex-col items-center gap-3 text-center w-full">
                                <p className="text-text-muted font-medium uppercase tracking-widest text-xs">
                                    Your Queue Position
                                </p>
                                <div className="flex items-center justify-center gap-4">
                                    {/* Running Man SVG */}
                                    <div className="animate-running-man">
                                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="13.5" cy="4" r="2" fill="currentColor" className="text-primary" />
                                            <path d="M7.5 17.5L9.5 13L7 11.5L8.5 7L12 8.5L14 7.5L16.5 9L14 12L16 14.5L14.5 20"
                                                stroke="currentColor" className="text-primary" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                    <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold text-primary tracking-tighter drop-shadow-sm">
                                        #{position}
                                    </div>
                                </div>
                            </div>

                            {/* Loading Animation Bar with Students in Front badge */}
                            <div className="w-full max-w-lg space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-gray-800">Processing your request...</span>
                                    <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tabular-nums">
                                        {studentsInFront} in front
                                    </span>
                                </div>
                                <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 relative">
                                    <div className="absolute inset-0 overflow-hidden">
                                        <div className="h-full w-1/3 bg-primary rounded-full shadow-[0_0_10px_rgba(231,185,35,0.5)] animate-loading-bar"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Timer */}
                            <div className="grid grid-cols-3 gap-4 w-full max-w-md mt-2">
                                {[
                                    { value: countdown.hours, label: 'Hours' },
                                    { value: countdown.minutes, label: 'Minutes' },
                                    { value: countdown.seconds, label: 'Seconds' },
                                ].map(({ value, label }) => (
                                    <div key={label} className="flex flex-col gap-2">
                                        <div className="bg-background-dark border border-border-dark rounded-xl h-16 sm:h-20 flex items-center justify-center">
                                            <span className="text-2xl sm:text-3xl font-bold text-gray-800 tabular-nums">
                                                {formatNumber(value)}
                                            </span>
                                        </div>
                                        <span className="text-center text-xs text-text-muted uppercase tracking-wider">
                                            {label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Estimated Time & Warning */}
                    <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
                        <div className="flex items-center gap-2 text-gray-800 bg-surface-dark px-6 py-3 rounded-full border border-border-dark shadow-sm">
                            <span className="material-symbols-outlined text-primary text-xl">schedule</span>
                            <p className="text-base font-medium">
                                Estimated wait time: <span className="font-bold">~{estimatedMinutes} minutes</span>
                            </p>
                        </div>

                        {/* Warning */}
                        <div className="w-full bg-red-900/10 border border-red-500/20 rounded-xl p-4 flex gap-4 items-start">
                            <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                                <span className="material-symbols-outlined text-red-400">warning</span>
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-red-200">Do not refresh this page</h4>
                                <p className="text-sm text-red-300/80 leading-relaxed">
                                    Refreshing or closing the browser will result in losing your spot in the queue.
                                    You will be automatically redirected when it's your turn.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-border-dark py-6 px-6 lg:px-12 mt-auto bg-background-dark/50">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-text-muted">
                    <p>© 2026 UKSW. All rights reserved.</p>
                    <div className="flex gap-6">
                        <a className="hover:text-primary transition-colors" href="#">Help Desk</a>
                        <a className="hover:text-primary transition-colors" href="#">FAQ</a>
                        <a className="hover:text-primary transition-colors" href="#">Privacy Policy</a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
