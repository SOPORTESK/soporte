const fs = require('fs');
const path = 'src/app/(admin)/admin/estadisticas/atencion/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const calcFunc = \
function calculateBusinessMinutes(start, end) {
  if (end < start) return 0;
  let totalMinutes = 0;
  let current = new Date(start);
  
  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      const startOfDay = new Date(current);
      startOfDay.setHours(8, 0, 0, 0);
      const endOfDay = new Date(current);
      endOfDay.setHours(17, 30, 0, 0);

      const overlapStart = current > startOfDay ? current : startOfDay;
      const overlapEnd = end < endOfDay ? end : endOfDay;

      if (overlapEnd > overlapStart) {
        totalMinutes += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  return Math.round(totalMinutes);
}
\;

if (!code.includes('calculateBusinessMinutes')) {
  code = code.replace('export default async function EstadisticasAtencionPage', calcFunc + '\nexport default async function EstadisticasAtencionPage');
}

code = code.replace(/Math\.round\(\(end\.getTime\(\) - start\.getTime\(\)\) \/ 60000\)/g, 'calculateBusinessMinutes(start, end)');

fs.writeFileSync(path, code);
