const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'frontend/src/pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
    const filePath = path.join(pagesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove text-white from body/main containers
    content = content.replace(/bg-background-dark min-h-screen flex flex-col text-white/g, 'bg-background-dark min-h-screen flex flex-col text-gray-800');
    content = content.replace(/bg-background-dark min-h-screen text-white/g, 'bg-background-dark min-h-screen text-gray-800');
    
    // Convert general text-white to text-gray-800 when not in a primary button
    // It's safer to just replace specific patterns found in grep
    content = content.replace(/text-3xl md:text-4xl font-bold text-white/g, 'text-3xl md:text-4xl font-bold text-gray-800');
    content = content.replace(/text-xl font-bold text-white/g, 'text-xl font-bold text-gray-800');
    content = content.replace(/text-lg font-bold text-white/g, 'text-lg font-bold text-gray-800');
    content = content.replace(/text-sm text-white/g, 'text-sm text-gray-800');
    content = content.replace(/text-sm font-medium text-white/g, 'text-sm font-medium text-gray-800');
    content = content.replace(/font-medium text-white/g, 'font-medium text-gray-800');
    content = content.replace(/text-2xl sm:text-3xl font-bold text-white/g, 'text-2xl sm:text-3xl font-bold text-gray-800');
    content = content.replace(/text-white text-lg font-bold leading-tight/g, 'text-gray-800 text-lg font-bold leading-tight');
    content = content.replace(/text-2xl font-bold leading-tight mb-2 text-white/g, 'text-2xl font-bold leading-tight mb-2 text-gray-800');
    content = content.replace(/text-2xl font-bold text-white mb-4/g, 'text-2xl font-bold text-gray-800 mb-4');
    
    // Fix active tabs in MentorDashboard
    content = content.replace(/\? 'text-white' : 'text-text-muted/g, '? \'text-primary font-bold\' : \'text-text-muted');
    
    // Fix calendar in MentorDashboard
    content = content.replace(/rounded-full' : 'text-white/g, 'rounded-full\' : \'text-gray-800');

    // Fix forms text-white
    content = content.replace(/px-4 text-white placeholder/g, 'px-4 text-gray-800 placeholder');
    content = content.replace(/px-4 text-white focus/g, 'px-4 text-gray-800 focus');
    
    // Fix nav bar links in auth pages
    content = content.replace(/text-white text-sm font-medium/g, 'text-gray-800 text-sm font-medium');

    fs.writeFileSync(filePath, content, 'utf8');
});

console.log('Fixed color conflicts in all pages.');
