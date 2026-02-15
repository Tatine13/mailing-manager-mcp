const http = require('http');
const localtunnel = require('localtunnel');

// 1. Démarrer un serveur local simple
const port = 8888;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from the secure tunnel!');
  console.log('✅ Request received through tunnel!');
});

server.listen(port, async () => {
  console.log(`🔌 Local server running on port ${port}`);

  try {
    console.log('🚀 Creating public tunnel...');
    
    // 2. Créer le tunnel
    const tunnel = await localtunnel({ port: port });

    console.log('
--------------------------------------------------');
    console.log('🌍 PUBLIC URL:', tunnel.url);
    console.log('--------------------------------------------------
');

    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });

    // Garder en vie 20 secondes pour le test
    setTimeout(() => {
      console.log('🛑 Closing tunnel test...');
      tunnel.close();
      server.close();
      process.exit(0);
    }, 20000);

  } catch (err) {
    console.error('❌ Tunnel creation failed:', err);
    server.close();
    process.exit(1);
  }
});
