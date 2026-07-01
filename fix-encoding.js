const fs = require('fs');
let code = fs.readFileSync('supabase/functions/seka-whatsapp/index.ts', 'utf8');

// First let's just see if we can decode the whole thing
try {
  let decoded = Buffer.from(code, 'latin1').toString('utf8');
  
  if (decoded.includes('único') && decoded.includes('¿cuál')) {
    fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', decoded, 'utf8');
    console.log('Fixed globally using buffer decoding!');
  } else {
    // try the other way
    let buf = Buffer.from(code, 'utf8');
    let latinDecoded = buf.toString('latin1');
    let doubleDecoded = Buffer.from(latinDecoded, 'latin1').toString('utf8');
    if (doubleDecoded.includes('único')) {
      fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', doubleDecoded, 'utf8');
      console.log('Fixed globally using double decoding!');
    } else if (latinDecoded.includes('único')) {
      fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', latinDecoded, 'utf8');
      console.log('Fixed globally using simple latin1 decoding!');
    } else {
        console.log('Buffer decoding failed to restore characters');
        
        // Manual replacements fallback
        const fixes = {
          'Ã¡': 'á',
          'Ã©': 'é',
          'Ã³': 'ó',
          'Ãº': 'ú',
          'Ã±': 'ñ',
          'Ã\xAD': 'í', 
          'Â¿': '¿',
          'Â¡': '¡',
          'â€”': '—',
          'Ã': 'í', // Catch all for í that often breaks
        };
        
        for (const [bad, good] of Object.entries(fixes)) {
          code = code.split(bad).join(good);
        }
        fs.writeFileSync('supabase/functions/seka-whatsapp/index.ts', code, 'utf8');
        console.log('Applied manual string replacements');
    }
  }
} catch (e) {
  console.log('Error', e);
}
