import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'

export default function CourseRegistration() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [courses, setCourses] = useState([])
    const [myCourses, setMyCourses] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [totalCredits, setTotalCredits] = useState(0)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedSemester, setSelectedSemester] = useState('all')
    const [notification, setNotification] = useState(null)
    const [dropId, setDropId] = useState(null)
    const [showMobileFilters, setShowMobileFilters] = useState(false)

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type })
        setTimeout(() => setNotification(null), 3000)
    }

    const [timeLeft, setTimeLeft] = useState(0)

    useEffect(() => {
        loadCourses()
        api.connectWebSocket(handleQuotaUpdate)

        // Timer countdown
        const timerInterval = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1))
        }, 1000)

        return () => {
            clearInterval(timerInterval)
            api.disconnectWebSocket()
        }
    }, [])

    const loadCourses = async () => {
        setIsLoading(true)
        try {
            // Check Queue Status first
            const queueStatus = await api.getQueueStatus()

            // Strict enforcement: Must be in queue AND active
            if (!queueStatus.inQueue || queueStatus.status === 'WAITING') {
                navigate('/queue')
                return // Stop loading
            }

            // Set initial time
            if (queueStatus.remainingSeconds) {
                setTimeLeft(queueStatus.remainingSeconds)
            }

            const [availableRes, myRes] = await Promise.all([
                api.getAvailableCourses(),
                api.getMyCourses()
            ])

            setCourses(availableRes.courses || [])
            setMyCourses(myRes.courses || [])
            setTotalCredits(myRes.totalCredits || 0)
        } catch (err) {
            console.error('Failed to load courses:', err)
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
            setCourses(prev => prev.map(course =>
                course.classId === message.classId
                    ? { ...course, enrolled: message.enrolled }
                    : course
            ))
        }
    }

    const handleAddCourse = async (classId) => {
        try {
            const response = await api.addCourse(classId)
            if (response.success) {
                setTotalCredits(response.totalCredits)
                showNotification('Course added successfully')
                loadCourses() // Refresh lists
            }
        } catch (err) {
            showNotification(err.message, 'error')
        }
    }

    const handleDropCourse = (enrollmentId) => {
        setDropId(enrollmentId)
    }

    const confirmDrop = async () => {
        if (!dropId) return

        try {
            const response = await api.dropCourse(dropId)
            if (response.success) {
                showNotification('Course dropped successfully')
                loadCourses()
            }
        } catch (err) {
            showNotification(err.message, 'error')
        } finally {
            setDropId(null)
        }
    }

    const handleFinish = () => {
        navigate('/success')
    }

    // Merge courses with my enrolled courses
    const enrichedCourses = courses.map(course => {
        const enrolled = myCourses.find(m => m.class_id === course.classId)
        return { ...course, isEnrolled: !!enrolled, enrollmentId: enrolled?.id }
    })

    const filteredCourses = enrichedCourses.filter(course => {
        const matchesSearch = course.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.code?.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesSemester = selectedSemester === 'all' || course.semester == selectedSemester
        return matchesSearch && matchesSemester
    })

    if (isLoading) {
        return (
            <div className="bg-background-dark min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" text="Loading courses..." />
            </div>
        )
    }

    return (
        <div className="bg-background-dark min-h-screen flex flex-col text-gray-800 overflow-hidden">
            <Header title="UKSW Academic Portal" />

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-24 right-6 z-50 px-6 py-4 rounded-lg shadow-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${notification.type === 'error'
                    ? 'bg-red-900/90 border-red-500 text-white shadow-red-900/20'
                    : 'bg-green-900/90 border-green-500 text-white shadow-green-900/20'
                    }`}>
                    <span className="material-symbols-outlined">
                        {notification.type === 'error' ? 'error' : 'check_circle'}
                    </span>
                    <span className="font-bold">{notification.message}</span>
                </div>
            )}

            {/* Confirmation Modal */}
            {dropId && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-surface-dark border border-border-dark p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95">
                        <div className="flex items-center gap-3 mb-4 text-red-500">
                            <span className="material-symbols-outlined text-3xl">warning</span>
                            <h3 className="text-xl font-bold text-gray-800">Drop Course?</h3>
                        </div>
                        <p className="text-text-muted mb-6 leading-relaxed">
                            Are you sure you want to remove this course from your schedule? <br />
                            <span className="text-xs opacity-70 mt-2 block">If the class quota fills up, you might not be able to re-enroll.</span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDropId(null)}
                                className="px-4 py-2 rounded-lg text-text-muted hover:text-primary transition-colors font-bold text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDrop}
                                className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white font-bold transition-colors text-sm flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">delete</span>
                                Drop Course
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar - Filters */}
                {/* Left Sidebar - Filters */}
                {/* Mobile Filter Overlay Background */}
                {showMobileFilters && (
                    <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setShowMobileFilters(false)} />
                )}

                <aside className={`
                    fixed inset-y-0 left-0 z-50 w-80 bg-background-dark border-r border-border-dark p-6 flex flex-col gap-8 transition-transform duration-300 lg:relative lg:translate-x-0 lg:flex lg:z-auto
                    ${showMobileFilters ? 'translate-x-0' : '-translate-x-full'}
                `}>
                    <div className="flex justify-between items-center lg:hidden">
                        <h3 className="font-bold text-gray-800 text-lg">Filters</h3>
                        <button onClick={() => setShowMobileFilters(false)} className="text-text-muted hover:text-primary">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-text-muted uppercase tracking-wider">Search</label>
                        <div className="flex w-full items-stretch rounded-lg bg-surface-dark border border-border-dark focus-within:border-primary transition-colors">
                            <div className="flex items-center justify-center pl-3 text-text-muted">
                                <span className="material-symbols-outlined">search</span>
                            </div>
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-transparent border-none text-gray-800 focus:ring-0 placeholder:text-text-muted/50 py-3 text-sm"
                                placeholder="Course name or code..."
                            />
                        </div>
                    </div>

                    {/* Semester Filter */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-text-muted uppercase tracking-wider">Semester</label>
                            <span onClick={() => setSelectedSemester('all')} className="text-xs text-primary cursor-pointer hover:underline">Clear</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {['1', '3', '5', '7'].map(sem => (
                                <button
                                    key={sem}
                                    onClick={() => setSelectedSemester(sem)}
                                    className={`px-2 py-2 rounded-lg border text-xs transition-all ${selectedSemester === sem
                                        ? 'border-primary text-primary bg-primary/10'
                                        : 'border-border-dark text-text-muted hover:border-primary/50'
                                        }`}
                                >
                                    Sem {sem}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 lg:p-10 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                    {/* Header */}
                    <div className="flex flex-wrap justify-between items-end gap-4 border-b border-border-dark pb-6">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-primary text-sm font-bold tracking-wider uppercase">
                                <span className="material-symbols-outlined text-[20px]">school</span>
                                <span>Academic Year 2023/2024</span>
                            </div>
                            <h1 className="text-gray-800 text-3xl lg:text-4xl font-black leading-tight tracking-tight">
                                Course Registration (KRS)
                            </h1>
                            <p className="text-text-muted text-base">Select courses for Semester Gasal (Odd)</p>

                            {/* Mobile Filter Toggle */}
                            <button
                                onClick={() => setShowMobileFilters(true)}
                                className="lg:hidden mt-2 flex items-center gap-2 self-start px-4 py-2 bg-surface-dark border border-border-dark rounded-lg text-sm font-bold text-primary"
                            >
                                <span className="material-symbols-outlined text-[18px]">tune</span>
                                Filters & Search
                            </button>
                        </div>
                        <div className="flex items-center gap-4 bg-surface-dark px-4 py-2 rounded-lg border border-border-dark">
                            <div className="flex flex-col items-center px-2">
                                <span className="text-[10px] uppercase text-text-muted font-bold tracking-widest">Time Remaining</span>
                                <span className={`font-mono font-bold text-xl ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
                                    {formatTime(timeLeft)}
                                </span>
                            </div>
                            <div className="h-8 w-px bg-border-dark"></div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] uppercase text-text-muted font-bold tracking-widest">Selected</span>
                                <span className="text-primary font-bold text-lg">{totalCredits} Credits</span>
                            </div>
                        </div>
                    </div>

                    {/* Course Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 mb-24">
                        {filteredCourses.map(course => (
                            <CourseCard
                                key={course.classId}
                                course={course}
                                onAdd={() => handleAddCourse(course.classId)}
                                onDrop={() => handleDropCourse(course.enrollmentId)}
                            />
                        ))}
                    </div>

                    {filteredCourses.length === 0 && (
                        <div className="text-center py-12 text-text-muted">
                            <span className="material-symbols-outlined text-6xl mb-4">search_off</span>
                            <p>No courses found matching your criteria.</p>
                        </div>
                    )}
                </main>

                {/* Right Sidebar - KRS Preview */}
                <aside className="hidden lg:flex lg:flex-col fixed lg:relative right-0 top-[65px] lg:top-0 h-[calc(100vh-65px)] lg:h-auto w-80 bg-surface-dark border-l border-border-dark shadow-2xl z-40">
                    <div className="p-6 border-b border-border-dark flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">assignment_turned_in</span>
                            <h3 className="text-lg font-bold text-gray-800">KRS Preview</h3>
                        </div>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-bold">{myCourses.length} Courses</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                        {myCourses.map(course => (
                            <div key={course.id} className="p-3 rounded-lg bg-background-dark border border-border-dark group hover:border-primary/50 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-[10px] font-bold text-primary uppercase">{course.courseCode}</span>
                                    <span className="text-[10px] font-bold text-text-muted">{course.credits} Credits</span>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-800 mb-2 line-clamp-1">{course.courseName}</h4>
                                <button
                                    onClick={() => handleDropCourse(course.id)}
                                    className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 uppercase tracking-wider font-bold"
                                >
                                    <span className="material-symbols-outlined text-xs">close</span> Remove
                                </button>
                            </div>
                        ))}

                        {myCourses.length === 0 && (
                            <div className="border-2 border-dashed border-border-dark rounded-lg p-4 flex flex-col items-center justify-center text-text-muted opacity-40">
                                <span className="material-symbols-outlined mb-1">add</span>
                                <span className="text-[10px] uppercase font-bold">Add courses</span>
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-background-dark/50 border-t border-border-dark mt-auto">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <p className="text-[10px] uppercase text-text-muted font-bold tracking-widest">Total Credits</p>
                                <p className="text-2xl font-black text-gray-800">{totalCredits} <span className="text-xs font-medium text-text-muted">/ 24</span></p>
                            </div>
                        </div>
                        <button
                            onClick={handleFinish}
                            disabled={myCourses.length === 0}
                            className="w-full bg-cream-gold hover:bg-[#EBC44F] text-background-dark font-black py-4 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-cream-gold/10 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined font-bold">send</span>
                            SUBMIT REGISTRATION
                        </button>
                        <p className="text-[10px] text-center text-text-muted/60 mt-4 leading-relaxed">
                            By submitting, you agree to the academic terms and course schedules.
                        </p>
                    </div>
                </aside>
            </div>

            {/* Mobile Bottom Bar */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-dark border-t border-border-dark p-4 flex items-center justify-between z-50">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-text-muted font-bold">Selected</span>
                    <span className="text-primary font-bold">{totalCredits} Credits ({myCourses.length} Courses)</span>
                </div>
                <button
                    onClick={handleFinish}
                    disabled={myCourses.length === 0}
                    className="bg-cream-gold text-background-dark px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                >
                    Submit KRS
                </button>
            </div>
        </div>
    )
}

function CourseCard({ course, onAdd, onDrop }) {
    const isFull = course.enrolled >= course.quota
    const isEnrolled = course.isEnrolled

    // Registration Period Logic
    const now = new Date()
    const regStart = course.registrationStart ? new Date(course.registrationStart) : new Date(0)
    const regEnd = course.registrationEnd ? new Date(course.registrationEnd) : new Date(8640000000000000)

    const isComingSoon = now < regStart
    const isClosed = now > regEnd
    const canRegister = !isEnrolled && !isFull && !isComingSoon && !isClosed

    return (
        <div className={`group relative flex flex-col rounded-xl border p-0 transition-all duration-300 ${isEnrolled
            ? 'border-2 border-primary bg-surface-dark shadow-[0_0_20px_rgba(231,185,35,0.15)]'
            : isComingSoon
                ? 'border-border-dark bg-surface-dark/30 opacity-70 grayscale-[0.5]'
                : isClosed
                    ? 'border-border-dark bg-surface-dark/30 opacity-50'
                    : 'border-border-dark bg-surface-dark hover:border-primary hover:shadow-[0_0_20px_rgba(231,185,35,0.1)]'
            }`}>
            {isEnrolled && (
                <div className="absolute -top-3 -right-3 bg-primary text-background-dark rounded-full p-1 shadow-md z-10">
                    <span className="material-symbols-outlined text-[20px] font-bold">check</span>
                </div>
            )}

            <div className="p-6 flex flex-col gap-4 h-full">
                <div className="flex justify-between items-start">
                    <div>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${isEnrolled ? 'bg-primary/20 text-primary' : 'bg-white/10 text-gray-800'
                            }`}>
                            {course.code}
                        </span>
                        <h3 className={`text-xl font-bold leading-tight ${isEnrolled ? 'text-primary' : 'text-gray-800 group-hover:text-primary'
                            } transition-colors`}>
                            {course.name}
                        </h3>
                    </div>
                    <div className={`flex items-center gap-1 rounded px-2 py-1 border ${isEnrolled
                        ? 'bg-yellow-900/20 border-yellow-900/30 text-yellow-500'
                        : isComingSoon
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : isClosed
                                ? 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                                : isFull
                                    ? 'bg-red-900/20 border-red-900/30 text-red-400'
                                    : 'bg-green-900/20 border-green-900/30 text-green-400'
                        }`}>
                        <span className="text-xs font-bold uppercase tracking-wide">
                            {isEnrolled ? 'Selected' : isComingSoon ? 'Coming Soon' : isClosed ? 'Closed' : isFull ? 'Full' : 'Available'}
                        </span>
                    </div>
                </div>



                <div className="flex flex-col gap-2 mt-1">
                    {/* Registration Period */}
                    <div className="flex flex-col gap-1 bg-surface-dark/50 p-2 rounded border border-border-dark/50">
                        <span className="text-[10px] text-text-muted uppercase font-bold">Registration Period</span>
                        <div className="flex items-center gap-2 text-xs text-gray-800">
                            <span className="material-symbols-outlined text-[14px] text-primary">date_range</span>
                            <span>
                                {regStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                {' - '}
                                {regEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>

                    {/* Workshop Schedule */}
                    <div className="flex flex-col gap-1 mt-2">
                        <span className="text-[10px] text-text-muted uppercase font-bold">Workshop Schedule</span>
                        {course.date ? (
                            <div className="flex items-center gap-2 text-sm text-gray-800">
                                <span className={`material-symbols-outlined text-[18px] ${isEnrolled ? 'text-primary' : ''}`}>calendar_month</span>
                                <div>
                                    <div className="font-bold">
                                        {new Date(course.date).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </div>
                                    <div className="text-xs text-text-muted">
                                        {course.schedule ? course.schedule.split(' ').slice(1).join(' ') : 'Time TBD'}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className={`flex items-center gap-3 text-sm ${isEnrolled ? 'text-primary font-bold' : 'text-text-muted'}`}>
                                <span className={`material-symbols-outlined text-[18px] ${isEnrolled ? 'text-primary' : ''}`}>schedule</span>
                                <span>{course.schedule || 'TBD'}</span>
                            </div>
                        )}
                    </div>

                    {course.room && (
                        <div className={`flex items-center gap-3 text-sm mt-1 ${isEnrolled ? 'text-primary font-bold' : 'text-text-muted'}`}>
                            <span className={`material-symbols-outlined text-[18px] ${isEnrolled ? 'text-primary' : ''}`}>location_on</span>
                            <span>{course.room}</span>
                        </div>
                    )}

                    {/* Registration Period Info */}
                    {(course.registrationStart && course.registrationEnd) && (
                        <div className={`flex flex-col gap-1 mt-1 p-2 rounded border ${isEnrolled ? 'bg-primary/10 border-primary/20' : 'bg-background-dark/50 border-border-dark'}`}>
                            <div className="flex items-center gap-2 text-xs text-text-muted font-bold uppercase">
                                <span className="material-symbols-outlined text-[14px]">event_available</span>
                                Registration Period
                            </div>
                            <div className={`text-xs ${isEnrolled ? 'text-primary font-bold' : 'text-text-muted'} ml-6`}>
                                <div><span className="opacity-70">Start:</span> {new Date(course.registrationStart).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                <div><span className="opacity-70">End:&nbsp;&nbsp;</span> {new Date(course.registrationEnd).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    )}

                    <div className={`flex items-center gap-3 text-sm ${isEnrolled ? 'text-primary font-bold' : 'text-text-muted'}`}>
                        <span className={`material-symbols-outlined text-[18px] ${isEnrolled ? 'text-primary' : ''}`}>verified</span>
                        <span>{course.credits} Credits</span>
                    </div>
                </div>

                <div className={`mt-auto pt-5 flex items-center justify-between border-t transition-colors ${isEnrolled ? 'border-border-dark' : 'border-border-dark group-hover:border-primary/20'
                    }`}>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-text-muted font-bold">Quota</span>
                        <span className={`text-sm font-bold ${isFull ? 'text-red-400' : 'text-green-400'}`}>
                            {course.enrolled}<span className="text-text-muted font-normal">/{course.quota}</span>
                        </span>
                    </div>

                    {isEnrolled ? (
                        <button
                            onClick={onDrop}
                            className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/50 px-5 py-2 text-sm font-bold text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                            Drop
                        </button>
                    ) : isComingSoon ? (
                        <button
                            disabled
                            className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-5 py-2 text-sm font-bold text-blue-400 cursor-not-allowed"
                        >
                            <span className="material-symbols-outlined text-[18px]">access_time</span>
                            Soon
                        </button>
                    ) : isClosed ? (
                        <button
                            disabled
                            className="flex items-center gap-2 rounded-lg bg-white/5 px-5 py-2 text-sm font-bold text-text-muted cursor-not-allowed"
                        >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                            Closed
                        </button>
                    ) : isFull ? (
                        <button
                            disabled
                            className="flex items-center gap-2 rounded-lg bg-white/5 px-5 py-2 text-sm font-bold text-text-muted cursor-not-allowed"
                        >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                            Full
                        </button>
                    ) : (
                        <button
                            onClick={onAdd}
                            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-background-dark hover:bg-yellow-400 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            Add
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
