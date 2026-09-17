import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'


export default function SeatMap({ workshopSessionId, onSeatSelected, readOnly = false }) {
    const [seats, setSeats] = useState([])
    const [selectedSeat, setSelectedSeat] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)
    const { user } = useAuth()

    useEffect(() => { // kode 9 : menunjukkan proses pembaruan status kursi pada antarmuka pengguna
        loadSeats()

        // Listen for real-time seat updates via WebSocket
        api.connectWebSocket(handleSeatUpdate)

        return () => {
            api.disconnectWebSocket(handleSeatUpdate)
        }
    }, [workshopSessionId])


    const loadSeats = async () => {
        // Validate sessionId before making API call
        // Check for undefined, null, or empty string
        if (!workshopSessionId || workshopSessionId.trim() === '') {
            setError('Invalid workshop session ID. Please select a valid workshop.')
            setIsLoading(false)
            return
        }

        try {
            setIsLoading(true)
            const response = await api.getWorkshopSeats(workshopSessionId)
            if (response.success) {
                setSeats(response.seats || [])
            }
        } catch (err) {
            setError('Failed to load seats')
            console.error(err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSeatUpdate = (message) => {
        if (message.type === 'SEAT_STATUS_UPDATE') {
            setSeats(prevSeats => prevSeats.map(seat =>
                seat.id === message.payload.seatId
                    ? {
                        ...seat,
                        status: message.payload.status,
                        reservedBy: message.payload.reservedBy || null
                    }
                    : seat
            ))
        } else if (message.type === 'SEATS_REGENERATED') {
            // Quota changed - seats were regenerated, reload all seats
            if (message.payload.sessionId === workshopSessionId) {
                console.log('Seats regenerated, reloading...', message.payload)
                loadSeats()
            }
        }
    }


    const handleSeatClick = async (seat) => {
        if (readOnly) return

        // 1. DESELECT: Clicking the currently selected seat
        if (selectedSeat && selectedSeat.id === seat.id) {
            try {
                await api.releaseSeat(seat.id)

                // Reset selection state
                setSelectedSeat(null)
                if (onSeatSelected) onSeatSelected(null)

                // Update UI: Mark this seat as AVAILABLE
                setSeats(prevSeats => prevSeats.map(s =>
                    s.id === seat.id ? { ...s, status: 'AVAILABLE', reservedBy: null } : s
                ))
            } catch (err) {
                console.error('Failed to deselect seat:', err)
                setError('Failed to deselect seat')
            }
            return
        }

        // 2. CHECK AVAILABILITY (for new selection)
        if (seat.status !== 'AVAILABLE') return

        // 3. SWAP SEAT: Release old, Reserve new
        try {
            // If another seat was selected, release it first
            if (selectedSeat) {
                try {
                    await api.releaseSeat(selectedSeat.id)
                } catch (ignore) {
                    // Ignore release errors, maybe it expired or was already released
                    console.warn('Silent release failed (non-critical)', ignore)
                }
            }

            // Reserve the new seat
            const response = await api.reserveSeat(seat.id)

            if (response.success) {
                const previousSeatId = selectedSeat ? selectedSeat.id : null

                // Update selection state
                setSelectedSeat(seat)
                if (onSeatSelected) onSeatSelected(seat)

                // Update UI: 
                // 1. Mark NEW seat as RESERVED by current user
                // 2. Mark OLD seat as AVAILABLE (visual fix for multiple selection)
                setSeats(prevSeats => prevSeats.map(s => {
                    if (s.id === seat.id) return { ...s, status: 'RESERVED', reservedBy: user.id }
                    if (s.id === previousSeatId) return { ...s, status: 'AVAILABLE', reservedBy: null }
                    return s
                }))
            }
        } catch (err) {
            console.error('Failed to reserve seat:', err)
            setError(err.message || 'Failed to reserve seat')
            // Refresh seats to show true state (e.g. if it was taken by someone else)
            loadSeats()
        }
    }


    // Group seats by rows
    const seatsByRow = seats.reduce((acc, seat) => {
        if (!acc[seat.rowLetter]) {
            acc[seat.rowLetter] = []
        }
        acc[seat.rowLetter].push(seat)
        return acc
    }, {})

    // Sort rows alphabetically
    const sortedRows = Object.keys(seatsByRow).sort()

    const getSeatClassName = (seat) => {
        const baseClass = 'seat'
        if (seat.status === 'OCCUPIED') return `${baseClass} occupied`
        if (seat.status === 'RESERVED') {
            // Check if this seat is reserved by the current user
            if (seat.reservedBy === user?.id || (selectedSeat && selectedSeat.id === seat.id)) {
                return `${baseClass} selected`
            }
            // Reserved by another user
            return `${baseClass} reserved`
        }
        return `${baseClass} available`
    }

    if (isLoading) {
        return <div className="text-center py-8">Loading seats...</div>
    }

    return (
        <div className="seat-map-container">
            <div className="seat-map-header mb-6">
                <h3 className="text-xl font-bold text-white mb-4">
                    {readOnly ? 'Live Seat Monitor' : 'Select Your Seat'}
                </h3>

                {/* Legend */}
                <div className="flex gap-4 justify-center text-sm mb-6 flex-wrap">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-green-500 border border-green-600"></div>
                        <span className="text-text-muted">Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-orange-500 border border-orange-600"></div>
                        <span className="text-text-muted">Reserved (Others)</span>
                    </div>
                    {!readOnly && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded bg-yellow-400 border border-yellow-500 shadow-lg shadow-yellow-400/50"></div>
                            <span className="text-text-muted">Your Selection</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-red-500 border border-red-600"></div>
                        <span className="text-text-muted">Occupied</span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-500 text-red-400 p-3 rounded mb-4">
                    {error}
                </div>
            )}

            {/* Stage/Screen indicator */}
            <div className="stage mb-8">
                <div className="bg-surface-dark border border-border-dark rounded-lg py-3 text-center">
                    <span className="text-text-muted text-sm uppercase tracking-wider">Screen / Stage</span>
                </div>
            </div>

            {/* Seat Grid */}
            <div className="seat-grid space-y-3 overflow-x-auto pb-4">
                {sortedRows.map(rowLetter => (
                    <div key={rowLetter} className="seat-row flex items-center gap-2 min-w-max mx-auto">
                        <span className="row-label w-8 text-center font-bold text-primary sticky left-0 z-10 bg-surface-dark">
                            {rowLetter}
                        </span>
                        <div className="seats flex gap-2 flex-1 justify-center">
                            {seatsByRow[rowLetter]
                                .sort((a, b) => a.columnNumber - b.columnNumber)
                                .map(seat => (
                                    <button
                                        key={seat.id}
                                        className={`seat-button ${getSeatClassName(seat)}`}
                                        onClick={() => handleSeatClick(seat)}
                                        disabled={readOnly || seat.status !== 'AVAILABLE'}
                                        title={`${seat.seatNumber} - ${seat.status}`}
                                    >
                                        <span className="seat-number text-xs font-bold">
                                            {seat.columnNumber}
                                        </span>
                                    </button>
                                ))
                            }
                        </div>
                        <span className="row-label w-8 text-center font-bold text-primary">
                            {rowLetter}
                        </span>
                    </div>
                ))}
            </div>

            {!readOnly && selectedSeat && (
                <div className="mt-6 p-4 bg-primary/10 border border-primary rounded-lg">
                    <p className="text-white font-bold">
                        Selected Seat: <span className="text-primary">{selectedSeat.seatNumber}</span>
                    </p>
                    <p className="text-text-muted text-sm mt-1">
                        Click "Confirm Enrollment" to finalize your selection
                    </p>
                </div>
            )}

            <style jsx>{`
                .seat-button {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    transition: all 0.2s;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-center;
                    border: 2px solid;
                }

                .seat-button.available {
                    background-color: rgb(34 197 94);
                    border-color: rgb(22 163 74);
                    color: white;
                }

                .seat-button.available:hover {
                    transform: scale(1.1);
                    box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
                }

                .seat-button.reserved {
                    background-color: rgb(249 115 22);
                    border-color: rgb(234 88 12);
                    color: white;
                    cursor: not-allowed;
                    opacity: 0.7;
                }

                .seat-button.selected {
                    background-color: rgb(250 204 21);
                    border-color: rgb(234 179 8);
                    color: rgb(24, 24, 27);
                    transform: scale(1.15);
                    box-shadow: 0 0 20px rgba(250, 204, 21, 0.8);
                    animation: pulse-glow 2s ease-in-out infinite;
                }

                @keyframes pulse-glow {
                    0%, 100% {
                        box-shadow: 0 0 20px rgba(250, 204, 21, 0.8);
                    }
                    50% {
                        box-shadow: 0 0 30px rgba(250, 204, 21, 1);
                    }
                }


                .seat-button.occupied {
                    background-color: rgb(239 68 68);
                    border-color: rgb(220 38 38);
                    color: white;
                    cursor: not-allowed;
                    opacity: 0.6;
                }

                .seat-button:disabled {
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    )
}
