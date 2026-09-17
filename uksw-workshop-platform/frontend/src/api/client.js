// API Client for SIA.Sat - React Version
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.168.0.111:8080/api'

const getWsUrl = () => {
    const envUrl = import.meta.env.VITE_WS_BASE_URL;
    // If absolute URL, use it directly
    if (envUrl && (envUrl.startsWith('ws://') || envUrl.startsWith('wss://'))) {
        return envUrl;
    }
    // If relative or missing, construct from current window location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const path = envUrl && envUrl.startsWith('/') ? envUrl : '/ws';
    return `${protocol}//${host}${path}`;
};

const WS_BASE_URL = getWsUrl();

class APIClient {
    constructor() {
        this.wsConnection = null
        this.token = sessionStorage.getItem('authToken')
    }

    setToken(token) {
        this.token = token
        if (token) {
            sessionStorage.setItem('authToken', token)
        } else {
            sessionStorage.removeItem('authToken')
        }
    }

    getToken() {
        return this.token
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
        }
        const token = this.getToken()
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }
        // Prevent caching
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate'
        headers['Pragma'] = 'no-cache'
        headers['Expires'] = '0'

        return headers
    }

    async request(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers,
            },
        }

        try {
            const response = await fetch(url, config)

            // Special handling for 401 Unauthorized
            // Only trigger auth_error for session timeouts, not for login failures
            if (response.status === 401 && !endpoint.includes('/auth/login')) {
                window.dispatchEvent(new CustomEvent('auth_error'))
            }

            // Handle non-JSON responses gracefully
            let data = {}
            const contentType = response.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
                data = await response.json()
            }

            if (!response.ok) {
                // If it's a server error (500+), dispatch server error event too?
                // User requirement: "if its not connected to server"
                // 500 implies connected but broken.
                // "fetch failed" implies not connected.
                throw new Error(data.message || data.error || response.statusText || 'Request failed')
            }

            return data
        } catch (error) {
            console.error('API Error:', error)

            // Check if it's a network error
            if (error.name === 'TypeError' && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                window.dispatchEvent(new CustomEvent('server_connection_error', {
                    detail: { message: 'Cannot connect to server. Please check your network connection.' }
                }))
            }
            throw error
        }
    }

    // Authentication
    async login(username, password, role = 'STUDENT') {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, role }),
        })
    }

    async register(data) {
        const { name, nimNidn, email, password, major, role } = data
        return this.request('/register', {
            method: 'POST',
            body: JSON.stringify({ name, nimNidn, email, password, major, role: role || 'STUDENT' })
        })
    }

    async logout() {
        return this.request('/auth/logout', { method: 'POST' })
    }

    // Queue
    async joinQueue() {
        return this.request('/queue/join', { method: 'POST' })
    }

    async getQueueStatus() {
        return this.request('/queue/status')
    }

    async getQueueMetrics() {
        return this.request('/queue/metrics')
    }

    async setQueueLimit(limit) {
        return this.request('/queue/limit', {
            method: 'POST',
            body: JSON.stringify({ limit: parseInt(limit) }),
        })
    }

    async sendHeartbeat() {
        return this.request('/queue/heartbeat', { method: 'POST' })
    }

    // Workshops (updated from Courses)
    async getAvailableWorkshops(params = {}) {
        const queryString = new URLSearchParams(params).toString()
        return this.request(`/workshops/available?${queryString}`)
    }

    async getWorkshopDetails(workshopId) {
        return this.request(`/workshops/${workshopId}`)
    }

    // Workshop Seats
    async getWorkshopSeats(sessionId) {
        return this.request(`/workshops/sessions/${sessionId}/seats`)
    }

    async reserveSeat(seatId) {
        return this.request(`/workshops/seats/${seatId}/reserve`, {
            method: 'POST',
        })
    }

    async releaseSeat(seatId) {
        return this.request(`/workshops/seats/${seatId}/reserve`, {
            method: 'DELETE',
        })
    }

    async getMySeatReservation() {
        return this.request('/workshops/my-seat-reservation')
    }

    // Enrollment (Workshop Enrollment)
    async enrollWorkshop(sessionId, seatId = null) {
        const body = { classId: sessionId }
        if (seatId) {
            body.seatId = seatId
        }
        return this.request('/enrollment/add', {
            method: 'POST',
            body: JSON.stringify(body),
        })
    }

    async dropWorkshop(enrollmentId) {
        return this.request(`/enrollment/${enrollmentId}`, {
            method: 'DELETE',
        })
    }

    async getMyWorkshops() {
        return this.request('/enrollment/my-workshops')
    }

    async getEnrollmentHistory() {
        return this.request('/enrollment/history')
    }

    async rateWorkshop(enrollmentId, rating, review = '') {
        return this.request(`/enrollment/${enrollmentId}/rate`, {
            method: 'POST',
            body: JSON.stringify({ rating, review }),
        })
    }

    // Mentor
    async getMentorWorkshops() {
        return this.request('/mentor/workshops')
    }

    async createWorkshopSession(data) {
        return this.request('/mentor/workshops', {
            method: 'POST',
            body: JSON.stringify(data)
        })
    }

    async getEnrolledStudents(sessionId) {
        return this.request(`/mentor/workshops/${sessionId}/students`)
    }

    async updateSessionQuota(sessionId, quota) {
        return this.request('/mentor/workshops/quota', {
            method: 'POST',
            body: JSON.stringify({ classId: sessionId, quota: parseInt(quota) }),
        })
    }


    async updateWorkshopSession(sessionId, data) {
        return this.request(`/mentor/workshops/${sessionId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        })
    }

    async uploadWorkshopImage(sessionId, file) {
        const formData = new FormData()
        formData.append('image', file)
        // Don't use this.getHeaders() — let browser set multipart Content-Type with boundary
        const url = `${API_BASE_URL}/mentor/workshops/${sessionId}/image`
        const token = this.getToken()
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true',
            },
            body: formData,
        })
        const data = await response.json()
        if (!response.ok) {
            throw new Error(data.message || 'Failed to upload image')
        }
        return data
    }

    async deleteWorkshopImage(sessionId) {
        return this.request(`/mentor/workshops/${sessionId}/image`, {
            method: 'DELETE',
        })
    }

    async getAllStudents() {
        return this.request('/mentor/students', {
            method: 'GET',
        })
    }

    async getMentorFeedback() {
        return this.request('/mentor/feedback')
    }

    async forgotPassword(nim, email, newPassword) {
        return this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ nim, email, newPassword }),
        })
    }

    async getPasswordResetRequests(status = 'PENDING') {
        return this.request(`/mentor/password-resets?status=${status}`)
    }

    async approvePasswordReset(requestId) {
        return this.request(`/mentor/password-resets/${requestId}/approve`, { method: 'POST' })
    }

    async rejectPasswordReset(requestId) {
        return this.request(`/mentor/password-resets/${requestId}/reject`, { method: 'POST' })
    }


    async updateStudentCreditLimit(studentId, maxCredits) {
        return this.request(`/mentor/students/${studentId}/credit-limit`, {
            method: 'PUT',
            body: JSON.stringify({ maxCredits: parseInt(maxCredits) }),
        })
    }

    async getAllUsers(status = 'all') {
        return this.request(`/mentor/users?status=${status}`, {
            method: 'GET',
        })
    }

    async approveUser(userId) {
        return this.request(`/mentor/users/${userId}/approve`, {
            method: 'POST',
        })
    }

    async rejectUser(userId) {
        return this.request(`/mentor/users/${userId}`, {
            method: 'DELETE',
        })
    }

    async getQueueActiveUsers() {
        return this.request('/queue/active-users', { method: 'GET' })
    }

    async getQueueWaitingUsers() {
        return this.request('/queue/waiting-users', { method: 'GET' })
    }



    // WebSocket - Support multiple listeners
    connectWebSocket(onMessage) {
        const token = this.getToken()
        if (!token) return

        // Initialize listeners array if not exists
        if (!this.wsListeners) {
            this.wsListeners = []
        }

        // Add this listener
        if (onMessage && !this.wsListeners.includes(onMessage)) {
            this.wsListeners.push(onMessage)
        }

        // If already connected, don't reconnect
        if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
            return
        }

        // Close existing connection if it's in a bad state
        if (this.wsConnection) {
            this.wsConnection.close()
        }

        this.wsConnection = new WebSocket(`${WS_BASE_URL}?token=${token}`)

        this.wsConnection.onopen = () => {
            console.log('WebSocket connected')
        }

        this.wsConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data)
                // Notify ALL listeners
                this.wsListeners.forEach(listener => {
                    try {
                        listener(message)
                    } catch (e) {
                        console.error('Error in WebSocket listener:', e)
                    }
                })
            } catch (e) {
                console.error('WebSocket message parse error:', e)
            }
        }

        this.wsConnection.onerror = (error) => {
            console.error('WebSocket error:', error)
        }

        this.wsConnection.onclose = () => {
            console.log('WebSocket disconnected')
            // Reconnect after 5 seconds if we still have listeners
            if (this.wsListeners && this.wsListeners.length > 0) {
                setTimeout(() => this.connectWebSocket(), 5000)
            }
        }
    }

    disconnectWebSocket(onMessage) {
        // If a specific listener is provided, remove only that listener
        if (onMessage && this.wsListeners) {
            this.wsListeners = this.wsListeners.filter(l => l !== onMessage)
            // Only close connection if no more listeners
            if (this.wsListeners.length === 0 && this.wsConnection) {
                this.wsConnection.close()
                this.wsConnection = null
            }
        } else {
            // No listener specified, disconnect completely
            if (this.wsConnection) {
                this.wsConnection.close()
                this.wsConnection = null
            }
            this.wsListeners = []
        }
    }
}

export const api = new APIClient()
