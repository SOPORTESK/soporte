const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'chat', 'conversation-list.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const old = '              </button>\n            </li>';
const newBtn = '              </button>\n' +
  '              <button onClick={(e) => { e.stopPropagation(); ' +
  'if (confirm("Eliminar esta conversacion?")) ' +
  '{ fetch(`/api/cases/${String(c.id)}`, { method: "DELETE" }); } }} ' +
  'className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 ' +
  'hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 ' +
  'transition-opacity shrink-0" title="Eliminar conversacion">' +
  '<Trash2 className="h-3.5 w-3.5" /></button>\n' +
  '            </li>';

content = content.replace(old, newBtn);
fs.writeFileSync(filePath, content, 'utf8');
console.log('OK');
