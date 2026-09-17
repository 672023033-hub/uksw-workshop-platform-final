// Login Page Logic - Updated
document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');
    const errorMessage = document.getElementById('errorMessage');

    // Check if already logged in
    const token = localStorage.getItem('authToken');
    if (token) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.role === 'STUDENT') {
            window.location.href = '/welcome_-_i\'m_ready/code.html';
        } else if (user.role === 'MENTOR') {
            window.location.href = '/mentor';
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const role = document.getElementById('userType').value;

            // Validation
            if (!username || !password) {
                showError('Please enter both username and password');
                return;
            }

            // Disable button during login
            loginButton.disabled = true;
            loginButton.innerHTML = '<span class="animate-pulse">Logging in...</span>';

            // Hide previous errors
            if (errorMessage) {
                errorMessage.classList.add('hidden');
            }

            try {
                const response = await api.login(username, password, role);

                if (response.success) {
                    // Store user info
                    localStorage.setItem('user', JSON.stringify(response.user));

                    // Show success
                    loginButton.innerHTML = '<span>Success! Redirecting...</span>';

                    // Redirect based on role
                    setTimeout(() => {
                        if (role === 'STUDENT') {
                            window.location.href = '/welcome_-_i\'m_ready/code.html';
                        } else {
                            window.location.href = '/mentor';
                        }
                    }, 500);
                } else {
                    throw new Error(response.message || 'Login failed');
                }
            } catch (error) {
                console.error('Login error:', error);

                // Show error message
                const message = error.message || 'Invalid credentials. Please check your username and password.';
                showError(message);

                // Re-enable button
                loginButton.disabled = false;
                loginButton.innerHTML = 'Log In';
            }
        });
    }

    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');

            // Auto-hide after 5 seconds
            setTimeout(() => {
                errorMessage.classList.add('hidden');
            }, 5000);
        }
    }
});
