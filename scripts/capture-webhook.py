#!/usr/bin/env python3
import http.server
import json
import sys

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body)
            print('\n=== WEBHOOK RECIBIDO ===', flush=True)
            print('event:', payload.get('event'), flush=True)
            print('instance:', payload.get('instance'), flush=True)
            data = payload.get('data', {})
            msgs = data.get('messages', [])
            msg = msgs[0] if msgs else data
            if msg:
                key = msg.get('key', {})
                print('key.id:', key.get('id'), flush=True)
                print('key.remoteJid:', key.get('remoteJid'), flush=True)
                print('key.fromMe:', key.get('fromMe'), flush=True)
                print('messageType:', msg.get('messageType') or data.get('messageType'), flush=True)
                m = msg.get('message', {})
                if m:
                    print('message keys:', list(m.keys()), flush=True)
                    if 'conversation' in m:
                        print('conversation:', str(m['conversation'])[:100], flush=True)
                    if 'imageMessage' in m:
                        im = m['imageMessage']
                        print('imageMessage keys:', list(im.keys()), flush=True)
                        if 'url' in im:
                            print('imageMessage.url:', str(im['url'])[:80], flush=True)
                        if 'caption' in im:
                            print('imageMessage.caption:', im['caption'], flush=True)
                    if 'extendedTextMessage' in m:
                        print('extendedText:', str(m['extendedTextMessage'].get('text',''))[:100], flush=True)
                print('messageTimestamp:', msg.get('messageTimestamp'), flush=True)
                print('pushName:', msg.get('pushName'), flush=True)
            print('=== FIN ===\n', flush=True)
        except Exception as e:
            print('Error:', e, flush=True)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    
    def log_message(self, format, *args):
        pass

server = http.server.HTTPServer(('0.0.0.0', 9999), Handler)
print('Servidor de captura escuchando en puerto 9999', flush=True)
server.serve_forever()
