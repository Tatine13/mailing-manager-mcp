import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { createServer as createTlsServer } from 'https';
import crypto from 'crypto';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { SecureInputRequest, SecureSession } from '../core/types.js';
import { generateFormPage, generateExpiredPage, generateSuccessPage } from './html-templates.js';
import { openBrowser } from './browser-launcher.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

interface EphemeralConfig {
  mode: 'local' | 'remote';
  timeoutMs: number;
  host: string;
  portRange: [number, number];
  tls?: { cert: string; key: string };
  tunnel?: boolean;
}

const DEFAULT_CONFIG: EphemeralConfig = {
  mode: 'local',
  timeoutMs: 300_000, // 5 min
  host: '127.0.0.1',
  portRange: [10000, 65535],
  tunnel: true
};

export class EphemeralSecureServer {
  private server: Server | null = null;
  private tunnelProcess: ChildProcess | null = null;
  private sessions: Map<string, SecureSession & {
    ecdh: crypto.ECDH;
    resolve: ((data: Record<string, string>) => void) | null;
    reject: ((err: Error) => void) | null;
  }> = new Map();
  private config: EphemeralConfig;

  constructor(config?: Partial<EphemeralConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.mode === 'remote') {
      this.config.host = '0.0.0.0';
    }
  }

  async requestInput<T extends Record<string, string>>(
    request: SecureInputRequest,
    onUrl?: (publicUrl: string, localUrl: string) => void
  ): Promise<T | void> {
    const ecdh = crypto.createECDH('prime256v1');
    const serverPublicKey = ecdh.generateKeys('base64');

    const session = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(32).toString('hex'),
      csrf: crypto.randomBytes(32).toString('hex'),
      serverPublicKey,
      request,
      used: false,
      createdAt: Date.now(),
      ecdh,
      resolve: null as ((data: Record<string, string>) => void) | null,
      reject: null as ((err: Error) => void) | null,
    };

    const port = await this.findPort();

    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cleanup(session.id);
        reject(new Error(`Secure input timed out after ${this.config.timeoutMs / 1000}s`));
      }, this.config.timeoutMs);

      session.resolve = (data: Record<string, string>) => {
        clearTimeout(timer);
        this.cleanup(session.id);
        resolve(data as T);
      };

      session.reject = (err: Error) => {
        clearTimeout(timer);
        this.cleanup(session.id);
        reject(err);
      };

      this.sessions.set(session.id, session);

      const handler = this.createHandler();

      this.server = this.config.tls
        ? createTlsServer(this.config.tls, handler)
        : createServer(handler);

      this.server.listen(port, '0.0.0.0', async () => {
        const protocol = this.config.tls ? 'https' : 'http';
        const localUrl = `${protocol}://localhost:${port}/input/${session.token}`;
        
        let publicUrl: string | null = null;

        if (this.config.tunnel) {
          try {
            publicUrl = await this.startTunnel(port, session.token);
          } catch (err) {
            logger.warn({ error: err }, 'Failed to start public tunnel, falling back to local URL');
          }
        }

        const finalPublicUrl = publicUrl || localUrl;

        if (onUrl) {
          onUrl(finalPublicUrl, localUrl);
        } else if (this.config.mode === 'local') {
          await openBrowser(finalPublicUrl);
          console.error(`\n🔐 Secure input opened: ${finalPublicUrl}\n`);
        } else {
          console.error(`\n🔐 Secure input URL: ${finalPublicUrl}\n`);
        }
      });

      this.server.on('error', (err) => {
        clearTimeout(timer);
        this.cleanup(session.id);
        reject(err);
      });
    });

    if (onUrl) {
      return promise; 
    }

    return promise;
  }

  private async startTunnel(port: number, token: string): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.info(`Starting public tunnel for port ${port}...`);
      
      // Using Pinggy as it proved reliable in our tests
      this.tunnelProcess = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-p', '443',
        '-R0:localhost:' + port,
        'a.pinggy.io'
      ]);

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          this.tunnelProcess?.kill();
          reject(new Error('Tunnel creation timed out'));
        }
      }, 15000);

      this.tunnelProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9.-]+\.pinggy\.link/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(`${match[0]}/input/${token}`);
        }
      });

      this.tunnelProcess.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  private createHandler() {
    return async (req: IncomingMessage, res: ServerResponse) => {
      // Security headers & CORS for Tunnel support
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Referrer-Policy', 'no-referrer');
      // Relaxed CSP for debugging (allow inline scripts/styles)
      res.setHeader('Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; frame-src *; style-src * 'unsafe-inline';"
      );

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      // GET /input/{token}
      const inputMatch = url.pathname.match(/^\/input\/([a-f0-9]{64})$/);
      if (req.method === 'GET' && inputMatch) {
        return this.handleGetForm(inputMatch[1]!, res);
      }

      // POST /submit/{token}
      const submitMatch = url.pathname.match(/^\/submit\/([a-f0-9]{64})$/);
      if (req.method === 'POST' && submitMatch) {
        return this.handleSubmit(submitMatch[1]!, req, res);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    };
  }

  private handleGetForm(token: string, res: ServerResponse): void {
    const session = this.findByToken(token);

    if (!session || session.used) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateExpiredPage());
      return;
    }

    if (Date.now() - session.createdAt > this.config.timeoutMs) {
      res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateExpiredPage());
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateFormPage(session));
  }

  private async handleSubmit(token: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const session = this.findByToken(token);

    if (!session || session.used) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired session' }));
      return;
    }

    session.used = true; // Mark IMMEDIATELY

    try {
      const body = await this.readBody(req);
      const payload = JSON.parse(body);

      // Validate CSRF
      if (payload.csrf !== session.csrf) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'CSRF validation failed' }));
        session.reject?.(new Error('CSRF validation failed'));
        return;
      }

      // Decrypt with ECDH
      const clientPubKey = Buffer.from(payload.clientPublicKey, 'base64');
      const sharedSecret = session.ecdh.computeSecret(clientPubKey);
      const aesKey = crypto.createHash('sha256').update(sharedSecret).digest();

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        aesKey,
        Buffer.from(payload.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

      let decrypted = decipher.update(Buffer.from(payload.encrypted, 'base64'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const fields = JSON.parse(decrypted.toString('utf-8'));
      
      // DEBUG: Trace exactly what is received from the browser
      fs.appendFileSync(
        '/home/fkomp/Bureau/oracle/tools/mcp-mails/debug_decrypted.log',
        `[${new Date().toISOString()}] Received fields: ${JSON.stringify(fields)}\n`
      );

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateSuccessPage());

      // Give time for the response to flush through the tunnel before closing
      setTimeout(() => {
        session.resolve?.(fields);
      }, 2000);
    } catch (error) {
      logger.error({ error }, 'Secure input decryption error');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid payload' }));
      session.reject?.(error as Error);
    }
  }

  private findByToken(token: string) {
    for (const session of this.sessions.values()) {
      if (session.token === token) return session;
    }
    return undefined;
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 102400) { // 100KB max
          reject(new Error('Payload too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  private async findPort(): Promise<number> {
    const [min, max] = this.config.portRange;
    return new Promise((resolve) => {
      const tryPort = () => {
        const port = min + Math.floor(Math.random() * (max - min));
        const srv = createServer();
        srv.listen(port, this.config.host, () => {
          srv.close(() => resolve(port));
        });
        srv.on('error', () => tryPort());
      };
      tryPort();
    });
  }

  private cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Wipe ECDH private key
      try { session.ecdh.generateKeys(); } catch {}
    }
    this.sessions.delete(sessionId);
    
    if (this.tunnelProcess) {
      this.tunnelProcess.kill();
      this.tunnelProcess = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
