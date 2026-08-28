// Capturar el payload real del webhook para ver la estructura
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        console.log('\n=== WEBHOOK RECIBIDO ===');
        console.log('event:', payload.event);
        console.log('instance:', payload.instance);
        const msg = payload?.data?.messages?.[0] || payload?.data;
        if (msg) {
          console.log('key.id:', msg?.key?.id);
          console.log('key.remoteJid:', msg?.key?.remoteJid);
          console.log('key.fromMe:', msg?.key?.fromMe);
          console.log('messageType:', msg?.messageType || payload?.data?.messageType);
          console.log('message keys:', msg?.message ? Object.keys(msg.message) : 'N/A');
          if (msg?.message?.conversation) console.log('conversation:', msg.message.conversation.slice(0, 100));
          if (msg?.message?.imageMessage) console.log('imageMessage keys:', Object.keys(msg.message.imageMessage));
          if (msg?.message?.imageMessage?.url) console.log('imageMessage.url:', msg.message.imageMessage.url.slice(0, 80));
          if (msg?.message?.imageMessage?.caption) console.log('imageMessage.caption:', msg.message.imageMessage.caption);
          console.log('messageTimestamp:', msg?.messageTimestamp);
          console.log('pushName:', msg?.pushName);
        }
        console.log('=== FIN ===\n');
      } catch (e) {
        console.log('Error parseando:', e.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  } else {
    res.writeHead(200);
    res.end('OK');
  }
});

server.listen(9999, '0.0.0.0', () => {
  console.log('Servidor de captura escuchando en puerto 9999');
});
