const http = require('http');
const { spawn } = require('child_process');
const port = 8888;
const server = http.createServer((req, res) => {
  res.end('Cloudflare Tunnel is Perfect!');
});
server.listen(port, () => {
  console.log('Server OK');
  const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8888']);
  tunnel.stderr.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) console.log('URL: ' + match[0]);
  });
  setTimeout(() => { tunnel.kill(); server.close(); process.exit(0); }, 20000);
});