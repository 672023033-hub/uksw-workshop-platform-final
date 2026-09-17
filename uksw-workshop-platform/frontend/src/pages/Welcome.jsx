import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import Header from '../components/Header'

export default function Welcome() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [isLoading, setIsLoading] = useState(false)

    const handleJoinQueue = async () => {
        setIsLoading(true)
        try {
            // WAR MODE: joinQueue API will automatically handle the logic
            // - If activeUsers < limit: user gets direct access (position 0)
            // - If activeUsers >= limit: user goes to Kafka queue (position > 0)
            const response = await api.joinQueue()

            if (response.success) {
                // Check response position
                if (response.queuePosition === 0) {
                    // Direct access! Slots available
                    navigate('/workshop-selection')
                } else {
                    // Queued via Kafka, go to queue page
                    navigate('/queue')
                }
            }
        } catch (err) {
            alert('Failed to join queue: ' + err.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-dark">
            <Header title="UKSW Workshop Platform" />

            {/* Main Content */}
            <main className="flex flex-1 flex-col justify-center items-center relative overflow-hidden px-4 md:px-0">
                {/* Background Gradient */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-gradient-to-b from-background-dark via-background-dark/95 to-background-dark z-10" />
                    <div className="h-full w-full bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-60" />
                </div>

                <div className="relative z-10 flex flex-col items-center justify-center max-w-[800px] text-center gap-8 py-20 animate-in">
                    {/* Welcome Text */}
                    <div className="flex flex-col gap-4 items-center">
                        <div className="inline-flex items-center gap-2 rounded-full bg-surface-dark border border-border-dark px-3 py-1 mb-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                            </span>
                            <span className="text-xs font-medium text-text-muted tracking-wide uppercase">
                                System Online
                            </span>
                        </div>

                        <h1 className="text-gray-800 text-5xl md:text-6xl lg:text-7xl font-black leading-tight tracking-tight">
                            Welcome back, <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary-mid to-primary">
                                {user?.name || 'Student'}
                            </span>
                        </h1>

                        <p className="text-text-muted text-lg md:text-xl font-light leading-relaxed max-w-[600px] mt-4">
                            The Learning Platform is on your hands. All systems are go. Prepare your schedule.
                        </p>
                    </div>

                    {/* Action Button */}
                    <div className="mt-8 flex flex-col items-center w-full">
                        <button
                            onClick={handleJoinQueue}
                            disabled={isLoading}
                            className="group relative flex w-full max-w-[320px] cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-primary h-16 px-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(0,102,179,0.4)] active:scale-[0.98] disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                            <span className="relative z-10 text-gray-800 text-lg font-bold tracking-tight uppercase flex items-center gap-3">
                                {isLoading ? 'Joining...' : "I'm ready to learn"}
                                <span className="material-symbols-outlined text-[24px] transition-transform group-hover:translate-x-1">
                                    arrow_forward
                                </span>
                            </span>
                        </button>

                        <div className="mt-6 flex items-center gap-6 text-text-muted">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                <span className="text-xs font-medium">24/7 Available</span>
                            </div>
                            <div className="w-1 h-1 rounded-full bg-border-dark" />
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">school</span>
                                <span className="text-xs font-medium">Always ready to help unlocking new skills</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 flex flex-col items-center justify-center gap-4 py-8 border-t border-border-dark bg-white text-center shadow-sm">
                <p className="text-text-muted text-sm">
                    Copyright © 2026 UKSW Workshop Platform. All rights reserved.
                </p>
            </footer>
        </div>
    )
}
