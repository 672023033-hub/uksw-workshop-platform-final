import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Welcome from './pages/Welcome'
import Queue from './pages/Queue'
import WorkshopSelection from './pages/WorkshopSelection'
import RegistrationSuccess from './pages/RegistrationSuccess'
import MentorDashboard from './pages/MentorDashboard'
import EnrollmentHistory from './pages/EnrollmentHistory'
import ForgotPassword from './pages/ForgotPassword'

import LoadingSpinner from './components/LoadingSpinner'

// Protected route wrapper
function ProtectedRoute({ children, allowedRoles }) {
    const { user, isAuthenticated, isLoading } = useAuth()

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background-dark">
                <LoadingSpinner size="lg" text="Authenticating..." />
            </div>
        )
    }

    if (!isAuthenticated) {
        return <Navigate to="/" replace />
    }

    if (allowedRoles && !allowedRoles.includes(user?.role)) {
        return <Navigate to="/" replace />
    }

    return children
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
                path="/welcome"
                element={
                    <ProtectedRoute allowedRoles={['STUDENT']}>
                        <Welcome />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/queue"
                element={
                    <ProtectedRoute allowedRoles={['STUDENT']}>
                        <Queue />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/workshop-selection"
                element={
                    <ProtectedRoute allowedRoles={['STUDENT']}>
                        <WorkshopSelection />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/krs"
                element={
                    <ProtectedRoute allowedRoles={['STUDENT']}>
                        <WorkshopSelection />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/success"
                element={
                    <ProtectedRoute allowedRoles={['STUDENT']}>
                        <RegistrationSuccess />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/history"
                element={
                    <ProtectedRoute allowedRoles={['STUDENT']}>
                        <EnrollmentHistory />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/mentor"
                element={
                    <ProtectedRoute allowedRoles={['MENTOR']}>
                        <MentorDashboard />
                    </ProtectedRoute>
                }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
