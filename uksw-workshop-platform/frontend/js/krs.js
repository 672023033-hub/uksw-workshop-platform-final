// Course Registration (KRS) Page Logic
let selectedCourses = new Set();

document.addEventListener('DOMContentLoaded', function () {
    loadAvailableCourses();
    loadMyCourses();

    // Connect WebSocket for real-time quota updates
    api.connectWebSocket(handleQuotaUpdate);

    // Filter functionality
    const filterInputs = document.querySelectorAll('.filter-sidebar input, .filter-sidebar select');
    filterInputs.forEach(input => {
        input.addEventListener('change', loadAvailableCourses);
    });
});

async function loadAvailableCourses() {
    const semester = document.getElementById('semesterFilter')?.value || 'GASAL_2024';
    const faculty = document.getElementById('facultyFilter')?.value || '';
    const coursesContainer = document.getElementById('coursesContainer');

    try {
        const response = await api.getAvailableCourses({ semester, faculty });

        if (response.success && coursesContainer) {
            coursesContainer.innerHTML = response.courses.map(course => createCourseCard(course)).join('');

            // Add event listeners to all add buttons
            document.querySelectorAll('.add-course-btn').forEach(btn => {
                btn.addEventListener('click', (e) => addCourse(e.target.dataset.classId));
            });
        }
    } catch (error) {
        console.error('Failed to load courses:', error);
    }
}

async function loadMyCourses() {
    try {
        const response = await api.getMyCourses();

        if (response.success) {
            // Update selected courses set
            selectedCourses = new Set(response.courses.map(c => c.classId));

            // Update UI to show selected courses
            updateSelectedCoursesUI(response.courses);
        }
    } catch (error) {
        console.error('Failed to load registered courses:', error);
    }
}

async function addCourse(classId) {
    const button = document.querySelector(`[data-class-id="${classId}"]`);
    const originalText = button.innerHTML;

    button.disabled = true;
    button.innerHTML = 'Adding...';

    try {
        const response = await api.addCourse(classId);

        if (response.success) {
            selectedCourses.add(classId);
            button.innerHTML = '<svg>...</svg> Drop';
            button.classList.remove('bg-blue-600');
            button.classList.add('bg-red-600');

            // Show success notification
            showNotification('Course added successfully!', 'success');

            // Reload my courses
            loadMyCourses();
        }
    } catch (error) {
        button.disabled = false;
        button.innerHTML = originalText;

        if (error.message.includes('QUOTA_EXCEEDED')) {
            showNotification('Course is full!', 'error');
        } else if (error.message.includes('SCHEDULE_CONFLICT')) {
            showNotification('Time conflict with existing course!', 'error');
        } else {
            showNotification('Failed to add course. Please try again.', 'error');
        }
    }
}

async function dropCourse(enrollmentId) {
    if (!confirm('Are you sure you want to drop this course?')) {
        return;
    }

    try {
        const response = await api.dropCourse(enrollmentId);

        if (response.success) {
            showNotification('Course dropped successfully!', 'success');
            loadAvailableCourses();
            loadMyCourses();
        }
    } catch (error) {
        showNotification('Failed to drop course. Please try again.', 'error');
    }
}

function createCourseCard(course) {
    const isSelected = selectedCourses.has(course.id);
    const isFull = course.enrolledCount >= course.quota;
    const availableSlots = course.quota - course.enrolledCount;

    return `
        <div class="bg-white rounded-lg shadow p-6 ${isSelected ? 'border-2 border-blue-500' : ''}">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-900">${course.code}</h3>
                    <p class="text-gray-700">${course.name}</p>
                </div>
                <span class="text-sm font-semibold ${isFull ? 'text-red-600' : 'text-green-600'}">
                    ${availableSlots} slots left
                </span>
            </div>

            <div class="space-y-2 text-sm text-gray-600 mb-4">
                <p><strong>Credits:</strong> ${course.credits} SKS</p>
                <p><strong>Mentor:</strong> ${course.lecturerName}</p>
                <p><strong>Schedule:</strong> ${formatSchedule(course.schedule)}</p>
            </div>

            <div class="flex items-center justify-between">
                <div class="w-full bg-gray-200 rounded-full h-2 mr-4">
                    <div class="bg-blue-600 h-2 rounded-full" style="width: ${(course.enrolledCount / course.quota) * 100}%"></div>
                </div>
                <button 
                    class="add-course-btn px-4 py-2 rounded text-white ${isSelected ? 'bg-red-600' : (isFull ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600')}"
                    data-class-id="${course.id}"
                    ${isFull && !isSelected ? 'disabled' : ''}>
                    ${isSelected ? 'Drop' : 'Add'}
                </button>
            </div>
        </div>
    `;
}

function formatSchedule(schedules) {
    if (!schedules || schedules.length === 0) return 'TBA';
    return schedules.map(s => `${s.dayOfWeek} ${s.startTime}-${s.endTime}`).join(', ');
}

function updateSelectedCoursesUI(courses) {
    const summaryContainer = document.getElementById('selectedCoursesSummary');

    if (summaryContainer && courses.length > 0) {
        const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
        summaryContainer.innerHTML = `
            <div class="bg-blue-50 p-4 rounded">
                <h4 class="font-bold mb-2">Selected Courses (${courses.length})</h4>
                <p>Total Credits: ${totalCredits} SKS</p>
            </div>
        `;
    }
}

function handleQuotaUpdate(message) {
    if (message.type === 'QUOTA_UPDATE') {
        // Reload courses to show updated quotas
        loadAvailableCourses();
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded shadow-lg text-white ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Cleanup
window.addEventListener('beforeunload', function () {
    api.disconnectWebSocket();
});
