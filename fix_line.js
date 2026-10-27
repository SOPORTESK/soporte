const fs = require('fs');
const path = 'C:/Users/Taller SK/Documents/PROYECTOS/Chat de Atención Sekunet/src/components/internal-chat/internal-chat-view.tsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
lines[607] = '    <div className={`flex flex-col h-full bg-card relative overflow-hidden ${isShaking ? "animate-nudge-shake ring-4 ring-amber-500/50" : ""}`}>\';
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Fixed line 608');
