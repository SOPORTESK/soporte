// Test upload a Google Drive desde Vercel
const fs = require('fs');
const path = require('path');

async function testDriveUpload() {
  // Crear un archivo de prueba de 100MB
  const buf = Buffer.alloc(100 * 1024 * 1024, 0x41);
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const file = new File([blob], 'test-100mb.bin', { type: 'application/octet-stream' });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('caseId', 'test-case-123');
  formData.append('agentEmail', 'test@sekunet.com');

  console.log('Subiendo archivo de 100MB a /api/upload-drive...');
  const res = await fetch('https://sekachat.vercel.app/api/upload-drive', {
    method: 'POST',
    body: formData,
  });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}
testDriveUpload().catch(e => console.log('ERROR:', e.message));
