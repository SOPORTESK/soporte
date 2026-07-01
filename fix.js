const fs = require('fs');
let code = fs.readFileSync('supabase/functions/seka-whatsapp/index.ts', 'utf8');

const target1 = '- PROHIBIDO DEDUCIR LA CUENTA DEL CORREO: NUNCA generes el valor de "cuenta" a partir del correo (ni de la parte antes de @, ni del dominio). Ejemplo: con "innoviocr@outlook.com" NO escribas "Innovio CR" ni "Innovio". Si el cliente no escribió textualmente el nombre de su empresa/cuenta, deja "cuenta" VACÍA.';
const replace1 = '- DIFERENCIA ENTRE CORREO Y EMPRESA: El correo siempre tiene formato (ej: x@y.com). El nombre de la empresa puede ser CUALQUIER nombre propio o frase. Lo único que debes evitar es inventar un nombre de empresa si el usuario SOLO te ha dado el correo. Pero si el usuario te responde la empresa, asume que ese es el nombre y extráelo exactamente como lo escribió, sin importar nada más.';

if (code.includes(target1)) {
  code = code.replace(target1, replace1);
  console.log('Fixed target 1');
} else {
  console.log('Target 1 not found');
}

const target2 = 'const conversationSummary = allMsgs.map(m => {\n      const who = m.role === "user" ? "CLIENTE" : "ASISTENTE";';
const replace2 = 'const conversationSummary = allMsgs.filter(m => {\n      if (m.content && (m.content.includes(`procederemos a cerrar esta`) || m.content.includes(`Ha sido un gusto atenderle`) || m.content.includes(`Lamentamos no poder continuar`))) return false;\n      return true;\n    }).map(m => {\n      const who = m.role === "user" ? "CLIENTE" : "ASISTENTE";';

if (code.includes(target2)) {
  code = code.replace(target2, replace2);
  console.log('Fixed target 2');
} else {
  console.log('Target 2 not found');
}

fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', code, 'utf8');
