import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import SeatMap from '../components/SeatMap'

export default function WorkshopSelection() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [workshops, setWorkshops] = useState([])
    const [myWorkshops, setMyWorkshops] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [totalCredits, setTotalCredits] = useState(0)
    const [maxCredits, setMaxCredits] = useState(24)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedWorkshopType, setSelectedWorkshopType] = useState('all')
    const [notification, setNotification] = useState(null)
    const [dropId, setDropId] = useState(null)
    const [selectedWorkshopForSeat, setSelectedWorkshopForSeat] = useState(null)
    const [selectedSeat, setSelectedSeat] = useState(null)
    const [showSessionExpired, setShowSessionExpired] = useState(false)
    const [creditWarning, setCreditWarning] = useState(null) // { workshopName, workshopCredits, totalAfter }
    const [showMobileFilters, setShowMobileFilters] = useState(false)
    const [showMobileCart, setShowMobileCart] = useState(false)

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type })
        setTimeout(() => setNotification(null), 3000)
    }

    const [timeLeft, setTimeLeft] = useState(0)

    useEffect(() => {
        loadWorkshops()
        api.connectWebSocket(handleQuotaUpdate)

        // Timer countdown
        const timerInterval = setInterval(() => {
            setTimeLeft(prev => {
                const newTime = Math.max(0, prev - 1)
                // Check if session expired
                if (newTime === 0 && prev > 0) {
                    setShowSessionExpired(true)
                }
                return newTime
            })
        }, 1000)

        return () => {
            clearInterval(timerInterval)
            api.disconnectWebSocket()
        }
    }, [])

    const loadWorkshops = async () => { // kode 8:menunjukkan proses redirect berbasis WebSocket dan validasi akses katalog workshop pada sisi frontend.
        setIsLoading(true)
        try {
            // Check Queue Status first
            const queueStatus = await api.getQueueStatus()

            // Strict enforcement: Must be in queue AND active
            if (!queueStatus.inQueue || queueStatus.status === 'WAITING') {
                navigate('/queue')
                return
            }

            // Set initial time
            if (queueStatus.remainingSeconds) {
                setTimeLeft(queueStatus.remainingSeconds)
            }

            const [availableRes, myRes] = await Promise.all([
                api.getAvailableWorkshops(),
                api.getMyWorkshops()
            ])

            setWorkshops(availableRes.workshops || availableRes.courses || [])
            setMyWorkshops(myRes.workshops || myRes.courses || [])
            setTotalCredits(myRes.totalCredits || 0)
            setMaxCredits(myRes.maxCredits || 24)
        } catch (err) {
            console.error('Failed to load workshops:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleQuotaUpdate = (message) => {
        if (message.type === 'QUOTA_UPDATE') {
            setWorkshops(prev => prev.map(workshop =>
                workshop.sessionId === message.classId || workshop.classId === message.classId
                    ? { ...workshop, enrolled: message.enrolled }
                    : workshop
            ))
        }
    }

    const handleAddWorkshop = async (sessionId, requiresSeat) => {
        // Validate sessionId
        if (!sessionId || sessionId.trim() === '') {
            showNotification('Invalid workshop session. Please try again.', 'error')
            return
        }

        // Find the workshop to check credits and capacity
        const workshop = workshops.find(w => (w.sessionId || w.classId) === sessionId)
        if (!workshop) {
            showNotification('Workshop not found', 'error')
            return
        }

        // Check if workshop is full
        if (workshop.enrolled >= workshop.quota) {
            showNotification('This workshop is already full. No seats available.', 'error')
            return
        }

        // Check registration period
        // Backend returns "YYYY-MM-DDTHH:MI" (UTC, no timezone suffix) — append 'Z' so JS parses as UTC
        const now = new Date()
        const regStart = workshop.registrationStart ? new Date(workshop.registrationStart + 'Z') : null
        const regEnd = workshop.registrationEnd ? new Date(workshop.registrationEnd + 'Z') : null

        if (regStart && now < regStart) {
            showNotification('Registration for this workshop has not opened yet.', 'error')
            return
        }
        if (regEnd && now > regEnd) {
            showNotification('Registration for this workshop is closed.', 'error')
            return
        }

        // Check credit limit
        const newTotal = totalCredits + (workshop.credits || 0)
        if (newTotal > maxCredits) {
            setCreditWarning({
                workshopName: workshop.name,
                workshopCredits: workshop.credits,
                totalAfter: newTotal,
            })
            return
        }

        if (requiresSeat) {
            // Open seat selection modal
            setSelectedWorkshopForSeat(workshop)
        } else {
            // Direct enrollment without seat
            await enrollWorkshopDirect(sessionId)
        }
    }

    const enrollWorkshopDirect = async (sessionId, seatId = null) => {
        try {
            const response = await api.enrollWorkshop(sessionId, seatId)
            if (response.success) {
                setTotalCredits(response.totalCredits)
                showNotification('Workshop enrolled successfully')
                loadWorkshops()
                setSelectedWorkshopForSeat(null)
                setSelectedSeat(null)
            }
        } catch (err) {
            showNotification(err.message, 'error')
        }
    }

    const handleSeatSelected = (seat) => {
        setSelectedSeat(seat)
    }

    const handleCancelSeatSelection = async () => {
        // Release the reserved seat if user closes modal without confirming
        if (selectedSeat) {
            try {
                await api.releaseSeat(selectedSeat.id)
            } catch (err) {
                console.error('Failed to release seat on cancel:', err)
            }
        }
        setSelectedWorkshopForSeat(null)
        setSelectedSeat(null)
    }

    const confirmEnrollmentWithSeat = async () => {
        if (!selectedWorkshopForSeat || !selectedSeat) return
        await enrollWorkshopDirect(selectedWorkshopForSeat.sessionId || selectedWorkshopForSeat.classId, selectedSeat.id)
    }

    const handleDropWorkshop = (enrollmentId, workshop) => {
        // Client-side check for registration status
        if (workshop) {
            const now = new Date()
            // Backend returns "YYYY-MM-DDTHH:MI" (UTC, no timezone suffix) — append 'Z' so JS parses as UTC
            const regEnd = workshop.registrationEnd ? new Date(workshop.registrationEnd + 'Z') : null

            if (regEnd && now > regEnd) {
                showNotification('Registration has closed. You cannot drop this workshop.', 'error')
                return
            }
        }
        setDropId(enrollmentId)
    }

    const confirmDrop = async () => {
        if (!dropId) return

        try {
            const response = await api.dropWorkshop(dropId)
            if (response.success) {
                showNotification('Workshop dropped successfully')
                loadWorkshops()
            }
        } catch (err) {
            // Handle specific backend error codes if they bubble up, mostly standard message
            if (err.message === "REGISTRATION_CLOSED") {
                showNotification('Registration has closed. You cannot drop this workshop.', 'error')
            } else {
                showNotification(err.message, 'error')
            }
        } finally {
            setDropId(null)
        }
    }

    const handleFinish = () => {
        // Navigate to summary page
        navigate('/success')
    }

    const handleSessionExpiredClose = async () => {
        await logout()
        navigate('/login')
    }

    // Merge workshops with my enrolled workshops
    const enrichedWorkshops = workshops.map(workshop => {
        const enrolled = myWorkshops.find(m => m.session_id === (workshop.sessionId || workshop.classId))
        return { ...workshop, isEnrolled: !!enrolled, enrollmentId: enrolled?.id }
    })

    const filteredWorkshops = enrichedWorkshops.filter(workshop => {
        const matchesSearch = workshop.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            workshop.code?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesType = selectedWorkshopType === 'all' ||
            workshop.workshopType?.toLowerCase() === selectedWorkshopType.toLowerCase()
        return matchesSearch && matchesType
    })

    if (isLoading) {
        return (
            <div className="bg-background-dark min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" text="Loading workshops..." />
            </div>
        )
    }

    return (
        <div className="bg-background-dark min-h-screen flex flex-col overflow-hidden">
            <Header title="UKSW Workshop Platform" />

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-24 right-6 z-50 px-6 py-4 rounded-xl shadow-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${notification.type === 'error'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-green-50 border-green-300 text-green-700'
                    }`}>
                    <span className="material-symbols-outlined">
                        {notification.type === 'error' ? 'error' : 'check_circle'}
                    </span>
                    <span className="font-bold">{notification.message}</span>
                </div>
            )}

            {/* Credit Limit Exceeded Modal */}
            {creditWarning && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white border border-amber-300 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-amber-100 rounded-xl">
                                <span className="material-symbols-outlined text-amber-500 text-3xl">warning</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Credit Limit Exceeded</h3>
                                <p className="text-amber-600 text-xs">Cannot add this workshop</p>
                            </div>
                        </div>
                        <div className="bg-primary-light rounded-xl p-4 mb-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Workshop:</span>
                                <span className="text-gray-800 font-bold">{creditWarning.workshopName}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Workshop Credits:</span>
                                <span className="text-amber-600 font-bold">{creditWarning.workshopCredits} Credits</span>
                            </div>
                            <div className="h-px bg-border-dark my-1"></div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Your Current Credits:</span>
                                <span className="text-gray-800 font-bold">{totalCredits} Credits</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Would Become:</span>
                                <span className="text-red-500 font-bold">{creditWarning.totalAfter} Credits</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Your Max Limit:</span>
                                <span className="text-primary font-bold">{maxCredits} Credits</span>
                            </div>
                        </div>
                        <p className="text-text-muted text-xs mb-4 leading-relaxed">
                            Adding <strong className="text-gray-800">{creditWarning.workshopName}</strong> would put you at <strong className="text-red-500">{creditWarning.totalAfter}</strong> credits, exceeding your limit of <strong className="text-primary">{maxCredits}</strong> credits.
                        </p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setCreditWarning(null)}
                                className="px-6 py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-hover transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Drop Confirmation Modal */}
            {dropId && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white border border-border-dark p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-red-50 rounded-xl">
                                <span className="material-symbols-outlined text-red-500 text-3xl">warning</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">Drop Workshop?</h3>
                        </div>
                        <p className="text-text-muted mb-6 leading-relaxed">
                            Are you sure you want to remove this workshop from your schedule? <br />
                            <span className="text-xs opacity-70 mt-2 block">If the workshop fills up, you might not be able to re-enroll.</span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDropId(null)}
                                className="px-4 py-2 rounded-lg text-text-muted hover:text-gray-800 transition-colors font-bold text-sm border border-border-dark hover:border-primary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDrop}
                                className="px-4 py-2 rounded-lg bg-red-50 border border-red-300 text-red-600 hover:bg-red-500 hover:text-white font-bold transition-colors text-sm flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">delete</span>
                                Drop Workshop
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Session Expired Modal */}
            {showSessionExpired && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white border border-red-200 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-red-50 rounded-xl">
                                <span className="material-symbols-outlined text-red-500 text-4xl">schedule</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">Session Expired</h3>
                        </div>
                        <p className="text-text-muted mb-6 leading-relaxed">
                            Your selection time has ended. Please log in again to continue.
                        </p>
                        <div className="flex justify-end">
                            <button
                                onClick={handleSessionExpiredClose}
                                className="px-6 py-3 rounded-lg bg-primary hover:bg-primary-hover text-white font-bold transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined">login</span>
                                Go to Login
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Seat Selection Modal */}
            {selectedWorkshopForSeat && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in overflow-y-auto">
                    <div className="bg-white border border-border-dark p-6 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 my-8 animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-800">{selectedWorkshopForSeat.name}</h3>
                                <p className="text-text-muted text-sm">{selectedWorkshopForSeat.code}</p>
                            </div>
                            <button
                                onClick={handleCancelSeatSelection}
                                className="text-text-muted hover:text-gray-800 hover:bg-primary-light rounded-lg p-1 transition-colors"
                            >
                                <span className="material-symbols-outlined text-3xl">close</span>
                            </button>
                        </div>

                        {(selectedWorkshopForSeat.sessionId || selectedWorkshopForSeat.classId) ? (
                            <SeatMap
                                workshopSessionId={selectedWorkshopForSeat.sessionId || selectedWorkshopForSeat.classId}
                                onSeatSelected={handleSeatSelected}
                            />
                        ) : (
                            <div className="text-center py-12 text-red-500">
                                <span className="material-symbols-outlined text-6xl mb-4">error</span>
                                <p>Invalid workshop session. Please close and try again.</p>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={handleCancelSeatSelection}
                                className="px-6 py-3 rounded-lg text-text-muted hover:text-gray-800 border border-border-dark hover:border-primary transition-colors font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmEnrollmentWithSeat}
                                disabled={!selectedSeat}
                                className="px-6 py-3 rounded-lg bg-primary hover:bg-primary-hover text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined">check_circle</span>
                                Confirm Enrollment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* Mobile Filter Overlay */}
                {showMobileFilters && (
                    <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setShowMobileFilters(false)} />
                )}

                {/* Left Sidebar - Filters */}
                <aside className={`
                    fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-border-dark p-6 flex flex-col gap-7 transition-transform duration-300 lg:relative lg:translate-x-0 lg:flex lg:z-auto shadow-lg lg:shadow-none
                    ${showMobileFilters ? 'translate-x-0' : '-translate-x-full'}
                `}>
                    <div className="flex justify-between items-center lg:hidden">
                        <h3 className="font-bold text-gray-800 text-lg">Filters</h3>
                        <button onClick={() => setShowMobileFilters(false)} className="text-text-muted hover:text-gray-800">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Search</label>
                        <div className="flex w-full items-stretch rounded-lg bg-primary-light border border-border-dark focus-within:border-primary transition-colors">
                            <div className="flex items-center justify-center pl-3 text-text-muted">
                                <span className="material-symbols-outlined">search</span>
                            </div>
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-transparent border-none text-gray-800 focus:ring-0 placeholder:text-text-muted/60 py-3 text-sm"
                                placeholder="Workshop name or code..."
                            />
                        </div>
                    </div>

                    {/* Workshop Type Filter */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Type</label>
                            <span onClick={() => setSelectedWorkshopType('all')} className="text-xs text-primary cursor-pointer hover:underline font-semibold">Clear</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { name: 'Technical', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', activeBg: 'bg-blue-100', activeBorder: 'border-blue-500' },
                                { name: 'Creative', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', activeBg: 'bg-purple-100', activeBorder: 'border-purple-500' },
                                { name: 'Business', bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', activeBg: 'bg-green-100', activeBorder: 'border-green-500' },
                                { name: 'Leadership', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', activeBg: 'bg-orange-100', activeBorder: 'border-orange-500' },
                            ].map(type => (
                                <button
                                    key={type.name}
                                    onClick={() => setSelectedWorkshopType(type.name)}
                                    className={`px-2 py-2 rounded-lg border text-xs font-bold transition-all ${selectedWorkshopType === type.name
                                        ? `${type.activeBg} ${type.text} ${type.activeBorder}`
                                        : `bg-white border-border-dark text-text-muted hover:${type.bg} hover:${type.text}`
                                        }`}
                                >
                                    {type.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 lg:p-8 flex flex-col gap-6 overflow-y-auto">
                    {/* Page Header */}
                    <div className="flex flex-wrap justify-between items-end gap-4 border-b border-border-dark pb-5">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-primary text-xs font-bold tracking-widest uppercase">
                                <span className="material-symbols-outlined text-[18px]">school</span>
                                <span>Workshop Series 2026</span>
                            </div>
                            <h1 className="text-gray-800 text-3xl lg:text-4xl font-black leading-tight tracking-tight">
                                Workshop Registration
                            </h1>
                            <p className="text-text-muted text-sm">Select workshops for this session</p>

                            <button
                                onClick={() => setShowMobileFilters(true)}
                                className="lg:hidden mt-2 flex items-center gap-2 self-start px-4 py-2 bg-white border border-border-dark rounded-lg text-sm font-bold text-primary hover:border-primary transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">tune</span>
                                Filters &amp; Search
                            </button>
                        </div>

                        {/* Time + Credits Counter */}
                        <div className="flex items-center gap-1 bg-white px-4 py-2 rounded-xl border border-border-dark shadow-sm">
                            <div className="flex flex-col items-center px-3 border-r border-border-dark">
                                <span className="text-[9px] uppercase text-text-muted font-bold tracking-widest">Time Left</span>
                                <span className={`font-mono font-black text-xl ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
                                    {formatTime(timeLeft)}
                                </span>
                            </div>
                            <div className="flex flex-col items-end px-3">
                                <span className="text-[9px] uppercase text-text-muted font-bold tracking-widest">Credits</span>
                                <span className="text-primary font-black text-xl">{totalCredits}<span className="text-text-muted font-normal text-sm">/{maxCredits}</span></span>
                            </div>
                        </div>
                    </div>

                    {/* Workshop Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-5 mb-24">
                        {filteredWorkshops.map(workshop => (
                            <WorkshopCard
                                key={workshop.sessionId || workshop.classId}
                                workshop={workshop}
                                onAdd={() => handleAddWorkshop(workshop.sessionId || workshop.classId, workshop.seatsEnabled)}
                                onDrop={() => handleDropWorkshop(workshop.enrollmentId, workshop)}
                            />
                        ))}
                    </div>

                    {filteredWorkshops.length === 0 && (
                        <div className="text-center py-16 text-text-muted">
                            <span className="material-symbols-outlined text-6xl mb-4 text-border-dark block">search_off</span>
                            <p className="font-semibold text-gray-500">No workshops found matching your criteria.</p>
                        </div>
                    )}
                </main>

                {/* Right Sidebar - My Workshops */}
                <aside className="hidden lg:flex w-88 bg-white border-l border-border-dark flex-col z-40 sticky top-0 h-full shadow-sm" style={{width:'360px'}}>
                    {/* Sidebar Header */}
                    <div className="p-5 border-b border-border-dark bg-primary-light/40">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-primary text-[18px]">assignment_turned_in</span>
                                </div>
                                <h3 className="text-base font-bold text-gray-800">My Selection</h3>
                            </div>
                            <span className="text-xs bg-primary text-white px-2.5 py-1 rounded-full font-bold shadow-sm">
                                {myWorkshops.length} {myWorkshops.length === 1 ? 'Workshop' : 'Workshops'}
                            </span>
                        </div>
                        {/* Credit bar */}
                        <div className="flex justify-between text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                            <span>Credits Used</span>
                            <span className={totalCredits > maxCredits ? 'text-red-500' : 'text-primary'}>
                                {totalCredits} / {maxCredits}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-border-dark rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${totalCredits > maxCredits ? 'bg-red-500' : 'bg-primary'}`}
                                style={{ width: `${Math.min((totalCredits / maxCredits) * 100, 100)}%` }}
                            />
                        </div>
                    </div>

                    {/* Workshop List */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                        {myWorkshops.map(workshop => (
                            <div key={workshop.id} className="group rounded-xl bg-white border border-border-dark hover:border-primary/50 hover:shadow-md transition-all duration-200 overflow-hidden">
                                {/* Blue top accent bar */}
                                <div className="h-1 bg-gradient-to-r from-primary to-primary-mid" />
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-[9px] font-bold text-primary uppercase tracking-wider">
                                                {workshop.workshopCode || workshop.courseCode}
                                            </span>
                                            <h4 className="text-sm font-bold text-gray-800 leading-tight line-clamp-2 mt-0.5">
                                                {workshop.workshopName || workshop.courseName}
                                            </h4>
                                        </div>
                                        <div className="flex-shrink-0 flex items-center gap-1 bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg">
                                            <span className="material-symbols-outlined text-primary text-[12px]">school</span>
                                            <span className="text-primary text-xs font-black">{workshop.credits}</span>
                                        </div>
                                    </div>

                                    {workshop.mentor && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
                                            <span className="material-symbols-outlined text-[13px]">co_present</span>
                                            <span className="truncate">{workshop.mentor}</span>
                                        </div>
                                    )}
                                    {workshop.schedule && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-1">
                                            <span className="material-symbols-outlined text-[13px]">schedule</span>
                                            <span className="truncate">{workshop.schedule}</span>
                                        </div>
                                    )}
                                    {workshop.seatNumber && (
                                        <div className="flex items-center gap-1.5 text-[11px] text-primary mb-1">
                                            <span className="material-symbols-outlined text-[13px]">event_seat</span>
                                            <span>Seat {workshop.seatNumber}</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleDropWorkshop(workshop.id, workshop)}
                                        className="mt-2 text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1 uppercase tracking-wider font-bold transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">remove_circle</span> Remove
                                    </button>
                                </div>
                            </div>
                        ))}

                        {myWorkshops.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center py-12">
                                <div className="w-16 h-16 rounded-2xl bg-primary-light border border-border-dark flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-primary text-3xl">add_circle</span>
                                </div>
                                <p className="text-text-muted text-sm font-semibold">No workshops selected</p>
                                <p className="text-text-muted/60 text-xs mt-1">Add workshops from the grid</p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Footer */}
                    <div className="p-4 border-t border-border-dark bg-primary-light/30">
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <div className="bg-white border border-border-dark rounded-xl p-3 text-center">
                                <p className="text-[10px] uppercase text-text-muted font-bold tracking-widest mb-0.5">Workshops</p>
                                <p className="text-2xl font-black text-gray-800">{myWorkshops.length}</p>
                            </div>
                            <div className="bg-white border border-border-dark rounded-xl p-3 text-center">
                                <p className="text-[10px] uppercase text-text-muted font-bold tracking-widest mb-0.5">Credits</p>
                                <p className={`text-2xl font-black ${totalCredits > maxCredits ? 'text-red-500' : 'text-primary'}`}>{totalCredits}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleFinish}
                            disabled={myWorkshops.length === 0}
                            className="w-full bg-primary hover:bg-primary-hover text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            <span className="material-symbols-outlined font-bold text-[18px]">description</span>
                            CONFIRM SELECTION
                        </button>
                        <p className="text-[10px] text-center text-text-muted/60 mt-3 leading-relaxed">
                            By confirming, you agree to the workshop terms.
                        </p>
                    </div>
                </aside>
            </div>

            {/* Mobile Cart Overlay */}
            {showMobileCart && (
                <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end sm:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowMobileCart(false)}>
                    <div className="bg-white w-full sm:max-w-md sm:rounded-2xl sm:mx-4 border-t sm:border border-border-dark shadow-2xl animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-border-dark flex items-center justify-between bg-primary-light/40">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">assignment_turned_in</span>
                                <h3 className="text-lg font-bold text-gray-800">My Workshops</h3>
                            </div>
                            <button onClick={() => setShowMobileCart(false)} className="text-text-muted hover:text-gray-800">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-3">
                            {myWorkshops.map(workshop => (
                                <div key={workshop.id} className="p-3 rounded-xl bg-primary-light/30 border border-border-dark">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-bold text-primary uppercase">{workshop.workshopCode || workshop.courseCode}</span>
                                        <span className="text-[10px] font-bold text-text-muted">{workshop.credits} Credits</span>
                                    </div>
                                    <h4 className="text-sm font-semibold text-gray-800 mb-2">{workshop.workshopName || workshop.courseName}</h4>
                                    {workshop.seatNumber && (
                                        <div className="text-[10px] text-primary mb-2">Seat: {workshop.seatNumber}</div>
                                    )}
                                    <button
                                        onClick={() => handleDropWorkshop(workshop.id, workshop)}
                                        className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1 uppercase tracking-wider font-bold"
                                    >
                                        <span className="material-symbols-outlined text-xs">close</span> Remove
                                    </button>
                                </div>
                            ))}

                            {myWorkshops.length === 0 && (
                                <div className="text-center py-8 text-text-muted opacity-60">
                                    <p>No workshops selected yet.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-primary-light/30 border-t border-border-dark">
                            <button
                                onClick={handleFinish}
                                disabled={myWorkshops.length === 0}
                                className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
                            >
                                Submit Registration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Bottom Bar */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border-dark p-4 flex items-center justify-between z-50 pb-safe shadow-lg">
                <div className="flex flex-col cursor-pointer" onClick={() => setShowMobileCart(true)}>
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase text-text-muted font-bold">Selected</span>
                        <span className="material-symbols-outlined text-[14px] text-primary">expand_less</span>
                    </div>
                    <span className="text-primary font-bold text-sm">{totalCredits} Credits ({myWorkshops.length} Workshops)</span>
                </div>
                <button
                    onClick={handleFinish}
                    disabled={myWorkshops.length === 0}
                    className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors shadow-sm"
                >
                    Detail My Workshop
                </button>
            </div>
        </div>
    )
}

function WorkshopCard({ workshop, onAdd, onDrop }) {
    const isFull = workshop.enrolled >= workshop.quota
    const isEnrolled = workshop.isEnrolled

    const now = new Date()
    // Backend returns "YYYY-MM-DDTHH:MI" (UTC, no timezone suffix) — append 'Z' so JS parses as UTC
    const regStart = workshop.registrationStart ? new Date(workshop.registrationStart + 'Z') : null
    const regEnd = workshop.registrationEnd ? new Date(workshop.registrationEnd + 'Z') : null

    let regStatus = 'OPEN'
    let regStatusLabel = 'Registration Open'
    let regColorClass = 'text-green-600'
    let regBgClass = 'bg-green-50 border-green-200'

    if (regStart && now < regStart) {
        regStatus = 'UPCOMING'
        regStatusLabel = 'Registration Upcoming'
        regColorClass = 'text-blue-600'
        regBgClass = 'bg-blue-50 border-blue-200'
    } else if (regEnd && now > regEnd) {
        regStatus = 'CLOSED'
        regStatusLabel = 'Registration Closed'
        regColorClass = 'text-red-500'
        regBgClass = 'bg-red-50 border-red-200'
    }

    const canRegister = regStatus === 'OPEN'

    // Workshop type badge config
    const typeBadge = {
        Technical:   { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
        Creative:    { bg: 'bg-purple-100',  text: 'text-purple-700', border: 'border-purple-200' },
        Business:    { bg: 'bg-green-100',   text: 'text-green-700',  border: 'border-green-200' },
        Leadership:  { bg: 'bg-orange-100',  text: 'text-orange-700', border: 'border-orange-200' },
    }
    const badge = workshop.workshopType ? (typeBadge[workshop.workshopType] || { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' }) : null

    return (
        <div className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-300 bg-white ${
            isEnrolled
                ? 'border-2 border-primary shadow-lg shadow-primary/10'
                : isFull || !canRegister
                    ? 'border-border-dark opacity-70'
                    : 'border-border-dark hover:border-primary hover:shadow-lg hover:shadow-primary/10'
        }`}>
            {/* Enrolled check badge */}
            {isEnrolled && (
                <div className="absolute top-3 right-3 bg-primary text-white rounded-full p-1 shadow-md z-10">
                    <span className="material-symbols-outlined text-[18px] font-bold">check</span>
                </div>
            )}

            {/* Preview image */}
            <div className="w-full h-48 overflow-hidden border-b border-border-dark relative bg-primary-light">
                <img
                    src={workshop.previewImage || `/assets/${workshop.workshopType ? workshop.workshopType.toLowerCase() + '_workshop' : 'technical_workshop'}.png`}
                    alt={`${workshop.workshopType || 'Workshop'} preview`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => { e.target.src = '/assets/technical_workshop.png'; }}
                />
                <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors"></div>
                {/* Blue top stripe for enrolled */}
                {isEnrolled && <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />}
            </div>

            <div className="p-5 flex flex-col gap-3 flex-1">
                {/* Header: type + code + title */}
                <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {badge && (
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                                {workshop.workshopType}
                            </span>
                        )}
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isEnrolled ? 'bg-primary/10 text-primary border-primary/20' : 'bg-primary-light text-primary border-border-dark'
                        }`}>
                            {workshop.code}
                        </span>
                    </div>
                    <h3 className={`text-lg font-bold leading-tight transition-colors ${isEnrolled ? 'text-primary' : 'text-gray-800 group-hover:text-primary'}`}>
                        {workshop.name}
                    </h3>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-1.5">
                    {workshop.mentor && (
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                            <span className="material-symbols-outlined text-[16px] text-primary/60">co_present</span>
                            <span>{workshop.mentor}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="material-symbols-outlined text-[16px] text-primary/60">schedule</span>
                        <span>{workshop.schedule || 'TBD'}</span>
                    </div>
                    {workshop.room && (
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                            <span className="material-symbols-outlined text-[16px] text-primary/60">location_on</span>
                            <span>{workshop.room}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                        <span className="material-symbols-outlined text-[16px] text-primary/60">verified</span>
                        <span><strong className="text-primary">{workshop.credits}</strong> Credits</span>
                    </div>
                    {workshop.seatsEnabled && (
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                            <span className="material-symbols-outlined text-[16px] text-primary/60">event_seat</span>
                            <span>Seat selection required</span>
                        </div>
                    )}
                </div>

                {/* Registration Status */}
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border self-start ${regBgClass} ${regColorClass}`}>
                    <span className="material-symbols-outlined text-[14px]">event_available</span>
                    {regStatusLabel}
                </div>
                {regStart && regEnd && (
                    <div className="text-[10px] text-text-muted">
                        {regStart.toLocaleDateString()} {regStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {regEnd.toLocaleDateString()} {regEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}

                {/* Footer: quota + action */}
                <div className={`mt-auto pt-4 flex items-center justify-between border-t transition-colors ${isEnrolled ? 'border-primary/20' : 'border-border-dark'}`}>
                    <div className="flex flex-col">
                        <span className="text-[9px] uppercase text-text-muted font-bold tracking-wider">Quota</span>
                        <span className={`text-sm font-bold ${isFull ? 'text-red-500' : 'text-green-600'}`}>
                            {workshop.enrolled}<span className="text-text-muted font-normal">/{workshop.quota}</span>
                        </span>
                    </div>

                    {isEnrolled ? (
                        <button
                            onClick={onDrop}
                            className="flex items-center gap-1.5 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-500 hover:text-white transition-all"
                        >
                            <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                            Drop
                        </button>
                    ) : isFull ? (
                        <button disabled className="flex items-center gap-1.5 rounded-xl bg-gray-100 border border-border-dark px-4 py-2 text-sm font-bold text-text-muted cursor-not-allowed">
                            <span className="material-symbols-outlined text-[16px]">block</span>
                            Full
                        </button>
                    ) : !canRegister ? (
                        <button disabled className="flex items-center gap-1.5 rounded-xl bg-gray-100 border border-border-dark px-4 py-2 text-sm font-bold text-text-muted cursor-not-allowed">
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            Closed
                        </button>
                    ) : (
                        <button
                            onClick={onAdd}
                            className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-hover px-4 py-2 text-sm font-bold text-white transition-all shadow-sm hover:shadow-md"
                        >
                            <span className="material-symbols-outlined text-[16px]">add_circle</span>
                            {workshop.seatsEnabled ? 'Select Seat' : 'Add'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

