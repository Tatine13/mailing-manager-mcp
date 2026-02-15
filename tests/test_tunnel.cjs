const http = require('http');
const localtunnel = require('localtunnel');

const port = 8888;
const server = http.createServer((req, res) => {
  res.end('Tunnel Works!');
});

server.listen(port, async () => {
  console.log('Server started');
  const tunnel = await localtunnel(port);
  console.log('URL: ' + tunnel.url);
  
  setTimeout(() => {
    tunnel.close();
    server.close();
    process.exit(0);
  }, 10000);
});
