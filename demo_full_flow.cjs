const http = require('http');
const { spawn } = require('child_process');
const { parse } = require('querystring');
const fs = require('fs');

const port = 8889;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const data = parse(body);
      // On écrit le résultat dans un fichier pour que l'agent puisse le lire même si le processus est en arrière-plan
      fs.appendFileSync('resultats_demo.log', `\n[${new Date().toISOString()}] PASSWORD_RECU: ${data.password}\n`);
      
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1 style="font-family:sans-serif;text-align:center;margin-top:50px;">✅ Données reçues par l\'IA !</h1>');
      console.log('✅ Données reçues et loggées.');
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style='font-family:sans-serif; text-align:center; padding:50px;'>
          <div style='display:inline-block; text-align:left; border:2px solid #007bff; padding:30px; border-radius:15px;'>
            <h2>🔐 Test Flux Killer MCP</h2>
            <p>Compte : <strong>geminiEA@mail.com</strong></p>
            <form action='/submit' method='POST'>
              <input type='password' name='password' placeholder='Tapez votre mot de passe...' required style='padding:10px; width:250px; border-radius:5px; border:1px solid #ccc;'><br><br>
              <button type='submit' style='background:#007bff; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold; width:100%;'>🚀 Envoyer à l'IA</button>
            </form>
          </div>
        </body>
      </html>
    `);
  }
});

server.listen(port, '0.0.0.0', () => {
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`]);
  tunnel.stderr.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      fs.writeFileSync('tunnel_url.txt', match[0]);
      console.log('URL écrite dans tunnel_url.txt');
    }
  });
});
