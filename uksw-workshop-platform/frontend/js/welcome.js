// Welcome Page - "I'm Ready" Button Handler
document.addEventListener('DOMContentLoaded', function () {
    // Check if user is logged in
    const token = localStorage.getItem('authToken');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token || !user.name) {
        window.location.href = '/index.html';
        return;
    }

    // Update student name
    const studentNameElement = document.getElementById('studentName');
    if (studentNameElement) {
        studentNameElement.textContent = user.name;
    }

    // Handle logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', async function () {
            try {
                await api.logout();
            } catch (error) {
                console.error('Logout error:', error);
            }

            localStorage.clear();
            window.location.href = '/index.html';
        });
    }

    // Handle "I'm Ready" button
    const readyButton = document.getElementById('readyButton');
    if (readyButton) {
        readyButton.addEventListener('click', async function () {
            // Disable button
            this.disabled = true;
            this.innerHTML = '<span class="animate-pulse">Joining queue...</span>';

            try {
                // Join the queue
                const response = await api.joinQueue();

                if (response.success) {
                    // Redirect to queue page
                    window.location.href = '/registration_queue/code.html';
                } else {
                    throw new Error(response.message || 'Failed to join queue');
                }
            } catch (error) {
                console.error('Queue join error:', error);
                alert('Failed to join queue: ' + error.message);

                // Re-enable button
                this.disabled = false;
                this.innerHTML = `
                    <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                    <div class="relative z-10 flex items-center gap-3">
                        <span class="material-symbols-outlined text-2xl">play_arrow</span>
                        <span class="text-lg font-bold text-background-dark">I'm ready to study</span>
                    </div>
                `;
            }
        });
    }
});
