import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import { useToast } from '../components/Toast'
import LoadingSpinner from '../components/LoadingSpinner'
import SeatMap from '../components/SeatMap'
import { UserManagement } from '../components/UserManagement'

// ─── Timezone Helpers ────────────────────────────────────────────────────────
// datetime-local inputs return "YYYY-MM-DDTHH:mm" in LOCAL time.
// The backend stores/compares timestamps in UTC (Docker container timezone = UTC).
// We must convert to UTC ISO before sending, and back to local for display.

/** Format a Date object as "YYYY-MM-DDTHH:mm" in the browser's LOCAL timezone */
function toLocalDateTimeString(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Convert a "YYYY-MM-DDTHH:mm" local-time string → UTC ISO string for the backend */
function localDateTimeToUTC(localStr) {
    if (!localStr) return localStr
    // new Date("YYYY-MM-DDTHH:mm") is parsed as LOCAL time by browsers
    const d = new Date(localStr)
    return d.toISOString() // always UTC
}

/** Convert a UTC timestamp string from the backend → "YYYY-MM-DDTHH:mm" local for datetime-local input */
function utcToLocalDateTimeString(utcStr) {
    if (!utcStr) return ''
    // Backend returns "YYYY-MM-DDTHH:MI" formatted by to_char (no timezone suffix)
    // Treat it as UTC by appending 'Z', then format as local
    const d = new Date(utcStr.includes('Z') || utcStr.includes('+') ? utcStr : utcStr + 'Z')
    return toLocalDateTimeString(d)
}
// ─────────────────────────────────────────────────────────────────────────────

export default function MentorDashboard() {
    const { user, logout } = useAuth()
    const [workshops, setWorkshops] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editingWorkshop, setEditingWorkshop] = useState(null)
    const [monitoringSessionId, setMonitoringSessionId] = useState(null)
    const [activeTab, setActiveTab] = useState('workshops') // 'workshops' | 'schedule' | 'traffic' | 'students' | 'feedback'
    const [expandedWorkshopId, setExpandedWorkshopId] = useState(null)
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

    useEffect(() => {
        loadWorkshops()
    }, [])

    const loadWorkshops = async () => {
        try {
            const response = await api.getMentorWorkshops()
            setWorkshops((response.courses || response.workshops || []).map(c => ({
                ...c,
                id: c.sessionId || c.classId || c.workshopId || c.id,
                workshopType: c.workshopType || 'General',
                type: c.workshopType || 'General' // Default to General
            })))
        } catch (err) {
            console.error('Failed to load workshops:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleNavigateToWorkshop = (workshopId) => {
        setExpandedWorkshopId(workshopId)
        setActiveTab('workshops')
    }

    if (isLoading) {
        return (
            <div className="bg-[#F0F6FC] min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" text="Loading dashboard..." />
            </div>
        )
    }

    return (
        <div className="relative flex h-screen w-full bg-[#F0F6FC] overflow-hidden font-display">
            {/* Sidebar */}
            <aside className="hidden md:flex w-64 flex-col border-r border-border-dark bg-white">
                <div className="flex h-full flex-col justify-between p-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-3 items-center pb-4 border-b border-border-dark">
                            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border border-border-dark bg-primary/20 flex items-center justify-center text-primary font-bold">
                                M
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-primary text-base font-bold leading-normal tracking-tight">Workshop</h1>
                                <p className="text-text-muted text-xs font-normal leading-normal">Mentor Platform</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setActiveTab('workshops')}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group cursor-pointer w-full text-left ${activeTab === 'workshops' ? 'bg-primary/20 border border-primary/10' : 'hover:bg-accent-dark'}`}
                            >
                                <span className={`material-symbols-outlined ${activeTab === 'workshops' ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}>menu_book</span>
                                <p className={`text-sm font-medium leading-normal ${activeTab === 'workshops' ? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'}`}>My Workshops</p>
                            </button>
                            <button
                                onClick={() => setActiveTab('schedule')}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group cursor-pointer w-full text-left ${activeTab === 'schedule' ? 'bg-primary/20 border border-primary/10' : 'hover:bg-accent-dark'}`}
                            >
                                <span className={`material-symbols-outlined ${activeTab === 'schedule' ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}>calendar_month</span>
                                <p className={`text-sm font-medium leading-normal ${activeTab === 'schedule' ? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'}`}>Schedule</p>
                            </button>
                            <button
                                onClick={() => setActiveTab('traffic')}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group cursor-pointer w-full text-left ${activeTab === 'traffic' ? 'bg-primary/20 border border-primary/10' : 'hover:bg-accent-dark'}`}
                            >
                                <span className={`material-symbols-outlined ${activeTab === 'traffic' ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}>traffic</span>
                                <p className={`text-sm font-medium leading-normal ${activeTab === 'traffic' ? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'}`}>Traffic Control</p>
                            </button>
                            <button
                                onClick={() => setActiveTab('students')}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group cursor-pointer w-full text-left ${activeTab === 'students' ? 'bg-primary/20 border border-primary/10' : 'hover:bg-accent-dark'}`}
                            >
                                <span className={`material-symbols-outlined ${activeTab === 'students' ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}>people</span>
                                <p className={`text-sm font-medium leading-normal ${activeTab === 'students' ? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'}`}>Users</p>
                            </button>
                            <button
                                onClick={() => setActiveTab('feedback')}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group cursor-pointer w-full text-left ${activeTab === 'feedback' ? 'bg-primary/20 border border-primary/10' : 'hover:bg-accent-dark'}`}
                            >
                                <span className={`material-symbols-outlined ${activeTab === 'feedback' ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}>reviews</span>
                                <p className={`text-sm font-medium leading-normal ${activeTab === 'feedback' ? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'}`}>Feedback</p>
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex flex-1 flex-col h-full overflow-hidden relative">
                <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-border-dark bg-white px-6 py-3 z-10">
                    <button
                        onClick={() => setIsMobileSidebarOpen(true)}
                        className="flex items-center gap-4 md:hidden text-text-muted hover:text-primary"
                    >
                        <span className="material-symbols-outlined">menu</span>
                    </button>

                    <div className="flex flex-1 justify-end gap-3 items-center">
                        <div className="flex items-center gap-3 pl-4 border-l border-border-dark">
                            <div className="text-right hidden sm:block">
                                <p className="text-gray-800 text-sm font-bold">{user?.name}</p>
                                <p className="text-text-muted text-xs">Mentor</p>
                            </div>
                            <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border border-border-dark bg-primary/10 flex items-center justify-center text-primary font-bold">
                                {user?.name?.charAt(0) || 'M'}
                            </div>
                        </div>
                        <button onClick={logout} className="flex items-center gap-2 pl-4 border-l border-border-dark hover:text-primary transition-colors text-text-muted group cursor-pointer">
                            <span className="text-xs font-bold uppercase tracking-wider hidden md:block group-hover:text-primary">Sign Out</span>
                            <span className="material-symbols-outlined text-[20px]">logout</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                    {activeTab === 'workshops' ? (
                        <WorkshopsTab
                            workshops={workshops}
                            expandedWorkshopId={expandedWorkshopId}
                            onCreateClick={() => setIsCreateModalOpen(true)}
                            onUpdate={loadWorkshops}
                            onMonitorSeats={(sessionId) => setMonitoringSessionId(sessionId)}
                            onEdit={(workshop) => {
                                setEditingWorkshop(workshop)
                                setIsEditModalOpen(true)
                            }}
                        />
                    ) : activeTab === 'schedule' ? (
                        <MentorSchedule workshops={workshops} onNavigateToWorkshop={handleNavigateToWorkshop} />
                    ) : activeTab === 'students' ? (
                        <UserManagement />
                    ) : activeTab === 'feedback' ? (
                        <MentorFeedback />
                    ) : (
                        <TrafficControl />
                    )}
                </main>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileSidebarOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsMobileSidebarOpen(false)} />
                    <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-border-dark shadow-2xl animate-in slide-in-from-left p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex gap-3 items-center">
                                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border border-border-dark bg-primary/20 flex items-center justify-center text-primary font-bold">
                                    M
                                </div>
                                <div className="flex flex-col">
                                    <h1 className="text-primary text-base font-bold leading-normal tracking-tight">Workshop</h1>
                                    <p className="text-text-muted text-xs font-normal leading-normal">Mentor Platform</p>
                                </div>
                            </div>
                            <button onClick={() => setIsMobileSidebarOpen(false)} className="text-text-muted hover:text-primary">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            {['workshops', 'schedule', 'traffic', 'students', 'feedback'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setActiveTab(tab)
                                        setIsMobileSidebarOpen(false)
                                    }}
                                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors group cursor-pointer w-full text-left ${activeTab === tab ? 'bg-primary/20 border border-primary/10' : 'hover:bg-accent-dark'}`}
                                >
                                    <span className={`material-symbols-outlined ${activeTab === tab ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}>
                                        {tab === 'workshops' ? 'menu_book' : tab === 'schedule' ? 'calendar_month' : tab === 'traffic' ? 'traffic' : tab === 'students' ? 'people' : 'reviews'}
                                    </span>
                                    <p className={`text-sm font-medium leading-normal ${activeTab === tab ? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'}`}>
                                        {tab === 'workshops' ? 'My Workshops' : tab === 'schedule' ? 'Schedule' : tab === 'traffic' ? 'Traffic Control' : tab === 'students' ? 'Users' : 'Feedback'}
                                    </p>
                                </button>
                            ))}
                        </div>

                        <div className="mt-auto pt-6 border-t border-border-dark">
                            <button onClick={logout} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-text-muted w-full transition-colors font-bold">
                                <span className="material-symbols-outlined">logout</span>
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isCreateModalOpen && (
                <CreateWorkshopModal onClose={() => setIsCreateModalOpen(false)} />
            )}

            {/* Edit Workshop Modal */}
            {isEditModalOpen && editingWorkshop && (
                <EditWorkshopModal
                    workshop={editingWorkshop}
                    onClose={() => {
                        setIsEditModalOpen(false)
                        setEditingWorkshop(null)
                    }}
                />
            )}

            {/* Seat Monitoring Modal */}
            {monitoringSessionId && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in">
                    <div className="relative w-full max-w-5xl h-[90vh] bg-white border border-border-dark rounded-xl shadow-2xl overflow-hidden flex flex-col m-4">
                        <div className="p-4 border-b border-border-dark flex justify-between items-center bg-primary-light/40">
                            <div>
                                <h3 className="text-gray-800 font-bold text-lg">Live Seat Monitor</h3>
                                <p className="text-text-muted text-xs">Real-time view of seat occupancy</p>
                            </div>
                            <button
                                onClick={() => setMonitoringSessionId(null)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-text-muted hover:text-primary transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-white">
                            <SeatMap workshopSessionId={monitoringSessionId} readOnly={true} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function MentorSchedule({ workshops, onNavigateToWorkshop }) {
    const [selectedBlock, setSelectedBlock] = useState(null)
    // Track the currently viewed date (default effectively to today)
    const [viewDate, setViewDate] = useState(new Date())

    // Get dates for the full week (Mon-Fri) containing the viewDate
    const getWeekDates = useMemo(() => {
        const current = new Date(viewDate);
        const day = current.getDay(); // 0-6
        // Calculate offset to Monday (assuming Mon is start, 0=Sun, 1=Mon)
        // If Sun(0), offset -6. If Mon(1), offset 0. If Tue(2), offset -1.
        const diff = current.getDate() - day + (day === 0 ? -6 : 1);

        const monday = new Date(current.setDate(diff));

        return [0, 1, 2, 3, 4].map(i => {
            const d = new Date(monday)
            d.setDate(monday.getDate() + i)
            return d
        })
    }, [viewDate])

    const scheduleBlocks = useMemo(() => {
        const blocks = []
        const weekDates = getWeekDates;

        workshops.forEach(w => {
            if (w.date) {
                const wDate = new Date(w.date);
                // Find if this workshop falls on one of the visible days
                const foundDayIndex = weekDates.findIndex(d =>
                    d.getDate() === wDate.getDate() &&
                    d.getMonth() === wDate.getMonth() &&
                    d.getFullYear() === wDate.getFullYear()
                );

                if (foundDayIndex !== -1 && w.schedule) {
                    // Extract time. Assuming standard format or trying to parse start/end from schedule string
                    const parts = w.schedule.split(', ');
                    parts.forEach(part => {
                        const timePart = part.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
                        if (timePart) {
                            blocks.push({
                                ...w,
                                dayIndex: foundDayIndex,
                                start: timePart[1],
                                end: timePart[2]
                            });
                        }
                    });
                }
            }
        })
        return blocks
    }, [workshops, getWeekDates])

    const getGridStyle = (block) => {
        const colStart = block.dayIndex + 2;
        const startHour = parseInt(block.start.split(':')[0])
        const endHour = parseInt(block.end.split(':')[0])
        // Grid starts at 7:00 (index 0 for header row?)
        // Row 1 is header (days)
        // Row 2 is 7:00
        // formula: (hour - 7) + 2 might be correct if grid rows are 1-based and row 1 is header.
        const rowStart = (startHour - 7) + 2
        const rowSpan = endHour - startHour
        return { gridColumnStart: colStart, gridRowStart: rowStart, gridRowEnd: `span ${rowSpan}` }
    }

    const prevWeek = () => {
        const newDate = new Date(viewDate);
        newDate.setDate(viewDate.getDate() - 7);
        setViewDate(newDate);
    }
    const nextWeek = () => {
        const newDate = new Date(viewDate);
        newDate.setDate(viewDate.getDate() + 7);
        setViewDate(newDate);
    }

    const jumpToToday = () => {
        setViewDate(new Date());
    }

    const monthYearLabel = useMemo(() => {
        // Formats: "February 2026" or "Jan - Feb 2026" if crossing months
        const first = getWeekDates[0];
        const last = getWeekDates[4];
        if (first.getMonth() === last.getMonth()) {
            return first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else {
            return `${first.toLocaleDateString('en-US', { month: 'short' })} - ${last.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        }
    }, [getWeekDates]);

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="flex flex-col gap-6 h-full">
                <div className="flex items-center justify-between">
                    <h1 className="text-gray-800 text-2xl font-bold">Workshop Schedule</h1>
                    <div className="flex items-center gap-4">
                        <button onClick={jumpToToday} className="px-4 py-1.5 rounded-md bg-white border border-border-dark text-gray-800 text-sm font-bold hover:bg-border-dark transition-colors">
                            Today
                        </button>
                        <div className="flex items-center gap-1 bg-white rounded-md border border-border-dark p-0.5">
                            <button onClick={prevWeek} className="w-8 h-8 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-border-dark transition-colors">
                                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                            </button>
                            <button onClick={nextWeek} className="w-8 h-8 rounded flex items-center justify-center text-text-muted hover:text-primary hover:bg-border-dark transition-colors">
                                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                            </button>
                        </div>
                        <span className="text-gray-800 font-bold text-lg min-w-[200px] text-right">{monthYearLabel}</span>
                    </div>
                </div>

                <div className="flex-1 bg-primary-light/40 border border-border-dark rounded-xl overflow-hidden shadow-2xl relative flex flex-col">
                    {/* Header Row */}
                    <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-border-dark bg-primary-light/40">
                        <div className="h-[50px] border-r border-border-dark"></div>
                        {getWeekDates.map((date, i) => {
                            const isToday = date.toDateString() === new Date().toDateString();
                            return (
                                <div key={i} className={`flex flex-col items-center justify-center h-[50px] ${i < 4 ? 'border-r border-border-dark' : ''} ${isToday ? 'bg-primary/5' : ''}`}>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className={`text-xs font-medium uppercase ${isToday ? 'text-primary' : 'text-text-muted'}`}>
                                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                        <span className={`text-lg font-bold ${isToday ? 'bg-primary text-background-dark w-7 h-7 flex items-center justify-center rounded-full' : 'text-gray-800'}`}>
                                            {date.getDate()}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Calendar Body - Scrollable */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        <div className="grid grid-cols-[60px_repeat(5,1fr)] grid-rows-[repeat(13,60px)] min-h-[780px]">
                            {/* Time Labels Column */}
                            <div className="row-span-full border-r border-border-dark bg-primary-light/40 sticky left-0 z-10">
                                {Array.from({ length: 13 }).map((_, i) => (
                                    <div key={i} className="h-[60px] border-b border-border-dark/50 text-xs text-text-muted flex items-start justify-end pr-2 pt-1 relative">
                                        <span className="-translate-y-1/2">{i + 7}:00</span>
                                    </div>
                                ))}
                            </div>

                            {/* Grid Cells Background */}
                            {Array.from({ length: 5 }).map((_, colIndex) => (
                                <div key={colIndex} className={`row-span-full border-r border-border-dark/30 relative ${colIndex === 4 ? 'border-r-0' : ''}`}>
                                    {Array.from({ length: 13 }).map((_, rowIndex) => (
                                        <div key={rowIndex} className="h-[60px] border-b border-border-dark/30"></div>
                                    ))}
                                    {/* Today Highlight Column */}
                                    {getWeekDates[colIndex].toDateString() === new Date().toDateString() && (
                                        <div className="absolute inset-0 bg-primary/5 pointer-events-none"></div>
                                    )}
                                </div>
                            ))}

                            {/* Floating Events Layer */}
                            <div className="absolute inset-0 ml-[60px] grid grid-cols-5 grid-rows-[repeat(13,60px)] pointer-events-none">
                                {scheduleBlocks.map((block, idx) => (
                                    <div key={idx} className="pointer-events-auto relative mx-1 z-10" style={{
                                        gridColumnStart: block.dayIndex + 1,
                                        gridRowStart: (parseInt(block.start.split(':')[0]) - 7) + 1,
                                        gridRowEnd: `span ${parseInt(block.end.split(':')[0]) - parseInt(block.start.split(':')[0])}`,
                                        marginTop: '1px'
                                    }} onClick={() => setSelectedBlock(block)}>
                                        <div className="h-full w-full bg-primary/90 border-l-4 border-white/50 rounded-sm p-2 text-background-dark hover:opacity-90 hover:scale-[1.01] transition-all cursor-pointer overflow-hidden flex flex-col shadow-md">
                                            <span className="font-bold text-xs leading-tight">{block.name}</span>
                                            <div className="flex items-center gap-1 mt-1 opacity-80">
                                                <span className="material-symbols-outlined">location_on</span>
                                                <span className="text-[10px] truncate">{block.room || 'TBD'}</span>
                                            </div>
                                            <div className="flex items-center gap-1 mt-auto opacity-80">
                                                <span className="material-symbols-outlined">schedule</span>
                                                <span className="text-[10px]">{block.start} - {block.end}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Current Time Indicator Line (if today) */}
                            {getWeekDates.some(d => d.toDateString() === new Date().toDateString()) && (
                                <div
                                    className="absolute left-[60px] right-0 border-t-2 border-red-500 z-20 pointer-events-none flex items-center"
                                    style={{
                                        top: `${((new Date().getHours() - 7) * 60 + new Date().getMinutes())}px`
                                    }}
                                >
                                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedBlock && (
                <div className="fixed overflow-hidden z-50 inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white border border-primary/40 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 relative">
                        <button onClick={() => setSelectedBlock(null)} className="absolute top-4 right-4 text-text-muted hover:text-primary">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">{selectedBlock.name}</h3>
                        <p className="text-primary text-sm font-bold mb-4">{selectedBlock.code}</p>

                        <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-3 text-text-muted">
                                <span className="material-symbols-outlined">calendar_today</span>
                                <span>{new Date(selectedBlock.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                            </div>
                            <div className="flex items-center gap-3 text-text-muted">
                                <span className="material-symbols-outlined">schedule</span>
                                <span>{selectedBlock.start} - {selectedBlock.end}</span>
                            </div>
                            <div className="flex items-center gap-3 text-text-muted">
                                <span className="material-symbols-outlined">location_on</span>
                                <span>{selectedBlock.room || 'Room TBD'}</span>
                            </div>
                            <div className="flex items-center gap-3 text-text-muted">
                                <span className="material-symbols-outlined">group</span>
                                <span>{selectedBlock.enrolled} / {selectedBlock.quota} Students</span>
                            </div>
                        </div>

                        <button onClick={() => onNavigateToWorkshop(selectedBlock.id)} className="w-full py-2.5 bg-primary text-background-dark font-bold rounded-lg hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2">
                            View Details
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

function CreateWorkshopModal({ onClose }) {
    // ... (Similar to CreateCourseModal but with workshop terminology if needed)
    // For brevity, using same logic but renamed
    const now = new Date()
    const { addToast } = useToast()
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        credits: 2,
        quota: 40,
        workshopType: 'Technical',
        date: now.toISOString().split('T')[0], // YYYY-MM-DD
        registrationStart: toLocalDateTimeString(now), // YYYY-MM-DDTHH:mm (local time for input display)
        registrationEnd: toLocalDateTimeString(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)), // +7 days (local time)
        timeStart: '08:00',
        timeEnd: '10:00',
        seatsEnabled: true,
        rows: 5,
        cols: 8
    })
    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useState(null)

    const handleImageSelect = (file) => {
        if (!file) return
        const allowed = ['image/jpeg', 'image/png', 'image/webp']
        if (!allowed.includes(file.type)) {
            addToast('Only JPEG, PNG, or WEBP images are allowed', 'error')
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            addToast('Image must be under 2MB', 'error')
            return
        }
        setImageFile(file)
        setImagePreview(URL.createObjectURL(file))
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        handleImageSelect(file)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsUploading(true)
        try {
            // Convert datetime-local strings (local time) to UTC ISO before sending to backend
            const payload = {
                ...formData,
                registrationStart: localDateTimeToUTC(formData.registrationStart),
                registrationEnd: localDateTimeToUTC(formData.registrationEnd),
            }
            const res = await api.createWorkshopSession(payload)
            // If image was selected, upload it using the session id returned
            if (imageFile && res?.sessionId) {
                try {
                    await api.uploadWorkshopImage(res.sessionId, imageFile)
                } catch (imgErr) {
                    addToast('Workshop created but image upload failed: ' + imgErr.message, 'error')
                }
            }
            onClose()
            addToast('Workshop created successfully!', 'success')
            window.location.reload()
        } catch (err) {
            console.error(err)
            addToast(err.message || 'Failed to create workshop', 'error')
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white border border-border-dark w-full max-w-lg rounded-xl shadow-2xl m-4 animate-in zoom-in-95">
                <div className="flex items-center justify-between p-6 border-b border-border-dark">
                    <h3 className="text-xl font-bold text-gray-800">Create New Workshop</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-primary"><span className="material-symbols-outlined">close</span></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto custom-scrollbar">

                    {/* Preview Image Upload */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-text-muted uppercase">Preview Image <span className="text-text-muted/50 font-normal normal-case">(optional, JPEG/PNG/WEBP, max 2MB)</span></label>
                        <div
                            className={`relative rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden ${isDragging ? 'border-primary bg-primary/10' : 'border-border-dark hover:border-primary/50'
                                }`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                        >
                            {imagePreview ? (
                                <div className="relative group">
                                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                        <label className="cursor-pointer bg-primary text-background-dark text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">upload</span> Change
                                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleImageSelect(e.target.files[0])} />
                                        </label>
                                        <button type="button" onClick={() => { setImageFile(null); setImagePreview(null) }} className="bg-red-500/80 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">delete</span> Remove
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <label className="cursor-pointer flex flex-col items-center justify-center gap-2 py-8 px-4 w-full">
                                    <span className="material-symbols-outlined text-4xl text-text-muted">add_photo_alternate</span>
                                    <span className="text-sm text-text-muted text-center">Drag & drop or <span className="text-primary font-bold">browse</span></span>
                                    <span className="text-xs text-text-muted/60">JPEG, PNG, WEBP · max 2MB</span>
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleImageSelect(e.target.files[0])} />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-text-muted uppercase">Workshop Name</label>
                        <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Advanced AI Programming" className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Type</label>
                            <select value={formData.workshopType} onChange={e => setFormData({ ...formData, workshopType: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none">
                                <option value="Technical">Technical</option>
                                <option value="Creative">Creative</option>
                                <option value="Business">Business</option>
                                <option value="Leadership">Leadership</option>
                                <option value="General">General</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Credits</label>
                            <input type="number" required value={formData.credits} onChange={e => setFormData({ ...formData, credits: parseInt(e.target.value) })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Code</label>
                            <input value="Auto-generated" disabled className="w-full bg-[#F0F6FC]/50 border border-border-dark rounded h-11 px-3 text-text-muted italic cursor-not-allowed" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Quota</label>
                            <input type="number" required value={formData.quota} onChange={e => setFormData({ ...formData, quota: parseInt(e.target.value) })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Workshop Date</label>
                            <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Room</label>
                            <input value={formData.room} onChange={e => setFormData({ ...formData, room: e.target.value })} placeholder="e.g. Lab 301, Building B" className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Registration Start</label>
                            <input type="datetime-local" required value={formData.registrationStart} onChange={e => setFormData({ ...formData, registrationStart: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Registration End</label>
                            <input type="datetime-local" required value={formData.registrationEnd} onChange={e => setFormData({ ...formData, registrationEnd: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Start Time</label>
                            <input type="time" required value={formData.timeStart} onChange={e => setFormData({ ...formData, timeStart: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">End Time</label>
                            <input type="time" required value={formData.timeEnd} onChange={e => setFormData({ ...formData, timeEnd: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="p-4 bg-[#F0F6FC]/50 border border-border-dark rounded-lg flex flex-col gap-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={formData.seatsEnabled} onChange={e => setFormData({ ...formData, seatsEnabled: e.target.checked })} className="w-5 h-5 rounded border-border-dark bg-white text-primary focus:ring-primary" />
                            <span className="text-sm font-bold text-gray-800 uppercase tracking-wider">Enable Seat Selection</span>
                        </label>

                        {formData.seatsEnabled && (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-text-muted uppercase">Rows (A-Z)</label>
                                    <input type="number" min="1" max="26" value={formData.rows} onChange={e => setFormData({ ...formData, rows: parseInt(e.target.value) })} className="w-full bg-[#F0F6FC] border border-border-dark rounded h-10 px-3 text-gray-800 text-sm" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-text-muted uppercase">Columns</label>
                                    <input type="number" min="1" max="20" value={formData.cols} onChange={e => setFormData({ ...formData, cols: parseInt(e.target.value) })} className="w-full bg-[#F0F6FC] border border-border-dark rounded h-10 px-3 text-gray-800 text-sm" />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={onClose} disabled={isUploading} className="px-4 py-2 text-text-muted hover:text-primary font-bold text-sm">Cancel</button>
                        <button type="submit" disabled={isUploading} className="px-6 py-2 bg-primary text-background-dark font-bold rounded text-sm hover:bg-primary-hover disabled:opacity-60 flex items-center gap-2">
                            {isUploading && <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>}
                            {isUploading ? 'Creating...' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function EditWorkshopModal({ workshop, onClose }) {
    const now = new Date()
    const [formData, setFormData] = useState({
        name: workshop?.name || '',
        quota: workshop?.quota || 40,
        workshopType: workshop?.workshopType || 'General',
        date: workshop?.date || now.toISOString().split('T')[0],
        registrationStart: workshop?.registrationStart ? utcToLocalDateTimeString(workshop.registrationStart) : toLocalDateTimeString(now),
        registrationEnd: workshop?.registrationEnd ? utcToLocalDateTimeString(workshop.registrationEnd) : toLocalDateTimeString(now),
        timeStart: workshop?.schedule?.split(' ')[1]?.split('-')[0] || '08:00',
        timeEnd: workshop?.schedule?.split(' ')[1]?.split('-')[1] || '10:00',
        room: workshop?.room || '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(workshop?.previewImage || null)
    const [isDragging, setIsDragging] = useState(false)
    const [isUploadingImg, setIsUploadingImg] = useState(false)
    const { addToast } = useToast()

    const handleImageSelect = (file) => {
        if (!file) return
        const allowed = ['image/jpeg', 'image/png', 'image/webp']
        if (!allowed.includes(file.type)) {
            addToast('Only JPEG, PNG, or WEBP images are allowed', 'error')
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            addToast('Image must be under 2MB', 'error')
            return
        }
        setImageFile(file)
        setImagePreview(URL.createObjectURL(file))
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        handleImageSelect(file)
    }

    const handleRemoveImage = async () => {
        setIsUploadingImg(true)
        try {
            if (workshop?.previewImage && !imageFile) {
                // Image is already in DB — delete from server
                await api.deleteWorkshopImage(workshop.id)
            }
            setImageFile(null)
            setImagePreview(null)
            addToast('Preview image removed', 'success')
        } catch (err) {
            addToast('Failed to remove image: ' + err.message, 'error')
        } finally {
            setIsUploadingImg(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            // Convert datetime-local strings (local time) to UTC ISO before sending to backend
            const payload = {
                ...formData,
                registrationStart: localDateTimeToUTC(formData.registrationStart),
                registrationEnd: localDateTimeToUTC(formData.registrationEnd),
            }
            await api.updateWorkshopSession(workshop.id, payload)
            // Upload new image if selected
            if (imageFile) {
                setIsUploadingImg(true)
                try {
                    await api.uploadWorkshopImage(workshop.id, imageFile)
                } catch (imgErr) {
                    addToast('Workshop saved but image upload failed: ' + imgErr.message, 'error')
                } finally {
                    setIsUploadingImg(false)
                }
            }
            onClose()
            addToast('Workshop updated successfully!', 'success')
            window.location.reload()
        } catch (err) {
            console.error(err)
            addToast(err.message || 'Failed to update workshop', 'error')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white border border-border-dark w-full max-w-lg rounded-xl shadow-2xl m-4 animate-in zoom-in-95">
                <div className="flex items-center justify-between p-6 border-b border-border-dark">
                    <h3 className="text-xl font-bold text-gray-800">Edit Workshop</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-primary"><span className="material-symbols-outlined">close</span></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto custom-scrollbar">

                    {/* Preview Image Upload */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-text-muted uppercase">Preview Image <span className="text-text-muted/50 font-normal normal-case">(optional, JPEG/PNG/WEBP, max 2MB)</span></label>
                        <div
                            className={`relative rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden ${isDragging ? 'border-primary bg-primary/10' : 'border-border-dark hover:border-primary/50'
                                }`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                        >
                            {imagePreview ? (
                                <div className="relative group">
                                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                        <label className="cursor-pointer bg-primary text-background-dark text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">upload</span> Change
                                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleImageSelect(e.target.files[0])} />
                                        </label>
                                        <button type="button" onClick={handleRemoveImage} disabled={isUploadingImg} className="bg-red-500/80 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60">
                                            <span className="material-symbols-outlined text-sm">delete</span> Remove
                                        </button>
                                    </div>
                                    {imageFile && (
                                        <div className="absolute top-2 left-2 bg-primary text-background-dark text-[10px] font-bold px-2 py-0.5 rounded-full">New image — not saved yet</div>
                                    )}
                                </div>
                            ) : (
                                <label className="cursor-pointer flex flex-col items-center justify-center gap-2 py-8 px-4 w-full">
                                    <span className="material-symbols-outlined text-4xl text-text-muted">add_photo_alternate</span>
                                    <span className="text-sm text-text-muted text-center">Drag & drop or <span className="text-primary font-bold">browse</span></span>
                                    <span className="text-xs text-text-muted/60">JPEG, PNG, WEBP · max 2MB</span>
                                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleImageSelect(e.target.files[0])} />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-text-muted uppercase">Workshop Name</label>
                        <input
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Advanced AI Programming"
                            className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Code</label>
                            <input value={workshop.code} disabled className="w-full bg-[#F0F6FC]/50 border border-border-dark rounded h-11 px-3 text-text-muted italic cursor-not-allowed" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Credits</label>
                            <input value={workshop.credits} disabled className="w-full bg-[#F0F6FC]/50 border border-border-dark rounded h-11 px-3 text-text-muted italic cursor-not-allowed" />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-text-muted uppercase">Quota</label>
                        <input
                            type="number"
                            required
                            min={workshop?.enrolled || 0}
                            value={formData.quota}
                            onChange={e => setFormData({ ...formData, quota: parseInt(e.target.value) })}
                            className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none"
                        />
                        <p className="text-xs text-text-muted">Current enrolled: {workshop?.enrolled || 0}</p>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-text-muted uppercase">Type</label>
                        <select
                            value={formData.workshopType}
                            disabled
                            onChange={e => setFormData({ ...formData, workshopType: e.target.value })}
                            className="w-full bg-[#F0F6FC]/50 border border-border-dark rounded h-11 px-3 text-text-muted cursor-not-allowed focus:outline-none"
                        >
                            <option value="Technical">Technical</option>
                            <option value="Creative">Creative</option>
                            <option value="Business">Business</option>
                            <option value="Leadership">Leadership</option>
                            <option value="General">General</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Workshop Date</label>
                            <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Room</label>
                            <input value={formData.room} onChange={e => setFormData({ ...formData, room: e.target.value })} placeholder="e.g. Lab 301" className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Registration Start</label>
                            <input type="datetime-local" required value={formData.registrationStart} onChange={e => setFormData({ ...formData, registrationStart: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Registration End</label>
                            <input type="datetime-local" required value={formData.registrationEnd} onChange={e => setFormData({ ...formData, registrationEnd: e.target.value })} className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">Start Time</label>
                            <input
                                type="time"
                                required
                                value={formData.timeStart}
                                onChange={e => setFormData({ ...formData, timeStart: e.target.value })}
                                className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-text-muted uppercase">End Time</label>
                            <input
                                type="time"
                                required
                                value={formData.timeEnd}
                                onChange={e => setFormData({ ...formData, timeEnd: e.target.value })}
                                className="w-full bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800 focus:border-primary focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded text-blue-400 text-xs">
                        <strong>Note:</strong> Workshop code and credits cannot be modified.
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-text-muted hover:text-primary font-bold text-sm disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isSubmitting || isUploadingImg} className="px-6 py-2 bg-blue-500 text-gray-800 font-bold rounded text-sm hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                            {(isSubmitting || isUploadingImg) && <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span>}
                            {isSubmitting ? 'Saving...' : isUploadingImg ? 'Uploading image...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── Registration status helper ──────────────────────────────────────────────
function getRegistrationStatus(workshop) {
    if (workshop.status === 'done') return 'done'
    const now = new Date()
    const regStart = workshop.registrationStart ? new Date(workshop.registrationStart) : null
    const regEnd = workshop.registrationEnd ? new Date(workshop.registrationEnd) : null
    if (regStart && now < regStart) return 'upcoming'
    if (regEnd && now > regEnd) return 'closed'
    return 'open'
}

// ── WorkshopsTab ─────────────────────────────────────────────────────────────
function WorkshopsTab({ workshops, expandedWorkshopId, onCreateClick, onUpdate, onMonitorSeats, onEdit }) {
    const groups = {
        open: workshops.filter(w => getRegistrationStatus(w) === 'open'),
        upcoming: workshops.filter(w => getRegistrationStatus(w) === 'upcoming'),
        closed: workshops.filter(w => getRegistrationStatus(w) === 'closed'),
        done: workshops.filter(w => getRegistrationStatus(w) === 'done'),
    }

    const sectionConfig = [
        { key: 'open', label: 'Open Registration', icon: 'how_to_reg', color: 'text-green-400', empty: 'No workshops with open registration.' },
        { key: 'upcoming', label: 'Upcoming Registration', icon: 'schedule', color: 'text-blue-400', empty: 'No upcoming workshops.' },
        { key: 'closed', label: 'Closed Registration', icon: 'lock_clock', color: 'text-orange-400', empty: 'No workshops with closed registration.' },
        { key: 'done', label: 'Completed', icon: 'task_alt', color: 'text-text-muted', empty: 'No completed workshops.' },
    ]

    return (
        <div className="p-6 lg:p-10 mx-auto max-w-4xl flex flex-col gap-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-gray-800 tracking-tight text-[32px] font-bold leading-tight">My Workshops</h1>
                    <p className="text-text-muted text-base font-normal leading-normal mt-1">
                        Manage your sessions and view seat maps.
                    </p>
                </div>
                <button
                    onClick={onCreateClick}
                    className="flex items-center justify-center h-12 px-6 rounded-lg bg-primary text-background-dark text-base font-bold hover:bg-primary-hover transition-colors gap-2 shadow-lg shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-[20px]">add_circle</span>
                    Create Workshop
                </button>
            </div>

            {workshops.length === 0 && (
                <div className="text-center py-16 text-text-muted">No workshops found.</div>
            )}

            {sectionConfig.map(({ key, label, icon, color, empty }) => {
                const list = groups[key]
                if (list.length === 0) return null
                const isRestricted = key === 'closed' || key === 'done'
                return (
                    <div key={key} className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <span className={`material-symbols-outlined text-[18px] ${color}`}>{icon}</span>
                            <h2 className={`text-sm font-bold uppercase tracking-widest ${color}`}>
                                {label}
                            </h2>
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-white/5 text-text-muted text-xs font-bold border border-border-dark">
                                {list.length}
                            </span>
                        </div>
                        <div className="flex flex-col gap-4">
                            {list.map(workshop => (
                                <WorkshopAccordionItem
                                    key={workshop.id}
                                    workshop={workshop}
                                    defaultOpen={expandedWorkshopId === workshop.id}
                                    isRegistrationClosed={isRestricted}
                                    onUpdate={onUpdate}
                                    onMonitorSeats={onMonitorSeats}
                                    onEdit={onEdit}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ── WorkshopImageModal ────────────────────────────────────────────────────────
function WorkshopImageModal({ workshop, currentImage, onClose, onUpdated }) {
    const [imageFile, setImageFile] = useState(null)
    const [imagePreview, setImagePreview] = useState(currentImage || null)
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const { addToast } = useToast()

    const handleImageSelect = (file) => {
        if (!file) return
        const allowed = ['image/jpeg', 'image/png', 'image/webp']
        if (!allowed.includes(file.type)) {
            addToast('Only JPEG, PNG, or WEBP images are allowed', 'error')
            return
        }
        if (file.size > 2 * 1024 * 1024) {
            addToast('Image must be under 2MB', 'error')
            return
        }
        setImageFile(file)
        const blobUrl = URL.createObjectURL(file)
        // Revoke previous blob URL to avoid memory leak
        if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview)
        }
        setImagePreview(blobUrl)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        handleImageSelect(file)
    }

    const handleSave = async () => {
        if (!imageFile) return
        setIsUploading(true)
        try {
            const result = await api.uploadWorkshopImage(workshop.id, imageFile)
            addToast('Preview image uploaded successfully!', 'success')
            // Use the server-returned imageUrl (real data URI) — not the local blob URL
            // This ensures the thumbnail remains valid even after a page reload
            const savedUrl = result?.imageUrl || imagePreview
            // Revoke local blob URL now that we have the server URL
            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview)
            }
            onUpdated(savedUrl)
            onClose()
        } catch (err) {
            addToast('Failed to upload image: ' + err.message, 'error')
        } finally {
            setIsUploading(false)
        }
    }

    const handleRemove = async () => {
        setIsUploading(true)
        try {
            await api.deleteWorkshopImage(workshop.id)
            addToast('Preview image removed', 'success')
            onUpdated(null)
            onClose()
        } catch (err) {
            addToast('Failed to remove image: ' + err.message, 'error')
        } finally {
            setIsUploading(false)
        }
    }

    const hasExistingImage = !!currentImage && !imageFile
    const canSave = !!imageFile

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white border border-border-dark w-full max-w-md rounded-2xl shadow-2xl m-4 animate-in zoom-in-95">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-dark">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-[18px]">image</span>
                        </div>
                        <div>
                            <h3 className="text-gray-800 font-bold text-base">Workshop Preview Image</h3>
                            <p className="text-text-muted text-xs">{workshop.code} — {workshop.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={isUploading} className="text-text-muted hover:text-primary disabled:opacity-50">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 flex flex-col gap-4">
                    {/* Dropzone */}
                    <div
                        className={`relative rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden ${isDragging ? 'border-primary bg-primary/10' : imagePreview ? 'border-primary/40' : 'border-border-dark hover:border-primary/50'
                            }`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                    >
                        {imagePreview ? (
                            <div className="relative group">
                                <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                    <label className="cursor-pointer bg-primary text-background-dark text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-yellow-400 transition-colors">
                                        <span className="material-symbols-outlined text-sm">upload</span>
                                        Change Image
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={(e) => handleImageSelect(e.target.files[0])}
                                        />
                                    </label>
                                </div>
                                {imageFile && (
                                    <div className="absolute top-2 right-2 bg-primary text-background-dark text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        New — not saved yet
                                    </div>
                                )}
                                {!imageFile && hasExistingImage && (
                                    <div className="absolute top-2 left-2 bg-green-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                        Saved
                                    </div>
                                )}
                            </div>
                        ) : (
                            <label className="cursor-pointer flex flex-col items-center justify-center gap-3 py-12 px-4 w-full">
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl text-primary/60">add_photo_alternate</span>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-gray-800 font-medium">Drag & drop your image here</p>
                                    <p className="text-xs text-text-muted mt-1">or <span className="text-primary font-bold">click to browse</span></p>
                                    <p className="text-xs text-text-muted/50 mt-2">JPEG, PNG, WEBP · max 2MB</p>
                                </div>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => handleImageSelect(e.target.files[0])}
                                />
                            </label>
                        )}
                    </div>

                    {/* Info pill */}
                    <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <span className="material-symbols-outlined text-blue-400 text-[16px] mt-0.5">info</span>
                        <p className="text-blue-300 text-xs leading-relaxed">
                            This image will be shown as the workshop card thumbnail on the student selection page. Recommended size: <strong>16:9</strong> or wider.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1">
                        {hasExistingImage && !imageFile && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                            >
                                {isUploading ? <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">delete</span>}
                                Remove
                            </button>
                        )}
                        {imageFile && (
                            <button
                                type="button"
                                onClick={() => {
                                    // Revoke blob URL when cancelling to free memory
                                    if (imagePreview && imagePreview.startsWith('blob:')) {
                                        URL.revokeObjectURL(imagePreview)
                                    }
                                    setImageFile(null)
                                    setImagePreview(currentImage || null)
                                }}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-4 py-2 text-text-muted hover:text-primary font-bold text-sm disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isUploading}
                            className={`flex items-center gap-2 px-4 py-2 text-text-muted hover:text-primary font-bold text-sm disabled:opacity-50 ${imageFile || hasExistingImage ? '' : 'ml-auto'}`}
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!canSave || isUploading}
                            className="ml-auto flex items-center gap-2 px-6 py-2 bg-primary text-background-dark font-bold rounded-lg text-sm hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isUploading ? <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">save</span>}
                            {isUploading ? 'Uploading...' : 'Save Image'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── WorkshopAccordionItem ─────────────────────────────────────────────────────
function WorkshopAccordionItem({ workshop, defaultOpen = false, isRegistrationClosed = false, onUpdate, onMonitorSeats, onEdit }) {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    const [students, setStudents] = useState([])
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false)
    const [isImageModalOpen, setIsImageModalOpen] = useState(false)
    const [currentPreviewImage, setCurrentPreviewImage] = useState(workshop.previewImage || null)

    useEffect(() => {
        if (defaultOpen) {
            setIsOpen(true)
            if (students.length === 0) loadStudents()
        }
    }, [defaultOpen])

    const loadStudents = async () => {
        setLoading(true)
        try {
            const response = await api.getEnrolledStudents(workshop.id)
            setStudents(response.students || [])
        } catch (err) {
            console.error('Failed to load students', err)
        } finally {
            setLoading(false)
        }
    }

    const toggle = () => {
        if (!isOpen && students.length === 0) {
            loadStudents()
        }
        setIsOpen(!isOpen)
    }

    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nim.includes(searchQuery)
    )

    return (
        <div id={`workshop-${workshop.id}`} className="group bg-white rounded-xl border border-primary/20 ring-1 ring-primary/10 overflow-hidden scroll-mt-20">
            <div onClick={toggle} className="p-5 cursor-pointer hover:bg-primary-light/20 transition-all flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                <div className="flex gap-4">
                    {/* Thumbnail — shows preview image or code initials */}
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-primary/30 flex-shrink-0">
                        {currentPreviewImage ? (
                            <img src={currentPreviewImage} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                                {workshop.code.substring(0, 2).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className={`text-gray-800 text-lg font-bold transition-colors ${isOpen ? 'text-primary' : ''}`}>
                                {workshop.code} - {workshop.name}
                            </h3>
                            {workshop.workshopType && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-text-muted border border-white/10">
                                    {workshop.workshopType}
                                </span>
                            )}
                            {workshop.status && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${workshop.status === 'done' ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                                    {workshop.status === 'done' ? 'Done' : 'Active'}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            <p className="text-text-muted text-sm">
                                {workshop.credits} Credits • {workshop.room || 'Room TBD'}
                                {workshop.month && workshop.year && workshop.date ? (
                                    <span> • {new Date(workshop.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                ) : (
                                    workshop.month && workshop.year && (
                                        <span> • {['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][workshop.month]} {workshop.year}</span>
                                    )
                                )}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-primary/90 font-medium">
                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                {workshop.schedule || 'Schedule TBD'}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {currentPreviewImage && (
                        <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30">
                            <span className="material-symbols-outlined text-[12px] text-green-400">check_circle</span>
                            <span className="text-[10px] text-green-400 font-bold">Image set</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded text-xs text-gray-800 border border-border-dark">
                        <span className="material-symbols-outlined text-[16px] text-primary">group</span>
                        {workshop.enrolled || 0}/{workshop.quota} Enrolled
                    </div>
                    <span className={`material-symbols-outlined text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                </div>
            </div>

            {isOpen && (
                <div className="border-t border-border-dark bg-primary-light/40 animate-in fade-in slide-in-from-top-2">
                    <div className="p-5 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-border-dark">
                        <div className="flex flex-col gap-2 w-full md:max-w-md">
                            <div className="relative w-full">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
                                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-border-dark rounded-lg py-2 pl-10 pr-4 text-sm text-gray-800 focus:outline-none focus:border-primary placeholder:text-[#6b6754]" placeholder="Search student..." />
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* EDIT — disabled when registration closed */}
                            <button
                                onClick={() => !isRegistrationClosed && onEdit && onEdit(workshop)}
                                disabled={isRegistrationClosed}
                                title={isRegistrationClosed ? 'Registration is closed — editing disabled' : 'Edit workshop'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${isRegistrationClosed
                                        ? 'bg-white/5 border border-white/10 text-text-muted cursor-not-allowed opacity-50'
                                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30 cursor-pointer'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                Edit
                            </button>

                            {/* UPLOAD IMAGE — always available */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsImageModalOpen(true) }}
                                className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/50 text-violet-400 text-sm font-bold hover:bg-violet-500/30 transition-colors whitespace-nowrap"
                                title="Upload or change workshop preview image"
                            >
                                <span className="material-symbols-outlined text-[18px]">image</span>
                                Image
                                {currentPreviewImage && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[#1d1b14]"></span>
                                )}
                            </button>

                            {/* MONITOR SEATS — always available */}
                            <button
                                onClick={() => onMonitorSeats(workshop.id)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 border border-primary/50 text-primary text-sm font-bold hover:bg-primary/30 transition-colors whitespace-nowrap"
                            >
                                <span className="material-symbols-outlined text-[18px]">grid_view</span>
                                Monitor Seats
                            </button>

                            {/* EXTEND — disabled when registration closed */}
                            <button
                                onClick={() => !isRegistrationClosed && setIsQuotaModalOpen(true)}
                                disabled={isRegistrationClosed}
                                title={isRegistrationClosed ? 'Registration is closed — extending disabled' : 'Extend quota'}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${isRegistrationClosed
                                        ? 'bg-white/5 border border-white/10 text-text-muted cursor-not-allowed opacity-50'
                                        : 'border border-primary/30 text-primary hover:bg-primary-hover cursor-pointer'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                Extend
                            </button>
                        </div>
                    </div>

                    {isRegistrationClosed && (
                        <div className="mx-5 mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-orange-400 text-[18px]">lock_clock</span>
                            <p className="text-orange-400 text-xs font-medium">
                                {workshop.status === 'done' ? 'This workshop is completed.' : 'Registration is closed.'} Editing and quota extension are disabled.
                            </p>
                        </div>
                    )}

                    <div className="divide-y divide-border-dark max-h-[400px] overflow-y-auto custom-scrollbar mt-2">
                        {loading ? (
                            <div className="p-10 text-center"><LoadingSpinner size="sm" text="Loading..." /></div>
                        ) : filteredStudents.length > 0 ? (
                            filteredStudents.map((student, idx) => (
                                <div key={student.id || idx} className="p-4 hover:bg-white/5 transition-colors flex justify-between items-center px-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">{student.name.charAt(0)}</div>
                                        <div>
                                            <p className="text-gray-800 text-sm font-medium">{student.name}</p>
                                            <p className="text-text-muted text-xs">{student.nim}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {/* Show Seat if available */}
                                        {student.seatNumber && (
                                            <span className="inline-block px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded mr-2">
                                                Seat {student.seatNumber}
                                            </span>
                                        )}
                                        <span className="text-gray-800 text-[11px]">{student.status || 'Active'}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-text-muted text-sm">No students found.</div>
                        )}
                    </div>
                </div>
            )}

            {isQuotaModalOpen && (
                <UpdateQuotaModal course={workshop} onClose={() => setIsQuotaModalOpen(false)} onSuccess={() => { setIsQuotaModalOpen(false); if (onUpdate) onUpdate(); }} />
            )}

            {isImageModalOpen && (
                <WorkshopImageModal
                    workshop={workshop}
                    currentImage={currentPreviewImage}
                    onClose={() => setIsImageModalOpen(false)}
                    onUpdated={(newImage) => setCurrentPreviewImage(newImage)}
                />
            )}
        </div>
    )
}

function UpdateQuotaModal({ course, onClose, onSuccess }) {
    const [quota, setQuota] = useState(course.quota)
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsLoading(true)
        try {
            await api.updateSessionQuota(course.id, parseInt(quota))
            onSuccess()
        } catch (err) {
            console.error(err)
            alert('Failed')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white border border-border-dark w-full max-w-md rounded-xl shadow-2xl m-4 animate-in zoom-in-95">
                <div className="flex items-center justify-between p-6 border-b border-border-dark">
                    <h3 className="text-xl font-bold text-gray-800">Extend Quota</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-primary"><span className="material-symbols-outlined">close</span></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    <p className="text-sm">Current: {course.quota}. Enrolled: {course.enrolled || 0}</p>
                    <input type="number" required min={course.enrolled || 0} value={quota} onChange={e => setQuota(e.target.value)} className="w-full bg-white border border-border-dark rounded-xl h-10 px-3 text-gray-800" />
                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-text-muted hover:text-primary font-bold text-sm">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-6 py-2 bg-primary text-background-dark font-bold rounded text-sm hover:bg-primary-hover">Update</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function TrafficControl() {
    const [metrics, setMetrics] = useState({ activeUsers: 0, waitingUsers: 0, limit: 5000 })
    const [newLimit, setNewLimit] = useState(5000)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [successMsg, setSuccessMsg] = useState(null)
    const [activeUserList, setActiveUserList] = useState(null)
    const [waitingUserList, setWaitingUserList] = useState(null)
    const [showActive, setShowActive] = useState(false)
    const [showWaiting, setShowWaiting] = useState(false)

    useEffect(() => {
        fetchMetrics()
        const interval = setInterval(fetchMetrics, 3000)
        return () => clearInterval(interval)
    }, [])

    const fetchMetrics = async () => {
        try {
            const data = await api.getQueueMetrics()
            if (data.success) setMetrics({ activeUsers: data.activeUsers, waitingUsers: data.waitingUsers, limit: data.limit })
        } catch (err) { console.error(err) } finally { setIsLoading(false) }
    }

    useEffect(() => { if (!isLoading && metrics.limit) setNewLimit(metrics.limit) }, [isLoading])

    const handleSaveLimit = async () => {
        setIsSaving(true)
        setSuccessMsg(null)
        try {
            await api.setQueueLimit(newLimit)
            setSuccessMsg("Updated!")
            fetchMetrics()
            setTimeout(() => setSuccessMsg(null), 3000)
        } catch (err) { alert(err.message) } finally { setIsSaving(false) }
    }

    const loadActiveUsers = async () => {
        if (showActive) { setShowActive(false); return }
        try {
            const data = await api.getQueueActiveUsers()
            setActiveUserList(data.users || [])
            setShowActive(true)
        } catch (err) { console.error(err) }
    }

    const loadWaitingUsers = async () => {
        if (showWaiting) { setShowWaiting(false); return }
        try {
            const data = await api.getQueueWaitingUsers()
            setWaitingUserList(data.users || [])
            setShowWaiting(true)
        } catch (err) { console.error(err) }
    }

    const UserList = ({ users, type }) => (
        <div className="mt-3 max-h-[200px] overflow-y-auto custom-scrollbar divide-y divide-border-dark border border-border-dark rounded-lg bg-white">
            {users.length === 0 ? (
                <p className="p-4 text-text-muted text-xs text-center">No users</p>
            ) : users.map((u, i) => (
                <div key={u.id || i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                        {u.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-gray-800 text-xs font-medium truncate">{u.name}</p>
                        <p className="text-text-muted text-[10px] truncate">{u.nimNidn} • {u.email}</p>
                    </div>
                    {type === 'waiting' && u.position && (
                        <span className="text-primary text-[10px] font-bold">#{u.position}</span>
                    )}
                </div>
            ))}
        </div>
    )

    return (
        <div className="flex-1 w-full flex flex-col items-center px-6 py-12 gap-8 max-w-4xl mx-auto animate-in fade-in custom-scrollbar overflow-y-auto">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-black tracking-tight uppercase text-gray-800">System Traffic Control</h1>
                <p className="text-text-muted text-sm">Real-time queue management for student registration periods.</p>
            </div>

            <div className="w-full max-w-2xl flex flex-col gap-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <section className="flex flex-col items-center justify-center p-8 bg-white border border-border-dark rounded-3xl shadow-xl relative overflow-hidden group hover:border-green-500/30 transition-colors">
                            <div className="absolute top-0 left-0 w-full h-1 bg-green-500/50"></div>
                            <div className="bg-green-500/10 p-2 rounded-full mb-4"><span className="material-symbols-outlined text-green-500">check_circle</span></div>
                            <p className="text-green-500 text-xs font-bold uppercase tracking-[0.2em] mb-2 text-center">Active Students</p>
                            <div className="flex flex-col items-center">
                                <span className="text-6xl font-black text-gray-800 tracking-tighter tabular-nums">{metrics.activeUsers.toLocaleString()}</span>
                                <p className="text-text-muted text-xs font-medium mt-1">Currently Selecting</p>
                            </div>
                        </section>
                        <button onClick={loadActiveUsers} className="w-full mt-2 py-1.5 text-xs font-bold text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg transition-colors flex items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">{showActive ? 'expand_less' : 'expand_more'}</span>
                            {showActive ? 'Hide Details' : 'View Details'}
                        </button>
                        {showActive && activeUserList && <UserList users={activeUserList} type="active" />}
                    </div>
                    <div>
                        <section className="flex flex-col items-center justify-center p-8 bg-white border border-border-dark rounded-3xl shadow-xl relative overflow-hidden group hover:border-green-500/30 transition-colors">
                            <div className="absolute top-0 left-0 w-full h-1 bg-primary/50"></div>
                            <div className="bg-primary/10 p-2 rounded-full mb-4"><span className="material-symbols-outlined text-primary">hourglass_top</span></div>
                            <p className="text-primary text-xs font-bold uppercase tracking-[0.2em] mb-2 text-center">Waiting Queue</p>
                            <div className="flex flex-col items-center">
                                <span className="text-6xl font-black text-gray-800 tracking-tighter tabular-nums">{metrics.waitingUsers.toLocaleString()}</span>
                                <p className="text-text-muted text-xs font-medium mt-1">In Line</p>
                            </div>
                        </section>
                        <button onClick={loadWaitingUsers} className="w-full mt-2 py-1.5 text-xs font-bold text-primary hover:text-primary-hover bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors flex items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">{showWaiting ? 'expand_less' : 'expand_more'}</span>
                            {showWaiting ? 'Hide Details' : 'View Details'}
                        </button>
                        {showWaiting && waitingUserList && <UserList users={waitingUserList} type="waiting" />}
                    </div>
                </div>

                <div className="bg-primary-light/40 border border-border-dark rounded-2xl p-6 shadow-2xl">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-gray-800 font-bold text-lg">Active User Limit</h3>
                                <p className="text-text-muted text-sm">Max capacity for concurrent active users.</p>
                            </div>
                            <div className="px-3 py-1 bg-white border border-border-dark rounded text-xs text-text-muted">Current: {metrics.limit}</div>
                        </div>
                        <div className="flex gap-4">
                            <input type="number" value={newLimit} onChange={(e) => setNewLimit(parseInt(e.target.value))} className="flex-1 bg-white border border-border-dark rounded-lg px-4 text-gray-800 font-bold text-center text-xl focus:border-primary focus:outline-none" />
                            <button onClick={handleSaveLimit} disabled={isSaving} className="px-8 bg-primary hover:bg-primary-hover text-white font-bold rounded-lg transition-colors disabled:opacity-50">
                                {isSaving ? 'Saving...' : 'Update Limit'}
                            </button>
                        </div>
                        {successMsg && <p className="text-green-500 text-sm font-bold text-center animate-in fade-in">{successMsg}</p>}
                    </div>
                </div>
            </div>
        </div>
    )
}


// ─── Mentor Feedback Summary Component ───────────────────────────────────────

function StarRow({ rating, maxStars = 5, size = 'base' }) {
    const sizeClass = size === 'sm' ? 'text-sm' : 'text-xl'
    return (
        <div className="flex gap-0.5">
            {Array.from({ length: maxStars }).map((_, i) => (
                <span key={i} className={`${sizeClass} ${i < Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
            ))}
        </div>
    )
}

function MentorFeedback() {
    const [summary, setSummary] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const [expandedWorkshop, setExpandedWorkshop] = useState(null)

    useEffect(() => {
        const load = async () => {
            setIsLoading(true)
            try {
                const data = await api.getMentorFeedback()
                setSummary(data)
            } catch (err) {
                setError(err.message || 'Failed to load feedback')
            } finally {
                setIsLoading(false)
            }
        }
        load()
    }, [])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <LoadingSpinner size="lg" text="Loading feedback..." />
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-10 flex items-center gap-3 text-red-400 bg-red-900/10 border border-red-500/20 rounded-xl m-6">
                <span className="material-symbols-outlined">error</span>
                <span>{error}</span>
            </div>
        )
    }

    const noFeedback = !summary || summary.totalRatings === 0

    return (
        <div className="p-6 lg:p-10 max-w-4xl mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-1 border-b border-border-dark pb-6">
                <div className="flex items-center gap-2 text-primary text-sm font-bold tracking-wider uppercase mb-2">
                    <span className="material-symbols-outlined text-[20px]">reviews</span>
                    <span>Student Feedback</span>
                </div>
                <h1 className="text-3xl font-black text-gray-800 tracking-tight">Workshop Ratings</h1>
                <p className="text-text-muted mt-1">All ratings submitted by students for your workshops.</p>
            </div>

            {noFeedback ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-text-muted">
                    <span className="material-symbols-outlined text-6xl opacity-30">reviews</span>
                    <p className="text-lg font-semibold">No ratings yet.</p>
                    <p className="text-sm opacity-60">Students can rate workshops after they are completed.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="col-span-1 sm:col-span-2 bg-white border border-primary/30 rounded-xl p-6 shadow-[0_0_20px_rgba(231,185,35,0.06)] flex flex-col gap-3">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Overall Average</p>
                            <div className="flex items-end gap-4">
                                <p className="text-6xl font-black text-gray-800 leading-none">{summary.overallAverage.toFixed(1)}</p>
                                <div className="flex flex-col gap-1 pb-1">
                                    <StarRow rating={summary.overallAverage} />
                                    <p className="text-text-muted text-sm">out of 5.0</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white border border-border-dark rounded-xl p-6 flex flex-col gap-2 justify-center">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total Reviews</p>
                            <p className="text-5xl font-black text-primary leading-none">{summary.totalRatings}</p>
                            <p className="text-text-muted text-sm">{(summary.workshops || []).length} workshops rated</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h2 className="text-sm font-bold text-text-muted uppercase tracking-widest">Per-Workshop Breakdown</h2>
                        {(summary.workshops || []).map(wf => (
                            <div key={wf.sessionId} className="bg-white border border-border-dark rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setExpandedWorkshop(expandedWorkshop === wf.sessionId ? null : wf.sessionId)}
                                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left"
                                >
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{wf.workshopCode}</span>
                                        <h3 className="text-base font-bold text-gray-800">{wf.workshopName}</h3>
                                    </div>
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-2xl font-black text-gray-800">{wf.averageRating.toFixed(1)}</p>
                                            <p className="text-[10px] text-text-muted">{wf.totalRatings} review{wf.totalRatings !== 1 ? 's' : ''}</p>
                                        </div>
                                        <StarRow rating={wf.averageRating} size="sm" />
                                        <span className="material-symbols-outlined text-text-muted transition-transform duration-200"
                                            style={{ transform: expandedWorkshop === wf.sessionId ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                            expand_more
                                        </span>
                                    </div>
                                </button>
                                {expandedWorkshop === wf.sessionId && (
                                    <div className="border-t border-border-dark divide-y divide-border-dark/50">
                                        {(wf.reviews || []).map((rev, idx) => (
                                            <div key={idx} className="p-4 flex flex-col gap-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                                            {rev.studentName?.charAt(0) || 'S'}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800">{rev.studentName}</p>
                                                            {rev.ratedAt && <p className="text-[10px] text-text-muted">{rev.ratedAt}</p>}
                                                        </div>
                                                    </div>
                                                    <StarRow rating={rev.rating} size="sm" />
                                                </div>
                                                {rev.review && (
                                                    <p className="text-sm text-text-muted italic ml-11">"{rev.review}"</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
