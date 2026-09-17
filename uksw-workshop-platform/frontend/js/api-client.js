// API Client for SIA.Sat - UKSW Frontend
// Handles all API requests to backend

class APIClient {
    constructor() {
        this.baseURL = 'http://192.168.0.111:8080/api';
        this.token = localStorage.getItem('authToken');
        this.wsURL = 'ws://192.168.0.111:8080/ws';
        this.ws = null;
    }

    // Set authentication token
    setToken(token) {
        this.token = token;
        localStorage.setItem('authToken', token);
    }

    // Clear authentication token
    clearToken() {
        this.token = null;
        localStorage.removeItem('authToken');
    }

    // Get authentication headers
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    // Generic API request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers,
            },
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication APIs
    async login(username, password, role = 'STUDENT') {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, role }),
        });

        if (data.success) {
            this.setToken(data.token);
        }

        return data;
    }

    async logout() {
        await this.request('/auth/logout', { method: 'POST' });
        this.clearToken();
    }

    // Queue APIs
    async joinQueue() {
        return await this.request('/queue/join', { method: 'POST' });
    }

    async getQueueStatus() {
        return await this.request('/queue/status');
    }

    // Course APIs
    async getAvailableCourses(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return await this.request(`/courses/available?${queryString}`);
    }

    async getCourseDetails(courseId) {
        return await this.request(`/courses/${courseId}`);
    }

    // Enrollment APIs
    async addCourse(classId) {
        return await this.request('/enrollment/add', {
            method: 'POST',
            body: JSON.stringify({ classId }),
        });
    }

    async dropCourse(enrollmentId) {
        return await this.request(`/enrollment/${enrollmentId}`, {
            method: 'DELETE',
        });
    }

    async getMyCourses() {
        return await this.request('/enrollment/my-courses');
    }

    // Mentor APIs
    async getMentorCourses() {
        return await this.request('/mentor/courses');
    }

    async getEnrolledStudents(courseId) {
        return await this.request(`/mentor/courses/${courseId}/students`);
    }

    // WebSocket Connection
    connectWebSocket(onMessage) {
        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(`${this.wsURL}?token=${this.token}`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (onMessage) {
                onMessage(message);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(onMessage), 5000);
        };
    }

    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Create global API client instance
const api = new APIClient();
