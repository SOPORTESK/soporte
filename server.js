const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = true;
const app = next({ dev, port: 3100 });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(3100, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3100');
  });
});
