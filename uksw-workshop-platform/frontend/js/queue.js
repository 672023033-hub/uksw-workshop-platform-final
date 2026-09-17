// Queue Page Logic
let queueCheckInterval = null;

document.addEventListener('DOMContentLoaded', function () {
    const queueNumber = document.getElementById('queueNumber');
    const progressBar = document.getElementById('progressBar');
    const estimatedTime = document.getElementById('estimatedTime');

    // Join queue on page load
    joinQueue();

    // Start checking queue status every 5 seconds
    queueCheckInterval = setInterval(checkQueueStatus, 5000);

    // Connect to WebSocket for real-time updates
    api.connectWebSocket(handleQueueUpdate);
});

async function joinQueue() {
    try {
        const response = await api.joinQueue();

        if (response.success) {
            updateQueueUI(response.queuePosition, response.estimatedWaitMinutes);
        }
    } catch (error) {
        console.error('Failed to join queue:', error);
        alert('Failed to join queue. Please try again.');
        window.location.href = '/welcome_-_i\'m_ready/code.html';
    }
}

async function checkQueueStatus() {
    try {
        const response = await api.getQueueStatus();

        if (response.inQueue) {
            updateQueueUI(response.position, response.estimatedWaitMinutes);
        } else {
            // Queue completed, redirect to course registration
            clearInterval(queueCheckInterval);
            window.location.href = '/course_registration_(krs)/code.html';
        }
    } catch (error) {
        console.error('Failed to check queue status:', error);
    }
}

function updateQueueUI(position, estimatedMinutes) {
    const queueNumber = document.getElementById('queueNumber');
    const estimatedTime = document.getElementById('estimatedTime');
    const progressBar = document.getElementById('progressBar');

    if (queueNumber) {
        queueNumber.textContent = position;
    }

    if (estimatedTime) {
        estimatedTime.textContent = `${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''}`;
    }

    // Update progress bar (assuming max queue is 1000)
    if (progressBar) {
        const progress = Math.max(0, ((1000 - position) / 1000) * 100);
        progressBar.style.width = `${progress}%`;
    }
}

function handleQueueUpdate(message) {
    if (message.type === 'QUEUE_POSITION') {
        updateQueueUI(message.position, message.estimatedWaitMinutes);
    } else if (message.type === 'ACCESS_GRANTED') {
        // Grant access to KRS
        clearInterval(queueCheckInterval);
        window.location.href = '/course_registration_(krs)/code.html';
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function () {
    if (queueCheckInterval) {
        clearInterval(queueCheckInterval);
    }
    api.disconnectWebSocket();
});
