const fs = require('fs');
let code = fs.readFileSync('supabase/functions/seka-whatsapp/index.ts', 'utf8');

const regex = /const conversationSummary = allMsgs\.map\(m => \{[\r\n\s]+const who = m\.role === "user" \? "CLIENTE" : "ASISTENTE";/g;
const replace2 = 'const conversationSummary = allMsgs.filter(m => {\n      if (m.content && (m.content.includes(`procederemos a cerrar esta`) || m.content.includes(`Ha sido un gusto atenderle`) || m.content.includes(`Lamentamos no poder continuar`))) return false;\n      return true;\n    }).map(m => {\n      const who = m.role === "user" ? "CLIENTE" : "ASISTENTE";';

if (regex.test(code)) {
  code = code.replace(regex, replace2);
  console.log('Fixed target 2');
} else {
  console.log('Target 2 not found');
}

fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', code, 'utf8');
