const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend/src/pages/MentorDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Additional exact replacements based on grep output
content = content.replace(/text-white text-\[11px\]/g, 'text-gray-800 text-[11px]');
content = content.replace(/text-white tracking-tight text-\[32px\]/g, 'text-gray-800 tracking-tight text-[32px]');
content = content.replace(/text-sm text-white font-medium/g, 'text-sm text-gray-800 font-medium');
content = content.replace(/text-xs text-white/g, 'text-xs text-gray-800');
content = content.replace(/text-sm text-white/g, 'text-sm text-gray-800');
content = content.replace(/text-3xl font-black tracking-tight uppercase text-white/g, 'text-3xl font-black tracking-tight uppercase text-gray-800');
content = content.replace(/text-6xl font-black text-white/g, 'text-6xl font-black text-gray-800');
content = content.replace(/text-white\/10/g, 'text-gray-200');
content = content.replace(/text-3xl font-black text-white tracking-tight/g, 'text-3xl font-black text-gray-800 tracking-tight');
content = content.replace(/text-base font-bold text-white/g, 'text-base font-bold text-gray-800');
content = content.replace(/text-2xl font-black text-white/g, 'text-2xl font-black text-gray-800');
content = content.replace(/text-sm font-bold text-white/g, 'text-sm font-bold text-gray-800');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed remaining text-white instances in MentorDashboard.jsx');
