const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend/src/pages/MentorDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Structural Backgrounds
content = content.replace(/bg-\[#181611\]/g, 'bg-white');
content = content.replace(/bg-\[#1d1b14\]/g, 'bg-primary-light/40');
content = content.replace(/bg-\[#333025\]/g, 'bg-primary-light/20');
content = content.replace(/hover:bg-\[#333025\]/g, 'hover:bg-primary-light/30');
content = content.replace(/bg-surface-dark/g, 'bg-white');
content = content.replace(/bg-background-light dark:bg-background-dark/g, 'bg-background-dark');
content = content.replace(/bg-background-dark/g, 'bg-[#F0F6FC]');

// 2. Headings and Base Text
// Instead of a global text-white replace, we target the specific patterns to avoid breaking colored badges/buttons
content = content.replace(/text-white text-base/g, 'text-primary text-base');
content = content.replace(/text-white text-sm/g, 'text-gray-800 text-sm');
content = content.replace(/text-white text-xs/g, 'text-gray-800 text-xs');
content = content.replace(/text-white text-lg/g, 'text-gray-800 text-lg');
content = content.replace(/text-white text-xl/g, 'text-gray-800 text-xl');
content = content.replace(/text-white text-2xl/g, 'text-gray-800 text-2xl');
content = content.replace(/text-white font-bold/g, 'text-gray-800 font-bold');
content = content.replace(/text-xl font-bold text-white/g, 'text-xl font-bold text-gray-800');
content = content.replace(/text-lg font-bold text-white/g, 'text-lg font-bold text-gray-800');
content = content.replace(/text-sm font-medium leading-normal text-white/g, 'text-sm font-bold leading-normal text-primary');

// Form inputs
content = content.replace(/bg-\[#F0F6FC\] border border-border-dark rounded h-11 px-3 text-white/g, 'bg-white border border-border-dark rounded-xl h-11 px-3 text-gray-800');
content = content.replace(/bg-\[#F0F6FC\] border border-border-dark rounded h-10 px-3 text-white/g, 'bg-white border border-border-dark rounded-xl h-10 px-3 text-gray-800');

// Mobile and Sidebar hovers
content = content.replace(/hover:text-white/g, 'hover:text-primary');
content = content.replace(/group-hover:text-white/g, 'group-hover:text-primary');

// Modals text
content = content.replace(/text-white mb-1/g, 'text-gray-800 mb-1');

// Any remaining text-white that should be dark (except bg-primary buttons)
// We'll leave the ones embedded in bg-primary alone

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully re-themed MentorDashboard.jsx');
