import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Header({ title = 'UKSW Workshops Platform' }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = async () => {
        logout()
        navigate('/')
    }

    return (
        <header className="flex items-center justify-between whitespace-nowrap border-b border-border-dark bg-white backdrop-blur-sm px-6 py-3 sticky top-0 z-50 shadow-sm">
            <div className="flex items-center gap-3">
                {/* K2I Logo with white background */}
                <div className="size-10 rounded-full bg-white border-2 border-border-dark flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                    <img src="/k2i-logo.png" alt="K2I UKSW" className="size-9 object-contain" />
                </div>
                <div className="hidden sm:flex flex-col leading-none">
                    <h2 className="text-primary text-base font-extrabold leading-tight tracking-tight">
                        {title}
                    </h2>
                    <span className="text-text-muted text-[10px] font-medium uppercase tracking-widest">Fakultas Teknologi Informasi</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                {user && user.role === 'STUDENT' && (
                    <button
                        onClick={() => navigate('/history')}
                        className="flex items-center gap-2 rounded-lg bg-primary-light border border-border-dark px-4 py-2 text-sm font-bold text-text-muted hover:text-primary hover:border-primary transition-all group"
                    >
                        <span className="material-symbols-outlined text-[20px] group-hover:text-primary transition-colors">history_edu</span>
                        <span className="hidden sm:inline">Enrollment History</span>
                    </button>
                )}

                {user && (
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden md:block">
                            <p className="text-sm font-bold text-gray-800">{user.name}</p>
                            <p className="text-xs text-text-muted">{user.nim || user.nidn}</p>
                        </div>
                        <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            {user.name?.charAt(0) || 'U'}
                        </div>
                    </div>
                )}

                <button
                    onClick={handleLogout}
                    className="flex gap-2 cursor-pointer items-center justify-center rounded-lg h-9 px-4 bg-transparent border border-border-dark hover:border-primary text-text-muted hover:text-primary transition-colors text-sm font-medium"
                >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>
        </header>
    )
}
