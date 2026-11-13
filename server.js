'use strict';
// Lucy pairing site for Render: serves the page over HTTPS and passes pairing requests to the bot server.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BOT_URL = String(process.env.BOT_URL || '').replace(/\/+$/, ''); // e.g. http://node-1.nexusbot.qzz.io:25511
const hits = new Map();

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': type.startsWith('image') ? 'public, max-age=86400' : 'no-store' });
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return send(res, 200, 'text/plain', 'ok');
  if (url.pathname === '/logo.png') return send(res, 200, 'image/png', fs.readFileSync(path.join(__dirname, 'logo.png')));
  if (url.pathname === '/api/pair') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!BOT_URL) return send(res, 500, 'application/json', JSON.stringify({ error: 'Site is not set up yet (BOT_URL missing).' }));
    const number = String(url.searchParams.get('number') || '').replace(/\D/g, '');
    if (number.length < 8 || number.length > 15) return send(res, 400, 'application/json', JSON.stringify({ error: 'Enter your full number with country code.' }));
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const recent = (hits.get(ip) || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
    if (recent.length >= 5) return send(res, 429, 'application/json', JSON.stringify({ error: 'Too many tries. Please wait a few minutes.' }));
    recent.push(Date.now()); hits.set(ip, recent);
    try {
      const r = await fetch(`${BOT_URL}/pair?number=${number}`, { headers: { 'x-forwarded-for': ip }, signal: AbortSignal.timeout(50000) });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { error: 'The bot server sent an unexpected answer. Try again in a minute.' }; }
      return send(res, r.ok ? 200 : (r.status || 502), 'application/json', JSON.stringify(data));
    } catch (e) {
      return send(res, 502, 'application/json', JSON.stringify({ error: 'Could not reach the bot server. Try again in a minute.' }));
    }
  }
  if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'index.html')));
  send(res, 404, 'text/plain', 'Not found');
}).listen(PORT, '0.0.0.0', () => console.log('Lucy pair site on port ' + PORT));
