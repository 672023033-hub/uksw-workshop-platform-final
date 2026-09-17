import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { api } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';

export default function EnrollmentHistory() {
    const navigate = useNavigate();
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedEnrollment, setSelectedEnrollment] = useState(null);
    const [rating, setRating] = useState(5);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [review, setReview] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [toast, setToast] = useState(null);

    // Sidebar filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'completed' | 'upcoming'
    const [yearFilter, setYearFilter] = useState('all');
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    useEffect(() => {
        loadHistory();
    }, []);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const loadHistory = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getEnrollmentHistory();
            setHistory(data.history || []);
        } catch (err) {
            setError('Failed to load enrollment history.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRateClick = (enrollment) => {
        setSelectedEnrollment(enrollment);
        setRating(5);
        setHoveredRating(0);
        setReview('');
        setShowModal(true);
    };

    const handleSubmitRating = async (e) => {
        e.preventDefault();
        if (!selectedEnrollment) return;
        setIsSubmitting(true);
        try {
            await api.rateWorkshop(selectedEnrollment.id, rating, review);
            setShowModal(false);
            showToast('Rating submitted successfully!', 'success');
            loadHistory();
        } catch (err) {
            showToast(err.message || 'Failed to submit rating.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Derive available years from data
    const availableYears = useMemo(() => {
        const years = new Set();
        history.forEach(h => {
            if (h.date) {
                const y = h.date.split('-')[0];
                if (y) years.add(y);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [history]);

    // Filtered list
    const filtered = useMemo(() => {
        return history.filter(h => {
            const matchSearch = !searchTerm ||
                h.workshopName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                h.workshopCode?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchStatus = statusFilter === 'all' ||
                (statusFilter === 'completed' && h.isCompleted) ||
                (statusFilter === 'upcoming' && !h.isCompleted);
            const matchYear = yearFilter === 'all' || (h.date && h.date.startsWith(yearFilter));
            return matchSearch && matchStatus && matchYear;
        });
    }, [history, searchTerm, statusFilter, yearFilter]);

    const completed = filtered.filter(h => h.isCompleted);
    const upcoming = filtered.filter(h => !h.isCompleted);

    if (isLoading) {
        return (
            <div className="bg-background-dark min-h-screen flex items-center justify-center">
                <LoadingSpinner size="lg" text="Loading enrollment history..." />
            </div>
        );
    }

    return (
        <div className="bg-background-dark min-h-screen flex flex-col text-gray-800 overflow-hidden">
            <Header title="UKSW Workshops Platform" />

            {/* Toast */}
            {toast && (
                <div className={`fixed top-20 right-6 z-50 px-5 py-4 rounded-lg shadow-2xl border flex items-center gap-3 transition-all duration-300 ${toast.type === 'error'
                    ? 'bg-red-900/90 border-red-500/50 text-white'
                    : 'bg-green-900/90 border-green-500/50 text-white'
                    }`}>
                    <span className="material-symbols-outlined text-[22px]">
                        {toast.type === 'error' ? 'error' : 'check_circle'}
                    </span>
                    <span className="font-semibold text-sm">{toast.message}</span>
                </div>
            )}

            {/* Rating Modal */}
            {showModal && selectedEnrollment && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-surface-dark border border-border-dark rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="p-6 pb-4 border-b border-border-dark">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Rate Workshop</p>
                                    <h2 className="text-lg font-bold text-gray-800 leading-snug">{selectedEnrollment.workshopName}</h2>
                                </div>
                                <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-primary mt-1 flex-shrink-0 transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>
                        <form onSubmit={handleSubmitRating} className="p-6 flex flex-col gap-6">
                            <div className="flex flex-col items-center gap-3">
                                <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Your Rating</label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button type="button" key={star}
                                            onClick={() => setRating(star)}
                                            onMouseEnter={() => setHoveredRating(star)}
                                            onMouseLeave={() => setHoveredRating(0)}
                                            className="text-4xl transition-all duration-150 hover:scale-125 focus:outline-none"
                                        >
                                            <span className={`${(hoveredRating || rating) >= star ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-sm text-text-muted">{['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][hoveredRating || rating]}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-text-muted uppercase tracking-widest">Review <span className="text-text-muted/50 normal-case font-normal">(Optional)</span></label>
                                <textarea value={review} onChange={(e) => setReview(e.target.value)}
                                    className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-3 text-sm text-gray-800 placeholder:text-text-muted/40 focus:outline-none focus:border-primary resize-none transition-colors"
                                    rows="3" placeholder="Share your experience..." />
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="px-5 py-2 rounded-lg border border-border-dark text-text-muted hover:text-primary transition-colors text-sm font-bold">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="px-5 py-2 rounded-lg bg-primary text-background-dark font-bold text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center gap-2">
                                    {isSubmitting ? (
                                        <><span className="material-symbols-outlined text-[18px] animate-spin">refresh</span> Submitting...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-[18px]">star</span> Submit Rating</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">

                {/* Mobile sidebar overlay background */}
                {showMobileFilters && (
                    <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setShowMobileFilters(false)} />
                )}

                {/* LEFT SIDEBAR */}
                <aside className={`
                    fixed inset-y-0 left-0 z-50 pt-[57px] w-72 bg-background-dark border-r border-border-dark p-6 flex flex-col gap-8 transition-transform duration-300
                    lg:relative lg:translate-x-0 lg:pt-0 lg:flex lg:z-auto
                    ${showMobileFilters ? 'translate-x-0' : '-translate-x-full'}
                `}>
                    {/* Mobile close */}
                    <div className="flex justify-between items-center lg:hidden">
                        <h3 className="font-bold text-gray-800 text-lg">Filters</h3>
                        <button onClick={() => setShowMobileFilters(false)} className="text-text-muted hover:text-primary">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Header label (desktop) */}
                    <div className="hidden lg:flex flex-col gap-1 pt-2">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Enrollment History</p>
                        <h2 className="text-base font-bold text-gray-800">Filters</h2>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Search</label>
                        <div className="flex items-stretch rounded-lg bg-surface-dark border border-border-dark focus-within:border-primary transition-colors">
                            <div className="flex items-center justify-center pl-3 text-text-muted">
                                <span className="material-symbols-outlined text-[18px]">search</span>
                            </div>
                            <input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-transparent border-none text-gray-800 text-sm focus:ring-0 placeholder:text-text-muted/50 py-2.5 pl-2 pr-3"
                                placeholder="Name or code..."
                            />
                        </div>
                    </div>

                    {/* Status Filter */}
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Status</label>
                            {statusFilter !== 'all' && (
                                <button onClick={() => setStatusFilter('all')} className="text-[10px] text-primary hover:underline">Clear</button>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {[
                                { key: 'all', label: 'All Enrollments', icon: 'history_edu' },
                                { key: 'completed', label: 'Completed', icon: 'task_alt' },
                                { key: 'upcoming', label: 'Upcoming / Active', icon: 'pending' },
                            ].map(opt => (
                                <button key={opt.key}
                                    onClick={() => setStatusFilter(opt.key)}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all ${statusFilter === opt.key
                                        ? 'bg-primary/15 border border-primary/30 text-primary'
                                        : 'border border-transparent text-text-muted hover:bg-surface-dark hover:text-primary'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{opt.icon}</span>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Year Filter */}
                    {availableYears.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Year</label>
                                {yearFilter !== 'all' && (
                                    <button onClick={() => setYearFilter('all')} className="text-[10px] text-primary hover:underline">Clear</button>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {availableYears.map(year => (
                                    <button key={year}
                                        onClick={() => setYearFilter(year)}
                                        className={`py-2 rounded-lg text-xs font-bold transition-all ${yearFilter === year
                                            ? 'bg-primary text-background-dark'
                                            : 'border border-border-dark text-text-muted hover:border-primary/50 hover:text-primary'
                                            }`}
                                    >
                                        {year}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div className="mt-auto flex flex-col gap-2 p-4 bg-surface-dark rounded-xl border border-border-dark">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Showing</p>
                        <p className="text-2xl font-black text-gray-800">{filtered.length} <span className="text-sm font-normal text-text-muted">enrollments</span></p>
                        <div className="flex gap-3 text-xs mt-1">
                            <span className="text-green-400 font-bold">{completed.length} done</span>
                            <span className="text-text-muted">·</span>
                            <span className="text-blue-400 font-bold">{upcoming.length} upcoming</span>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT */}
                <main className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">

                        {/* Page header */}
                        <div className="border-b border-border-dark pb-6 flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <button
                                    onClick={() => navigate('/workshop-selection')}
                                    className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary transition-colors mb-4 group"
                                >
                                    <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                                    Back to Workshop Selection
                                </button>
                                <div className="flex items-center gap-2 text-primary text-sm font-bold tracking-wider uppercase mb-2">
                                    <span className="material-symbols-outlined text-[20px]">history_edu</span>
                                    <span>Student Portfolio</span>
                                </div>
                                <h1 className="text-3xl lg:text-4xl font-black text-gray-800 tracking-tight">Enrollment History</h1>
                                <p className="text-text-muted mt-1">All workshops you have enrolled in.</p>
                            </div>
                            {/* Mobile filter toggle */}
                            <button
                                onClick={() => setShowMobileFilters(true)}
                                className="lg:hidden flex items-center gap-2 px-4 py-2 bg-surface-dark border border-border-dark rounded-lg text-sm font-bold text-primary"
                            >
                                <span className="material-symbols-outlined text-[18px]">tune</span>
                                Filters
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-center gap-3 bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-400">
                                <span className="material-symbols-outlined">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {filtered.length === 0 && !error ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4 text-text-muted">
                                <span className="material-symbols-outlined text-6xl opacity-30">school</span>
                                <p className="text-lg font-semibold">No enrollments found.</p>
                                <p className="text-sm opacity-60">Try adjusting your filters.</p>
                            </div>
                        ) : (
                            <>
                                {completed.length > 0 && (
                                    <section className="flex flex-col gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-green-400">task_alt</span>
                                            <h2 className="text-lg font-bold text-gray-800">
                                                Completed <span className="text-text-muted font-normal text-sm ml-1">({completed.length})</span>
                                            </h2>
                                        </div>
                                        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                            {completed.map(item => (
                                                <HistoryCard key={item.id} item={item} onRate={handleRateClick} />
                                            ))}
                                        </div>
                                    </section>
                                )}
                                {upcoming.length > 0 && (
                                    <section className="flex flex-col gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-blue-400">pending</span>
                                            <h2 className="text-lg font-bold text-gray-800">
                                                Upcoming / Active <span className="text-text-muted font-normal text-sm ml-1">({upcoming.length})</span>
                                            </h2>
                                        </div>
                                        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                            {upcoming.map(item => (
                                                <HistoryCard key={item.id} item={item} onRate={handleRateClick} />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

function StarDisplay({ rating, maxStars = 5 }) {
    return (
        <div className="flex gap-0.5">
            {Array.from({ length: maxStars }).map((_, i) => (
                <span key={i} className={`text-lg ${i < rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
            ))}
        </div>
    );
}

function HistoryCard({ item, onRate }) {
    const isCompleted = item.isCompleted;
    const hasRated = item.rating > 0;

    const formatDate = (dateStr) => {
        if (!dateStr) return 'TBA';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
        } catch { return dateStr; }
    };

    return (
        <div className={`relative flex flex-col rounded-xl border p-5 transition-all duration-200 ${isCompleted
            ? hasRated
                ? 'border-primary/40 bg-surface-dark shadow-[0_0_18px_rgba(231,185,35,0.08)]'
                : 'border-green-500/30 bg-surface-dark'
            : 'border-border-dark bg-surface-dark/60'
            }`}>
            {/* Status badge */}
            <div className={`absolute top-4 right-4 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isCompleted
                ? hasRated ? 'bg-primary/15 text-primary' : 'bg-green-500/15 text-green-400'
                : 'bg-blue-500/15 text-blue-400'
                }`}>
                <span className="material-symbols-outlined text-[13px]">
                    {isCompleted ? (hasRated ? 'star' : 'task_alt') : 'pending'}
                </span>
                {isCompleted ? (hasRated ? 'Rated' : 'Completed') : 'Upcoming'}
            </div>

            <div className="flex flex-col gap-2 mb-4 pr-20">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{item.workshopCode}</span>
                <h3 className="text-base font-bold text-gray-800 leading-snug">{item.workshopName}</h3>
                <p className="text-xs text-text-muted">{item.credits} Credits</p>
            </div>

            <div className="flex flex-col gap-2 text-sm text-text-muted mb-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary/70">calendar_today</span>
                    <span className="text-xs">{formatDate(item.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary/70">person</span>
                    <span className="text-xs">{item.mentor}</span>
                </div>
            </div>

            {isCompleted && (
                <div className="border-t border-border-dark pt-4 mt-auto">
                    {hasRated ? (
                        <div className="flex flex-col gap-2">
                            <StarDisplay rating={item.rating} />
                            {item.review && <p className="text-xs text-text-muted italic line-clamp-2">"{item.review}"</p>}
                            <p className="text-[10px] text-text-muted/50">Rated on {item.ratedAt?.split(' ')[0] || '—'}</p>
                        </div>
                    ) : (
                        <button onClick={() => onRate(item)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary hover:text-background-dark transition-all">
                            <span className="material-symbols-outlined text-[18px]">star_rate</span>
                            Rate Workshop
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
