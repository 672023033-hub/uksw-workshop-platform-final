const fs = require('fs');
const path = require('path');

const filesToFix = [
    'EnrollmentHistory.jsx',
    'CourseRegistration.jsx',
    'RegistrationSuccess.jsx',
    'Queue.jsx',
    'ForgotPassword.jsx',
    'Register.jsx',
    'Login.jsx',
    'Welcome.jsx',
    'MentorDashboard.jsx'
];

filesToFix.forEach(file => {
    const filePath = path.join(__dirname, 'frontend/src/pages', file);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace specific conflicting text-white occurrences that are NOT in a primary/red button context
    // Headings and general text
    content = content.replace(/text-white/g, match => {
        // We will do a generic replace first but let's be careful.
        return 'text-gray-800';
    });
    
    // Now RESTORE the correct text-white in buttons and badges that have dark backgrounds!
    content = content.replace(/bg-primary text-gray-800/g, 'bg-primary text-white');
    content = content.replace(/bg-primary hover:bg-primary-hover text-gray-800/g, 'bg-primary hover:bg-primary-hover text-white');
    content = content.replace(/hover:bg-red-500 hover:text-gray-800/g, 'hover:bg-red-500 hover:text-white');
    content = content.replace(/bg-red-900\/90 border-red-500\/50 text-gray-800/g, 'bg-red-900/90 border-red-500/50 text-white');
    content = content.replace(/bg-green-900\/90 border-green-500\/50 text-gray-800/g, 'bg-green-900/90 border-green-500/50 text-white');
    content = content.replace(/bg-red-900\/90 border-red-500 text-gray-800/g, 'bg-red-900/90 border-red-500 text-white');
    content = content.replace(/bg-green-900\/90 border-green-500 text-gray-800/g, 'bg-green-900/90 border-green-500 text-white');
    content = content.replace(/bg-green-500\/90 text-gray-800/g, 'bg-green-500/90 text-white');
    content = content.replace(/text-gray-800\/10/g, 'text-gray-200');
    content = content.replace(/text-gray-800\/15/g, 'text-gray-200');
    content = content.replace(/hover:text-gray-800/g, 'hover:text-primary');

    // Remove any remaining generic text-gray-800 that used to be text-white in MentorDashboard navs
    content = content.replace(/\? 'text-gray-800' : 'text-text-muted group-hover:text-primary'/g, "? 'text-primary font-bold' : 'text-text-muted group-hover:text-primary'");

    fs.writeFileSync(filePath, content, 'utf8');
});

console.log('Fixed final color conflicts.');
