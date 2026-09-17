import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'

function UserManagement() {
    const [users, setUsers] = useState([])
    const [students, setStudents] = useState([])
    const [passwordResets, setPasswordResets] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [activeSubTab, setActiveSubTab] = useState('users')
    const [filterStatus, setFilterStatus] = useState('all')
    const [resetFilterStatus, setResetFilterStatus] = useState('PENDING')
    const [searchQuery, setSearchQuery] = useState('')
    const [confirmAction, setConfirmAction] = useState(null)
    const [editingCredit, setEditingCredit] = useState(null)
    const [creditSaving, setCreditSaving] = useState(null)
    const [expandedStudent, setExpandedStudent] = useState(null)
    const [resetActionLoading, setResetActionLoading] = useState(null)

    useEffect(() => {
        if (activeSubTab === 'users') {
            loadUsers()
        } else if (activeSubTab === 'credits') {
            loadStudents()
        } else if (activeSubTab === 'resets') {
            loadPasswordResets()
        }
    }, [filterStatus, activeSubTab, resetFilterStatus])

    const loadPasswordResets = async () => {
        setIsLoading(true)
        try {
            const response = await api.getPasswordResetRequests(resetFilterStatus)
            setPasswordResets(response.requests || [])
        } catch (err) {
            console.error('Failed to load password resets:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleApproveReset = async (requestId) => {
        setResetActionLoading(requestId + '_approve')
        try {
            await api.approvePasswordReset(requestId)
            loadPasswordResets()
        } catch (err) {
            alert(err.message || 'Failed to approve reset')
        } finally {
            setResetActionLoading(null)
        }
    }

    const handleRejectReset = async (requestId) => {
        setResetActionLoading(requestId + '_reject')
        try {
            await api.rejectPasswordReset(requestId)
            loadPasswordResets()
        } catch (err) {
            alert(err.message || 'Failed to reject reset')
        } finally {
            setResetActionLoading(null)
        }
    }


    const loadUsers = async () => {
        setIsLoading(true)
        try {
            const response = await api.getAllUsers(filterStatus)
            setUsers(response.users || [])
        } catch (err) {
            console.error('Failed to load users:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const loadStudents = async () => {
        setIsLoading(true)
        try {
            const response = await api.getAllStudents()
            setStudents(response.students || [])
        } catch (err) {
            console.error('Failed to load students:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleApprove = async (user) => {
        try {
            await api.approveUser(user.id)
            setConfirmAction(null)
            loadUsers()
        } catch (err) {
            alert(err.message || 'Failed to approve user')
        }
    }

    const handleRemove = async (user) => {
        try {
            await api.rejectUser(user.id)
            setConfirmAction(null)
            loadUsers()
        } catch (err) {
            alert(err.message || 'Failed to remove user')
        }
    }

    const handleSaveCredit = async (studentUserId, newLimit) => {
        setCreditSaving(studentUserId)
        try {
            await api.updateStudentCreditLimit(studentUserId, parseInt(newLimit))
            setEditingCredit(null)
            setStudents(prev => prev.map(s =>
                s.userId === studentUserId ? { ...s, maxCredits: parseInt(newLimit) } : s
            ))
        } catch (err) {
            alert(err.message || 'Failed to update credit limit')
        } finally {
            setCreditSaving(null)
        }
    }

    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.nimNidn?.includes(searchQuery) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredStudents = students.filter(s =>
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.nim?.includes(searchQuery) ||
        s.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const getStatusBadge = (user) => {
        if (user.approvalStatus === 'APPROVED') {
            return <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded border border-green-500/30">Approved</span>
        } else if (user.approvalStatus === 'PENDING') {
            return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded border border-yellow-500/30">Pending</span>
        } else {
            return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded border border-red-500/30">Rejected</span>
        }
    }

    return (
        <div className="p-6 lg:p-10 mx-auto max-w-7xl flex flex-col gap-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-white tracking-tight text-[32px] font-bold leading-tight">User Management</h1>
                    <p className="text-text-muted text-base font-normal leading-normal mt-1">
                        Manage user registrations, approvals, and student credit limits
                    </p>
                </div>
            </div>

            {/* Sub-Tab Toggle */}
            <div className="flex items-center gap-1 p-1 bg-surface-dark rounded-xl border border-border-dark w-fit">
                <button
                    onClick={() => { setActiveSubTab('users'); setSearchQuery('') }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'users'
                        ? 'bg-primary text-background-dark shadow-lg shadow-primary/20'
                        : 'text-text-muted hover:text-white'
                        }`}
                >
                    <span className="material-symbols-outlined text-[18px]">group</span>
                    Users
                </button>
                <button
                    onClick={() => { setActiveSubTab('credits'); setSearchQuery('') }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'credits'
                        ? 'bg-primary text-background-dark shadow-lg shadow-primary/20'
                        : 'text-text-muted hover:text-white'
                        }`}
                >
                    <span className="material-symbols-outlined text-[18px]">school</span>
                    Student Credits
                </button>
                <button
                    onClick={() => { setActiveSubTab('resets'); setSearchQuery('') }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'resets'
                        ? 'bg-primary text-background-dark shadow-lg shadow-primary/20'
                        : 'text-text-muted hover:text-white'
                        }`}
                >
                    <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                    Password Resets
                </button>
            </div>

            {activeSubTab === 'users' ? (
                <>
                    {/* Filter Tabs */}
                    <div className="flex items-center gap-2 border-b border-border-dark">
                        <button onClick={() => setFilterStatus('all')} className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 ${filterStatus === 'all' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-white'}`}>All Users</button>
                        <button onClick={() => setFilterStatus('pending')} className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 ${filterStatus === 'pending' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-white'}`}>Pending Approval</button>
                        <button onClick={() => setFilterStatus('approved')} className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 ${filterStatus === 'approved' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-white'}`}>Approved</button>
                    </div>

                    {/* Search */}
                    <div className="relative w-full max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
                        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-surface-dark border border-border-dark rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary placeholder:text-text-muted" placeholder="Search by name, NIM, or email..." />
                    </div>

                    {/* Users Table */}
                    <div className="bg-surface-dark rounded-xl border border-border-dark overflow-hidden">
                        {isLoading ? (
                            <div className="p-12 text-center"><LoadingSpinner size="md" text="Loading users..." /></div>
                        ) : filteredUsers.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[#1d1b14] border-b border-border-dark">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">User</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">NIM/NIDN</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Role</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {filteredUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">{user.name?.charAt(0)}</div>
                                                        <span className="text-white text-sm font-medium">{user.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-text-muted text-sm">{user.nimNidn}</td>
                                                <td className="px-6 py-4 text-text-muted text-sm">{user.email}</td>
                                                <td className="px-6 py-4"><span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">{user.role}</span></td>
                                                <td className="px-6 py-4">{getStatusBadge(user)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {user.approvalStatus === 'PENDING' && (
                                                            <button onClick={() => setConfirmAction({ action: 'approve', user })} className="px-3 py-1 bg-green-500/20 border border-green-500/50 text-green-400 text-xs font-bold rounded hover:bg-green-500/30 transition-colors">Approve</button>
                                                        )}
                                                        <button onClick={() => setConfirmAction({ action: 'remove', user })} className="px-3 py-1 bg-red-500/20 border border-red-500/50 text-red-400 text-xs font-bold rounded hover:bg-red-500/30 transition-colors">Remove</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-text-muted">No users found.</div>
                        )}
                    </div>
                </>
            ) : activeSubTab === 'credits' ? (
                <>
                    {/* Student Credits Tab */}
                    <div className="relative w-full max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
                        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-surface-dark border border-border-dark rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary placeholder:text-text-muted" placeholder="Search by name, NIM, or email..." />
                    </div>

                    <div className="bg-surface-dark rounded-xl border border-border-dark overflow-hidden">
                        {isLoading ? (
                            <div className="p-12 text-center"><LoadingSpinner size="md" text="Loading students..." /></div>
                        ) : filteredStudents.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[#1d1b14] border-b border-border-dark">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Student</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">NIM</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Major</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Enrolled</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Max Credits</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {filteredStudents.map((student) => (
                                            <>
                                                <tr key={student.userId} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold">{student.name?.charAt(0)}</div>
                                                            <div>
                                                                <p className="text-white text-sm font-medium">{student.name}</p>
                                                                <p className="text-text-muted text-xs">{student.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded border border-primary/20">{student.nim}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-text-muted text-sm">{student.major || '-'}</td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            onClick={() => setExpandedStudent(expandedStudent === student.userId ? null : student.userId)}
                                                            className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors"
                                                        >
                                                            <span className={`font-bold ${student.enrolledCount > 0 ? 'text-blue-400' : 'text-text-muted'}`}>
                                                                {student.enrolledCount} Workshops
                                                            </span>
                                                            {student.enrolledCount > 0 && (
                                                                <span className="material-symbols-outlined text-[14px] text-text-muted">
                                                                    {expandedStudent === student.userId ? 'expand_less' : 'expand_more'}
                                                                </span>
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {editingCredit?.userId === student.userId ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="30"
                                                                    value={editingCredit.value}
                                                                    onChange={(e) => setEditingCredit({ ...editingCredit, value: e.target.value })}
                                                                    className="w-16 bg-background-dark border border-primary rounded px-2 py-1 text-white text-sm text-center focus:outline-none"
                                                                    autoFocus
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleSaveCredit(student.userId, editingCredit.value)
                                                                        if (e.key === 'Escape') setEditingCredit(null)
                                                                    }}
                                                                />
                                                                <button onClick={() => handleSaveCredit(student.userId, editingCredit.value)} disabled={creditSaving === student.userId} className="p-1 bg-green-500/20 border border-green-500/50 text-green-400 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50">
                                                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                                                </button>
                                                                <button onClick={() => setEditingCredit(null)} className="p-1 bg-red-500/20 border border-red-500/50 text-red-400 rounded hover:bg-red-500/30 transition-colors">
                                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-white font-bold text-sm bg-surface-dark px-3 py-1 rounded border border-border-dark">{student.maxCredits}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {editingCredit?.userId !== student.userId && (
                                                            <button onClick={() => setEditingCredit({ userId: student.userId, value: student.maxCredits })} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 text-blue-400 text-xs font-bold rounded hover:bg-blue-500/30 transition-colors">
                                                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                                                Edit Credits
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* Expanded workshops detail row */}
                                                {expandedStudent === student.userId && student.workshopsList && (
                                                    <tr key={`${student.userId}-detail`}>
                                                        <td colSpan="6" className="px-6 py-0">
                                                            <div className="bg-background-dark/60 rounded-lg p-4 mb-3 mx-8 border border-border-dark/50">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <span className="material-symbols-outlined text-primary text-[16px]">assignment</span>
                                                                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Enrolled Workshops</span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {student.workshopsList.split(', ').map((ws, i) => (
                                                                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-dark border border-border-dark rounded-lg text-xs">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                                                            <span className="text-white font-medium">{ws}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-text-muted">
                                <span className="material-symbols-outlined text-4xl mb-2 block">school</span>
                                No students found.
                            </div>
                        )}
                    </div>
                </>
            ) : activeSubTab === 'resets' ? (
                <>
                    {/* Filter Tabs for reset status */}
                    <div className="flex items-center gap-2 border-b border-border-dark">
                        {['PENDING', 'APPROVED', 'REJECTED', 'all'].map(s => (
                            <button
                                key={s}
                                onClick={() => setResetFilterStatus(s)}
                                className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 capitalize ${resetFilterStatus === s
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-text-muted hover:text-white'
                                    }`}
                            >
                                {s === 'all' ? 'All Requests' : s.charAt(0) + s.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>

                    <div className="bg-surface-dark rounded-xl border border-border-dark overflow-hidden">
                        {isLoading ? (
                            <div className="p-12 text-center"><LoadingSpinner size="md" text="Loading requests..." /></div>
                        ) : passwordResets.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[#1d1b14] border-b border-border-dark">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Student</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">NIM</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Submitted</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-text-muted uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-dark">
                                        {passwordResets.map((req) => (
                                            <tr key={req.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">
                                                            {req.userName?.charAt(0)}
                                                        </div>
                                                        <span className="text-white text-sm font-medium">{req.userName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded border border-primary/20">{req.userNim}</span>
                                                </td>
                                                <td className="px-6 py-4 text-text-muted text-sm">{req.userEmail}</td>
                                                <td className="px-6 py-4 text-text-muted text-sm">
                                                    {new Date(req.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {req.status === 'PENDING' && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded border border-yellow-500/30">Pending</span>}
                                                    {req.status === 'APPROVED' && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded border border-green-500/30">Approved</span>}
                                                    {req.status === 'REJECTED' && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded border border-red-500/30">Rejected</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {req.status === 'PENDING' && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleApproveReset(req.id)}
                                                                disabled={resetActionLoading !== null}
                                                                className="px-3 py-1 bg-green-500/20 border border-green-500/50 text-green-400 text-xs font-bold rounded hover:bg-green-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">check</span>
                                                                {resetActionLoading === req.id + '_approve' ? 'Approving...' : 'Approve'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleRejectReset(req.id)}
                                                                disabled={resetActionLoading !== null}
                                                                className="px-3 py-1 bg-red-500/20 border border-red-500/50 text-red-400 text-xs font-bold rounded hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                                                {resetActionLoading === req.id + '_reject' ? 'Rejecting...' : 'Reject'}
                                                            </button>
                                                        </div>
                                                    )}
                                                    {req.status !== 'PENDING' && (
                                                        <span className="text-text-muted text-xs">No actions available</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-text-muted">
                                <span className="material-symbols-outlined text-4xl mb-2 block">lock_reset</span>
                                No password reset requests found.
                            </div>
                        )}
                    </div>
                </>
            ) : null}



            {/* Confirmation Modal */}
            {confirmAction && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-surface-dark border border-border-dark w-full max-w-md rounded-xl shadow-2xl m-4 animate-in zoom-in-95">
                        <div className="flex items-center justify-between p-6 border-b border-border-dark">
                            <h3 className="text-xl font-bold text-white">{confirmAction.action === 'approve' ? 'Approve User' : 'Remove User'}</h3>
                            <button onClick={() => setConfirmAction(null)} className="text-text-muted hover:text-white"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6">
                            <p className="text-white mb-2">Are you sure you want to {confirmAction.action} <strong>{confirmAction.user.name}</strong>?</p>
                            <p className="text-text-muted text-sm">{confirmAction.action === 'approve' ? 'This user will be able to log in and access the system.' : 'This user will be marked as rejected and will not be able to log in.'}</p>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-text-muted hover:text-white font-bold text-sm">Cancel</button>
                                <button onClick={() => confirmAction.action === 'approve' ? handleApprove(confirmAction.user) : handleRemove(confirmAction.user)} className={`px-6 py-2 font-bold rounded text-sm ${confirmAction.action === 'approve' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}>
                                    {confirmAction.action === 'approve' ? 'Approve' : 'Remove'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export { UserManagement }
