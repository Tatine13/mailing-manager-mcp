# Documentation du projet: mcp-mails (Partie 2/2)

## 📝 Contenu des fichiers (suite)

##### 📄 `src/secure-input/ephemeral-server.ts`

```typescript
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { createServer as createTlsServer } from 'https';
import crypto from 'crypto';
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
}

const DEFAULT_CONFIG: EphemeralConfig = {
  mode: 'local',
  timeoutMs: 300_000, // 5 min
  host: '127.0.0.1',
  portRange: [10000, 65535]
};

export class EphemeralSecureServer {
  private server: Server | null = null;
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
    request: SecureInputRequest
  ): Promise<T> {
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

    return new Promise<T>((resolve, reject) => {
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

      this.server.listen(port, this.config.host, async () => {
        const protocol = this.config.tls ? 'https' : 'http';
        const displayHost = this.config.host === '0.0.0.0' ? 'localhost' : this.config.host;
        const url = `${protocol}://${displayHost}:${port}/input/${session.token}`;

        if (this.config.mode === 'local') {
          const opened = await openBrowser(url);
          console.error(''); // blank line on stderr
          console.error('🔐 Secure input opened in your browser.');
          if (!opened) {
            console.error(`   Could not open automatically. Visit: ${url}`);
          } else {
            console.error(`   If it didn't open, visit: ${url}`);
          }
          console.error(`   Expires in ${this.config.timeoutMs / 60000} minutes.`);
          console.error('');
        } else {
          console.error('');
          console.error(`🔐 Secure input URL (expires in ${this.config.timeoutMs / 60000} min):`);
          console.error(`   ${url}`);
          console.error('');
        }
      });

      this.server.on('error', (err) => {
        clearTimeout(timer);
        this.cleanup(session.id);
        reject(err);
      });
    });
  }

  private createHandler() {
    return async (req: IncomingMessage, res: ServerResponse) => {
      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'"
      );

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

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(generateSuccessPage());

      session.resolve?.(fields);
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
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

```

##### 📄 `src/secure-input/html-templates.ts`

```typescript
import { SecureInputField, SecureSession } from '../core/types.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildFieldsHtml(fields: SecureInputField[]): string {
  return fields.map(field => {
    if (field.type === 'select') {
      const optionsHtml = (field.options || [])
        .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join('');
      return `
        <div class="field">
          <label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
          <select id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}"
                  ${field.required ? 'required' : ''}>
            <option value="">-- Select --</option>
            ${optionsHtml}
          </select>
        </div>`;
    }
    const attrs: string[] = [];
    if (field.required) attrs.push('required');
    if (field.validation?.minLength) attrs.push(`minlength="${field.validation.minLength}"`);
    if (field.validation?.maxLength) attrs.push(`maxlength="${field.validation.maxLength}"`);
    if (field.validation?.pattern) attrs.push(`pattern="${escapeHtml(field.validation.pattern)}"`);

    return `
      <div class="field">
        <label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
        <input type="${field.type}"
               id="${escapeHtml(field.name)}"
               name="${escapeHtml(field.name)}"
               placeholder="${escapeHtml(field.placeholder || '')}"
               autocomplete="off"
               ${attrs.join(' ')} />
        ${field.validation?.message
          ? `<small class="hint">${escapeHtml(field.validation.message)}</small>`
          : ''}
      </div>`;
  }).join('\n');
}

export function generateFormPage(session: SecureSession): string {
  const { request, serverPublicKey, csrf, token } = session;

  const fields: SecureInputField[] = request.type === 'password'
    ? [{
        name: 'password',
        label: request.message,
        type: 'password',
        required: true,
        placeholder: 'Enter your password'
      }]
    : request.fields || [];

  const fieldsHtml = buildFieldsHtml(fields);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(request.title)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0a0a0a;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .container{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:16px;padding:40px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
    .lock-icon{text-align:center;font-size:48px;margin-bottom:20px}
    h1{text-align:center;font-size:1.4rem;margin-bottom:8px;color:#fff}
    .subtitle{text-align:center;color:#888;font-size:.9rem;margin-bottom:30px}
    .security-badge{display:flex;align-items:center;gap:8px;background:#0d2818;border:1px solid #1a4a2e;border-radius:8px;padding:10px 14px;margin-bottom:24px;font-size:.8rem;color:#4ade80}
    .field{margin-bottom:20px}
    label{display:block;font-size:.85rem;color:#aaa;margin-bottom:6px;font-weight:500}
    input,select{width:100%;padding:12px 16px;background:#0d0d1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:1rem;transition:border-color .2s;outline:none}
    input:focus,select:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.2)}
    select option{background:#1a1a2e;color:#fff}
    .hint{display:block;color:#666;font-size:.75rem;margin-top:4px}
    .actions{display:flex;gap:12px;margin-top:28px}
    button{flex:1;padding:12px;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;border:none;transition:all .2s}
    .btn-primary{background:#6366f1;color:#fff}
    .btn-primary:hover{background:#5558e6}
    .btn-primary:disabled{background:#333;cursor:not-allowed;color:#666}
    .btn-cancel{background:transparent;color:#888;border:1px solid #333}
    .btn-cancel:hover{border-color:#555;color:#aaa}
    .error-box{background:#2d1215;border:1px solid #5c2127;color:#f87171;padding:10px;border-radius:8px;font-size:.85rem;margin-top:16px;display:none}
    .spinner{display:none;text-align:center;padding:20px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spinner::after{content:'';display:inline-block;width:24px;height:24px;border:3px solid #333;border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite}
  </style>
</head>
<body>
  <div class="container">
    <div class="lock-icon">&#128274;</div>
    <h1>${escapeHtml(request.title)}</h1>
    <p class="subtitle">Mailing Manager MCP &mdash; Secure Input</p>
    <div class="security-badge">
      &#128737;&#65039; End-to-end encrypted &bull; Single-use link &bull; Auto-expires
    </div>
    <form id="secureForm" novalidate>
      ${fieldsHtml}
      <div class="actions">
        <button type="button" class="btn-cancel" onclick="window.close()">Cancel</button>
        <button type="submit" class="btn-primary" id="submitBtn">Submit Securely</button>
      </div>
      <div class="error-box" id="errorBox"></div>
      <div class="spinner" id="spinner"></div>
    </form>
  </div>
<script>
(function(){
  var SERVER_PUB = '${serverPublicKey}';
  var CSRF = '${csrf}';
  var SUBMIT_URL = '/submit/${token}';

  function b64ToAB(b64){var bin=atob(b64),bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer}
  function abToB64(buf){var bytes=new Uint8Array(buf),bin='';for(var i=0;i<bytes.byteLength;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin)}

  async function encryptAndSubmit(formData){
    var btn=document.getElementById('submitBtn');
    var spinner=document.getElementById('spinner');
    var errBox=document.getElementById('errorBox');
    btn.disabled=true;spinner.style.display='block';errBox.style.display='none';
    try{
      var kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
      var serverKey=await crypto.subtle.importKey('raw',b64ToAB(SERVER_PUB),{name:'ECDH',namedCurve:'P-256'},false,[]);
      var shared=await crypto.subtle.deriveBits({name:'ECDH',public:serverKey},kp.privateKey,256);
      var aesKeyBuf=await crypto.subtle.digest('SHA-256',shared);
      var aesKey=await crypto.subtle.importKey('raw',aesKeyBuf,{name:'AES-GCM'},false,['encrypt']);
      var iv=crypto.getRandomValues(new Uint8Array(12));
      var plain=new TextEncoder().encode(JSON.stringify(formData));
      var ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv,tagLength:128},aesKey,plain);
      var ctBytes=new Uint8Array(ct);
      var encrypted=ctBytes.slice(0,ctBytes.length-16);
      var tag=ctBytes.slice(ctBytes.length-16);
      var clientPub=await crypto.subtle.exportKey('raw',kp.publicKey);
      var resp=await fetch(SUBMIT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:CSRF,encrypted:abToB64(encrypted.buffer),clientPublicKey:abToB64(clientPub),iv:abToB64(iv.buffer),tag:abToB64(tag.buffer)})});
      if(resp.ok){
        document.body.innerHTML='<div class="container" style="text-align:center"><div style="font-size:64px;margin-bottom:20px">&#9989;</div><h1>Secure Input Received</h1><p class="subtitle">You can close this tab. Data was encrypted end-to-end.</p></div>';
        setTimeout(function(){window.close()},3000);
      }else{throw new Error('Server rejected: '+resp.status)}
    }catch(e){
      errBox.textContent='Error: '+e.message;errBox.style.display='block';
      btn.disabled=false;spinner.style.display='none';
    }
  }

  document.getElementById('secureForm').addEventListener('submit',function(e){
    e.preventDefault();
    var fd={};
    var inputs=e.target.querySelectorAll('input,select');
    for(var i=0;i<inputs.length;i++){
      if(inputs[i].required && !inputs[i].value){
        inputs[i].focus();return;
      }
      fd[inputs[i].name]=inputs[i].value;
    }
    encryptAndSubmit(fd);
  });

  var first=document.querySelector('input,select');
  if(first)first.focus();
})();
</script>
</body>
</html>`;
}

export function generateExpiredPage(): string {
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><div style="font-size:64px">&#9200;</div><h1>Session Expired</h1><p style="color:#888">This link has expired or was already used.</p></div></body></html>`;
}

export function generateSuccessPage(): string {
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><div style="font-size:64px">&#9989;</div><h1>Success</h1><p style="color:#888">You can close this tab now.</p></div></body></html>`;
}

```

##### 📄 `src/secure-input/index.ts`

```typescript
import { EphemeralSecureServer } from './ephemeral-server.js';
import { AccountCredentials, SecureInputField } from '../core/types.js';

export class SecureInput {
  private server: EphemeralSecureServer;

  constructor(mode: 'local' | 'remote' = 'local', timeoutMs: number = 300_000) {
    const isRemote = mode === 'remote' || !process.stdout.isTTY || !!process.env.REMOTE_MODE;
    this.server = new EphemeralSecureServer({
      mode: isRemote ? 'remote' : 'local',
      timeoutMs
    });
  }

  async password(message: string, title?: string): Promise<string> {
    const result = await this.server.requestInput<{ password: string }>({
      type: 'password',
      title: title || '🔐 Password Required',
      message
    });
    return result.password;
  }

  async masterKeySetup(): Promise<string> {
    const result = await this.server.requestInput<{
      password: string;
      confirm: string;
    }>({
      type: 'multi-field',
      title: '🔑 Master Key Setup',
      message: 'Create a master password to encrypt all your data',
      fields: [
        {
          name: 'password',
          label: 'Master Password',
          type: 'password',
          required: true,
          placeholder: '',
          validation: { minLength: 12, message: 'Minimum 12 characters' }
        },
        {
          name: 'confirm',
          label: 'Confirm Master Password',
          type: 'password',
          required: true,
          placeholder: ''
        }
      ]
    });

    if (result.password !== result.confirm) {
      throw new Error('Passwords do not match');
    }

    return result.password;
  }

  async masterKeyUnlock(): Promise<string> {
    return this.password('Enter your master password to unlock', '🔓 Unlock Vault');
  }

  async accountSetup(): Promise<AccountCredentials> {
    const raw = await this.server.requestInput<Record<string, string>>({
      type: 'multi-field',
      title: '📧 Email Account Setup',
      message: 'Configure your email account securely',
      fields: [
        {
          name: 'email',
          label: 'Email Address',
          type: 'email',
          required: true,
          placeholder: 'you@example.com'
        },
        {
          name: 'password',
          label: 'Password or App Password',
          type: 'password',
          required: true,
          placeholder: ''
        },
        {
          name: 'provider',
          label: 'Email Provider',
          type: 'select',
          required: true,
          options: [
            { value: 'gmail', label: 'Gmail' },
            { value: 'outlook', label: 'Outlook / Microsoft 365' },
            { value: 'yahoo', label: 'Yahoo Mail' },
            { value: 'icloud', label: 'iCloud Mail' },
            { value: 'fastmail', label: 'Fastmail' },
            { value: 'custom', label: 'Custom IMAP/SMTP' }
          ]
        },
        {
          name: 'imapHost',
          label: 'IMAP Server (custom only)',
          type: 'text',
          required: false,
          placeholder: 'imap.example.com'
        },
        {
          name: 'imapPort',
          label: 'IMAP Port (custom only)',
          type: 'number',
          required: false,
          placeholder: '993'
        },
        {
          name: 'smtpHost',
          label: 'SMTP Server (custom only)',
          type: 'text',
          required: false,
          placeholder: 'smtp.example.com'
        },
        {
          name: 'smtpPort',
          label: 'SMTP Port (custom only)',
          type: 'number',
          required: false,
          placeholder: '587'
        }
      ]
    });

    return {
      email: raw.email || '',
      password: raw.password,
      provider: raw.provider as any,
      imapHost: raw.imapHost,
      imapPort: raw.imapPort ? parseInt(raw.imapPort, 10) : undefined,
      smtpHost: raw.smtpHost,
      smtpPort: raw.smtpPort ? parseInt(raw.smtpPort, 10) : undefined
    };
  }

  async multiField(
    title: string,
    message: string,
    fields: SecureInputField[]
  ): Promise<Record<string, string>> {
    return this.server.requestInput({
      type: 'multi-field',
      title,
      message,
      fields
    });
  }
}

export { EphemeralSecureServer } from './ephemeral-server.js';

```

#### 📁 security

##### 📄 `src/security/encryption.ts`

```typescript
import crypto from 'crypto';
import { EncryptedData, KeyDerivationConfig } from '../core/types.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const CURRENT_VERSION = 1;

export class EncryptionService {
  private masterKey: Buffer | null = null;

  // Derive master key from password using argon2
  async deriveMasterKey(
    password: string,
    salt?: string,
    config?: Partial<KeyDerivationConfig>
  ): Promise<{ key: Buffer; salt: string; config: KeyDerivationConfig }> {
    let argon2: typeof import('argon2');
    try {
      argon2 = await import('argon2');
    } catch {
      throw new Error(
        'argon2 is required for key derivation. ' +
        'Run: npm install argon2'
      );
    }

    const derivationConfig: KeyDerivationConfig = {
      algorithm: 'argon2id',
      timeCost: config?.timeCost ?? 3,
      memoryCost: config?.memoryCost ?? 65536,
      parallelism: config?.parallelism ?? 4,
      saltLength: config?.saltLength ?? 32
    };

    const saltBuffer = salt
      ? Buffer.from(salt, 'hex')
      : crypto.randomBytes(derivationConfig.saltLength);

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: derivationConfig.timeCost,
      memoryCost: derivationConfig.memoryCost,
      parallelism: derivationConfig.parallelism,
      salt: saltBuffer,
      raw: true,
      hashLength: 32
    });

    return {
      key: hash,
      salt: saltBuffer.toString('hex'),
      config: derivationConfig
    };
  }

  // Set the master key (after derivation or unlock)
  setMasterKey(key: Buffer): void {
    this.masterKey = Buffer.from(key);
  }

  // Clear master key from memory
  clearMasterKey(): void {
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  // Check if master key is loaded
  isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  // Encrypt a string value
  encrypt(plaintext: string): EncryptedData {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv, {
      authTagLength: TAG_LENGTH
    });

    let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      version: CURRENT_VERSION
    };
  }

  // Decrypt an encrypted value
  decrypt(data: EncryptedData): string {
    if (!this.masterKey) {
      throw new Error('Master key not set. Call setMasterKey() first.');
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.masterKey,
      Buffer.from(data.iv, 'base64'),
      { authTagLength: TAG_LENGTH }
    );

    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));

    let decrypted = decipher.update(data.ciphertext, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  // Create a hash of the master key for verification (not the key itself)
  async hashMasterKey(password: string, salt: string): Promise<string> {
    let argon2: typeof import('argon2');
    try {
      argon2 = await import('argon2');
    } catch {
      throw new Error('argon2 required');
    }

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 65536,
      parallelism: 4,
      salt: Buffer.from(salt, 'hex')
    });

    return hash;
  }

  // Verify master key password against stored hash
  async verifyMasterKey(password: string, storedHash: string): Promise<boolean> {
    let argon2: typeof import('argon2');
    try {
      argon2 = await import('argon2');
    } catch {
      throw new Error('argon2 required');
    }

    return argon2.verify(storedHash, password);
  }

  // Generate a random secret (for webhook secrets, etc.)
  generateSecret(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // HMAC signature for webhooks
  signPayload(payload: string, secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
    return crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');
  }

  // Verify HMAC signature
  verifySignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
  ): boolean {
    const expected = this.signPayload(payload, secret, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }
}

```

#### 📁 storage

##### 📄 `src/storage/database.ts`

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getLogger } from '../utils/logger.js';
import { fileURLToPath } from 'url';

export class DatabaseManager {
  private db: Database.Database | null = null;
  private logger = getLogger();

  constructor(private dbPath: string) {}

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath, {
      // WAL mode for better concurrent read performance
    });

    // Enable WAL mode
    this.db.pragma('journal_mode = WAL');
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    // Busy timeout 5 seconds
    this.db.pragma('busy_timeout = 5000');

    // Run migrations
    await this.runMigrations();

    this.logger.info({ path: this.dbPath }, 'Database initialized');
  }

  private async runMigrations(): Promise<void> {
    const db = this.getDb();

    // Create migrations tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Read migration files
    const migrationsDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../migrations'
    );

    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn({ dir: migrationsDir }, 'Migrations directory not found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const applied = new Set(
      (db.prepare('SELECT filename FROM migrations')
        .all() as Array<{ filename: string }>)
        .map(row => row.filename)
    );

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
      })();

      this.logger.info({ file }, 'Migration applied');
    }
  }

  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('Database closed');
    }
  }

  // Utility: run in transaction
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }
}

```

#### 📁 tasks

##### 📄 `src/tasks/task-engine.ts`

```typescript
import crypto from 'crypto';
import { Cron } from 'croner';
import { DatabaseManager } from '../storage/database.js';
import { Task } from '../core/types.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class TaskEngine {
  private scheduledJobs: Map<string, Cron> = new Map();

  constructor(private db: DatabaseManager) {}

  create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'runCount'>): Task {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.getDb().prepare(`
      INSERT INTO tasks (id, account_id, type, name, description,
        schedule, parameters, persona_id, status,
        run_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, data.accountId, data.type, data.name, data.description || '',
      JSON.stringify(data.schedule), JSON.stringify(data.parameters),
      data.personaId || null, data.status || 'active',
      now, now
    );

    const task = this.get(id)!;

    // Schedule if active
    if (task.status === 'active') {
      this.scheduleTask(task);
    }

    logger.info({ id, name: data.name, type: data.type }, 'Task created');
    return task;
  }

  get(id: string): Task | null {
    const row = this.db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  listByAccount(accountId: string): Task[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM tasks WHERE account_id = ? ORDER BY created_at DESC'
    ).all(accountId) as any[];
    return rows.map(r => this.rowToTask(r));
  }

  listAll(): Task[] {
    const rows = this.db.getDb().prepare(
      'SELECT * FROM tasks ORDER BY created_at DESC'
    ).all() as any[];
    return rows.map(r => this.rowToTask(r));
  }

  update(id: string, updates: Partial<Task>): Task {
    const existing = this.get(id);
    if (!existing) throw new Error(`Task ${id} not found`);

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.schedule !== undefined) { fields.push('schedule = ?'); values.push(JSON.stringify(updates.schedule)); }
    if (updates.parameters !== undefined) { fields.push('parameters = ?'); values.push(JSON.stringify(updates.parameters)); }
    if (updates.personaId !== undefined) { fields.push('persona_id = ?'); values.push(updates.personaId); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.lastRun !== undefined) { fields.push('last_run = ?'); values.push(updates.lastRun); }
    if (updates.nextRun !== undefined) { fields.push('next_run = ?'); values.push(updates.nextRun); }
    if (updates.lastError !== undefined) { fields.push('last_error = ?'); values.push(updates.lastError); }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);
      this.db.getDb().prepare(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    // Reschedule if needed
    const updated = this.get(id)!;
    this.unscheduleTask(id);
    if (updated.status === 'active') {
      this.scheduleTask(updated);
    }

    return updated;
  }

  delete(id: string): void {
    this.unscheduleTask(id);
    this.db.getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
    logger.info({ id }, 'Task deleted');
  }

  pause(id: string): Task {
    return this.update(id, { status: 'paused' });
  }

  resume(id: string): Task {
    return this.update(id, { status: 'active' });
  }

  // Execute a task manually
  async execute(id: string): Promise<void> {
    const task = this.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const now = new Date().toISOString();

    try {
      this.update(id, { status: 'running', lastRun: now });

      // TODO: Implement actual task execution logic per task type
      // This will be called by the task executor with proper context
      logger.info({ id, type: task.type }, 'Task executed');

      this.db.getDb().prepare(
        'UPDATE tasks SET run_count = run_count + 1, status = ?, last_error = NULL, updated_at = ? WHERE id = ?'
      ).run('active', now, id);

      getEventBus().emit('task.completed', { taskId: id, result: {} });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.update(id, { status: 'failed', lastError: errorMsg });
      getEventBus().emit('task.failed', { taskId: id, error: errorMsg });
      throw error;
    }
  }

  // Start all active scheduled tasks
  startScheduler(): void {
    const activeTasks = this.db.getDb().prepare(
      "SELECT * FROM tasks WHERE status = 'active'"
    ).all() as any[];

    for (const row of activeTasks) {
      const task = this.rowToTask(row);
      this.scheduleTask(task);
    }

    logger.info({ activeTasks: activeTasks.length }, 'Task scheduler started');
  }

  // Stop all scheduled tasks
  stopScheduler(): void {
    for (const [, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
    logger.info('Task scheduler stopped');
  }

  private scheduleTask(task: Task): void {
    if (task.schedule.type === 'cron' && task.schedule.value) {
      const job = new Cron(task.schedule.value, {
        timezone: task.schedule.timezone || 'UTC'
      }, () => {
        this.execute(task.id).catch(err => {
          logger.error({ taskId: task.id, error: err }, 'Scheduled task failed');
        });
      });

      this.scheduledJobs.set(task.id, job);
      logger.debug({ id: task.id, cron: task.schedule.value }, 'Task scheduled');
    } else if (task.schedule.type === 'interval' && task.schedule.value) {
      const intervalMs = parseInt(task.schedule.value, 10) * 1000;
      const cronExpression = `*/${Math.max(1, Math.floor(intervalMs / 1000))} * * * * *`;

      try {
        const job = new Cron(cronExpression, () => {
          this.execute(task.id).catch(err => {
            logger.error({ taskId: task.id, error: err }, 'Interval task failed');
          });
        });

        this.scheduledJobs.set(task.id, job);
      } catch {
        // Interval too large for cron, use setInterval fallback
        const interval = setInterval(() => {
          this.execute(task.id).catch(err => {
            logger.error({ taskId: task.id, error: err }, 'Interval task failed');
          });
        }, intervalMs);

        // Wrap in a fake Cron-like object for cleanup
        this.scheduledJobs.set(task.id, {
          stop: () => clearInterval(interval)
        } as any);
      }
    }
  }

  private unscheduleTask(id: string): void {
    const job = this.scheduledJobs.get(id);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(id);
    }
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      name: row.name,
      description: row.description || '',
      schedule: JSON.parse(row.schedule),
      parameters: JSON.parse(row.parameters),
      personaId: row.persona_id || undefined,
      status: row.status,
      lastRun: row.last_run || undefined,
      nextRun: row.next_run || undefined,
      runCount: row.run_count,
      lastError: row.last_error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

```

#### 📁 tools

##### 📄 `src/tools/account-tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AccountManager } from '../accounts/account-manager.js';
import { ConnectionPool } from '../email/connection-pool.js';
import { SecureInput } from '../secure-input/index.js';

export function registerAccountTools(
  server: McpServer,
  accountManager: AccountManager,
  connectionPool: ConnectionPool,
  secureInput: SecureInput
): void {

  server.tool(
    'add_account',
    'Add a new email account. Opens a secure browser form to enter credentials.',
    {},
    async () => {
      try {
        const credentials = await secureInput.accountSetup();
        const account = await accountManager.addAccount(credentials);
        return {
          content: [{
            type: 'text',
            text: `✅ Account added successfully!\n\nEmail: ${account.email}\nProvider: ${account.provider}\nID: ${account.id}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ Failed to add account: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_accounts',
    'List all configured email accounts',
    {
      active_only: z.boolean().optional().describe('Only show active accounts')
    },
    async ({ active_only }) => {
      const accounts = accountManager.listAccounts(active_only || false);

      if (accounts.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No email accounts configured. Use add_account to add one.'
          }]
        };
      }

      const list = accounts.map(a =>
        `• ${a.email} (${a.provider}) [${a.active ? '✅ active' : '⏸️ paused'}] — ID: ${a.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📧 Email Accounts (${accounts.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'remove_account',
    'Remove an email account',
    {
      account_id: z.string().uuid().describe('Account ID to remove')
    },
    async ({ account_id }) => {
      try {
        const account = accountManager.getAccount(account_id);
        if (!account) {
          return {
            content: [{ type: 'text', text: `❌ Account ${account_id} not found` }],
            isError: true
          };
        }

        await connectionPool.removeConnection(account_id);
        accountManager.removeAccount(account_id);

        return {
          content: [{
            type: 'text',
            text: `✅ Account ${account.email} removed successfully.`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'test_connection',
    'Test the connection to an email account',
    {
      account_id: z.string().uuid().describe('Account ID to test')
    },
    async ({ account_id }) => {
      try {
        const account = accountManager.getAccount(account_id);
        if (!account) {
          return {
            content: [{ type: 'text', text: `❌ Account ${account_id} not found` }],
            isError: true
          };
        }

        const imap = await connectionPool.getImap(account_id);
        const folders = await imap.listFolders();

        return {
          content: [{
            type: 'text',
            text: `✅ Connection successful for ${account.email}\n\nFolders found: ${folders.map(f => f.name).join(', ')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `❌ Connection failed: ${(error as Error).message}`
          }],
          isError: true
        };
      }
    }
  );
}

```

##### 📄 `src/tools/directive-tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DirectiveEngine } from '../directives/directive-engine.js';
import { DirectiveTypeSchema, ConditionFieldSchema, ConditionOperatorSchema, ActionTypeSchema } from '../core/types.js';
import { ConnectionPool } from '../email/connection-pool.js';

export function registerDirectiveTools(
  server: McpServer,
  directiveEngine: DirectiveEngine,
  connectionPool: ConnectionPool
): void {

  server.tool(
    'create_directive',
    'Create an automation directive (rule)',
    {
      account_id: z.string().uuid().describe('Account ID'),
      name: z.string().min(1).describe('Directive name'),
      type: DirectiveTypeSchema.describe('Type (inbound/outbound)'),
      priority: z.number().int().default(100).describe('Priority (lower runs first)'),
      condition_field: ConditionFieldSchema.describe('Field to check'),
      condition_operator: ConditionOperatorSchema.describe('Operator'),
      condition_value: z.string().describe('Value to match'),
      action_type: ActionTypeSchema.describe('Action to take'),
      action_params: z.string().optional().describe('JSON string of action parameters')
    },
    async (args) => {
      try {
        let actionParams = {};
        if (args.action_params) {
          try { actionParams = JSON.parse(args.action_params); } catch { /* ignore */ }
        }

        const directive = directiveEngine.create({
          accountId: args.account_id,
          name: args.name,
          description: '',
          type: args.type,
          priority: args.priority,
          active: true,
          trigger: {
            conditions: [{
              field: args.condition_field,
              operator: args.condition_operator,
              value: args.condition_value,
              caseSensitive: false
            }],
            matchAll: true
          },
          actions: [{
            type: args.action_type,
            parameters: actionParams
          }]
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Directive created!\nID: ${directive.id}\nName: ${directive.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create directive: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_directives',
    'List directives for an account',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      const directives = directiveEngine.listByAccount(account_id);

      if (directives.length === 0) {
        return { content: [{ type: 'text', text: 'No directives found.' }] };
      }

      const list = directives.map(d =>
        `• ${d.name} (Priority: ${d.priority}) [${d.active ? '✅' : '⏸️'}] — ID: ${d.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📋 Directives (${directives.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'test_directive',
    'Test which directives match a specific email',
    {
      account_id: z.string().uuid().describe('Account ID'),
      email_id: z.string().describe('Email UID'),
      folder: z.string().optional().default('INBOX')
    },
    async ({ account_id, email_id, folder }) => {
      try {
        const imap = await connectionPool.getImap(account_id);
        const email = await imap.readEmail(folder, parseInt(email_id, 10));

        if (!email) {
          return { content: [{ type: 'text', text: 'Email not found.' }], isError: true };
        }

        const allDirectives = directiveEngine.listByAccount(account_id);
        const matching = directiveEngine.evaluateEmail(email, allDirectives);

        if (matching.length === 0) {
          return { content: [{ type: 'text', text: 'No directives matched this email.' }] };
        }

        const list = matching.map(d => `✅ ${d.name} (ID: ${d.id})`).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🎯 Matching Directives:\n\n${list}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Error: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_directive',
    'Delete a directive',
    {
      directive_id: z.string().uuid()
    },
    async ({ directive_id }) => {
      directiveEngine.delete(directive_id);
      return { content: [{ type: 'text', text: '✅ Directive deleted.' }] };
    }
  );
}

```

##### 📄 `src/tools/email-tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConnectionPool } from '../email/connection-pool.js';

export function registerEmailTools(
  server: McpServer,
  connectionPool: ConnectionPool
): void {

  server.tool(
    'list_emails',
    'List emails from an account folder',
    {
      account_id: z.string().uuid().describe('Account ID'),
      folder: z.string().optional().describe('Folder name, default INBOX'),
      limit: z.number().int().min(1).max(100).optional().describe('Max emails to return'),
      unread_only: z.boolean().optional().describe('Only show unread emails')
    },
    async ({ account_id, folder, limit, unread_only }) => {
      try {
        const imap = await connectionPool.getImap(account_id);
        const emails = await imap.listEmails(folder || 'INBOX', {
          limit: limit || 20,
          read: unread_only ? false : undefined
        });

        if (emails.length === 0) {
          return { content: [{ type: 'text', text: 'No emails found.' }] };
        }

        const list = emails.map(e => {
          const flag = e.read ? '📖' : '📩';
          const star = e.flagged ? '⭐' : '';
          return `${flag}${star} From: ${e.from.address}\n   Subject: ${e.subject}\n   Date: ${e.date.toISOString()}\n   ID: ${e.id}`;
        }).join('\n\n');

        return {
          content: [{
            type: 'text',
            text: `📧 Emails in ${folder || 'INBOX'} (${emails.length}):\n\n${list}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'read_email',
    'Read the full content of an email',
    {
      account_id: z.string().uuid().describe('Account ID'),
      email_id: z.string().describe('Email UID'),
      folder: z.string().optional().describe('Folder name, default INBOX')
    },
    async ({ account_id, email_id, folder }) => {
      try {
        const imap = await connectionPool.getImap(account_id);
        const email = await imap.readEmail(folder || 'INBOX', parseInt(email_id, 10));

        if (!email) {
          return { content: [{ type: 'text', text: 'Email not found.' }], isError: true };
        }

        const text = [
          `From: ${email.from.name || ''} <${email.from.address}>`,
          `To: ${email.to.map(t => t.address).join(', ')}`,
          email.cc ? `CC: ${email.cc.map(c => c.address).join(', ')}` : '',
          `Subject: ${email.subject}`,
          `Date: ${email.date.toISOString()}`,
          `Flags: ${email.flags.join(', ') || 'none'}`,
          `Attachments: ${email.attachments.length}`,
          '',
          '--- Body ---',
          email.body.text || email.body.html || '(empty)'
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'send_email',
    'Send an email from an account',
    {
      account_id: z.string().uuid().describe('Account ID to send from'),
      to: z.array(z.string().email()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (plain text)'),
      html: z.string().optional().describe('Email body (HTML, optional)'),
      cc: z.array(z.string().email()).optional().describe('CC recipients'),
      bcc: z.array(z.string().email()).optional().describe('BCC recipients'),
      reply_to_id: z.string().optional().describe('Message ID to reply to')
    },
    async ({ account_id, to, subject, body, html, cc, bcc, reply_to_id }) => {
      try {
        const smtp = await connectionPool.getSmtp(account_id);
        const result = await smtp.sendEmail({
          accountId: account_id,
          to,
          subject,
          body,
          html,
          cc,
          bcc,
          inReplyTo: reply_to_id
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Email sent successfully!\nMessage ID: ${result.messageId}\nTo: ${to.join(', ')}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Send failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'search_emails',
    'Search emails across folders',
    {
      account_id: z.string().uuid().describe('Account ID'),
      query: z.string().optional().describe('Search query (subject/body)'),
      from: z.string().optional().describe('Filter by sender'),
      folder: z.string().optional().describe('Folder to search in'),
      since: z.string().optional().describe('Emails since date (ISO 8601)'),
      limit: z.number().int().min(1).max(100).optional()
    },
    async ({ account_id, query, from: fromFilter, folder, since, limit }) => {
      try {
        const imap = await connectionPool.getImap(account_id);
        const emails = await imap.listEmails(folder || 'INBOX', {
          subject: query,
          from: fromFilter,
          since: since ? new Date(since) : undefined,
          limit: limit || 20
        });

        if (emails.length === 0) {
          return { content: [{ type: 'text', text: 'No matching emails found.' }] };
        }

        const list = emails.map(e =>
          `• ${e.from.address} — "${e.subject}" (${e.date.toISOString()}) [ID: ${e.id}]`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🔍 Search results (${emails.length}):\n\n${list}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'move_email',
    'Move an email to another folder',
    {
      account_id: z.string().uuid(),
      email_id: z.string(),
      from_folder: z.string(),
      to_folder: z.string()
    },
    async ({ account_id, email_id, from_folder, to_folder }) => {
      try {
        const imap = await connectionPool.getImap(account_id);
        await imap.moveEmail(parseInt(email_id, 10), from_folder, to_folder);
        return {
          content: [{ type: 'text', text: `✅ Email moved from ${from_folder} to ${to_folder}` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_email',
    'Delete an email',
    {
      account_id: z.string().uuid(),
      email_id: z.string(),
      folder: z.string().optional()
    },
    async ({ account_id, email_id, folder }) => {
      try {
        const imap = await connectionPool.getImap(account_id);
        await imap.deleteEmail(parseInt(email_id, 10), folder || 'INBOX');
        return {
          content: [{ type: 'text', text: `✅ Email deleted.` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );
}

```

##### 📄 `src/tools/persona-tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PersonaManager } from '../personas/persona-manager.js';
import { PersonaToneSchema, PersonaStyleSchema, ResponseTimeSchema } from '../core/types.js';

export function registerPersonaTools(
  server: McpServer,
  personaManager: PersonaManager
): void {

  server.tool(
    'create_persona',
    'Create a new AI persona for automated email handling',
    {
      account_id: z.string().uuid().describe('Account ID to associate with'),
      name: z.string().min(1).describe('Persona name'),
      description: z.string().optional().describe('Persona description'),
      tone: PersonaToneSchema.describe('Tone of voice'),
      style: PersonaStyleSchema.describe('Writing style'),
      language: z.string().default('en').describe('Language (en, fr, etc.)'),
      response_time: ResponseTimeSchema.default('within-hour').describe('Target response time')
    },
    async (args) => {
      try {
        const persona = personaManager.create({
          accountId: args.account_id,
          name: args.name,
          description: args.description || '',
          personality: {
            tone: args.tone,
            style: args.style,
            language: args.language,
            timezone: 'UTC'
          },
          behavior: {
            responseTime: args.response_time,
            autoReplyEnabled: false,
            priorityKeywords: []
          },
          capabilities: {
            canSend: true,
            canDelete: false,
            canArchive: true,
            canMove: true,
            canForward: true
          },
          active: true
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Persona created successfully!\n\nName: ${persona.name}\nID: ${persona.id}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create persona: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_personas',
    'List all personas for an account',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      try {
        const personas = personaManager.listByAccount(account_id);

        if (personas.length === 0) {
          return { content: [{ type: 'text', text: 'No personas found for this account.' }] };
        }

        const list = personas.map(p =>
          `• ${p.name} [${p.personality.tone}/${p.personality.style}] — ID: ${p.id}`
        ).join('\n');

        return {
          content: [{
            type: 'text',
            text: `🤖 Personas (${personas.length}):\n\n${list}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'update_persona',
    'Update an existing persona',
    {
      persona_id: z.string().uuid().describe('Persona ID'),
      name: z.string().optional(),
      description: z.string().optional(),
      active: z.boolean().optional()
    },
    async (args) => {
      try {
        const updates: any = {};
        if (args.name) updates.name = args.name;
        if (args.description) updates.description = args.description;
        if (args.active !== undefined) updates.active = args.active;

        const persona = personaManager.update(args.persona_id, updates);

        return {
          content: [{
            type: 'text',
            text: `✅ Persona updated successfully: ${persona.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Update failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_persona',
    'Delete a persona',
    {
      persona_id: z.string().uuid().describe('Persona ID')
    },
    async ({ persona_id }) => {
      try {
        personaManager.delete(persona_id);
        return {
          content: [{ type: 'text', text: `✅ Persona deleted.` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Delete failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );
}

```

##### 📄 `src/tools/task-tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskEngine } from '../tasks/task-engine.js';
import { TaskTypeSchema, TaskScheduleTypeSchema } from '../core/types.js';

export function registerTaskTools(
  server: McpServer,
  taskEngine: TaskEngine
): void {

  server.tool(
    'create_task',
    'Create a scheduled task',
    {
      account_id: z.string().uuid().describe('Account ID'),
      name: z.string().min(1).describe('Task name'),
      type: TaskTypeSchema.describe('Task type'),
      schedule_type: TaskScheduleTypeSchema.describe('cron/interval/immediate'),
      schedule_value: z.string().describe('Cron expression or seconds'),
      parameters: z.string().optional().describe('JSON parameters')
    },
    async (args) => {
      try {
        let params = {};
        if (args.parameters) {
          try { params = JSON.parse(args.parameters); } catch { /* ignore */ }
        }

        const task = taskEngine.create({
          accountId: args.account_id,
          name: args.name,
          description: '',
          type: args.type,
          schedule: {
            type: args.schedule_type,
            value: args.schedule_value,
            timezone: 'UTC'
          },
          parameters: params,
          status: 'active'
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Task created!\nID: ${task.id}\nName: ${task.name}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed to create task: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_tasks',
    'List all tasks',
    {
      account_id: z.string().uuid().describe('Account ID')
    },
    async ({ account_id }) => {
      const tasks = taskEngine.listByAccount(account_id);

      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks found.' }] };
      }

      const list = tasks.map(t =>
        `• ${t.name} (${t.type}) [${t.status}] — Last: ${t.lastRun || 'never'} — ID: ${t.id}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `📅 Tasks (${tasks.length}):\n\n${list}`
        }]
      };
    }
  );

  server.tool(
    'execute_task',
    'Manually execute a task immediately',
    {
      task_id: z.string().uuid().describe('Task ID')
    },
    async ({ task_id }) => {
      try {
        await taskEngine.execute(task_id);
        return { content: [{ type: 'text', text: '✅ Task executed successfully.' }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Execution failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'delete_task',
    'Delete a task',
    {
      task_id: z.string().uuid()
    },
    async ({ task_id }) => {
      taskEngine.delete(task_id);
      return { content: [{ type: 'text', text: '✅ Task deleted.' }] };
    }
  );
}

```

##### 📄 `src/tools/webhook-tools.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { WebhookManager } from '../webhooks/webhook-manager.js';
import { WebhookProviderSchema, WebhookActionTypeSchema, WebhookEventSchema } from '../core/types.js';

export function registerWebhookTools(
  server: McpServer,
  webhookManager: WebhookManager
): void {

  server.tool(
    'create_inbound_webhook',
    'Create an endpoint to receive external webhooks',
    {
      name: z.string().min(1).describe('Webhook name'),
      endpoint: z.string().min(1).describe('URL path (e.g. /my-hook)'),
      provider: WebhookProviderSchema.describe('Provider (gmail, custom, etc)'),
      action_type: WebhookActionTypeSchema.describe('Action to trigger'),
      account_id: z.string().uuid().optional().describe('Associated account ID')
    },
    async (args) => {
      try {
        const webhook = webhookManager.createInbound({
          name: args.name,
          description: '',
          endpoint: args.endpoint,
          provider: args.provider,
          accountId: args.account_id,
          active: true,
          actions: [{
            type: args.action_type,
            parameters: {}
          }]
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Inbound webhook created!\nID: ${webhook.id}\nEndpoint: ${webhook.endpoint}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'create_outbound_webhook',
    'Create a webhook to notify external systems',
    {
      name: z.string().min(1).describe('Webhook name'),
      url: z.string().url().describe('Target URL'),
      event: WebhookEventSchema.describe('Event to trigger on (e.g. email.received)'),
      secret_header_name: z.string().optional().default('X-Webhook-Secret')
    },
    async (args) => {
      try {
        const webhook = webhookManager.createOutbound({
          name: args.name,
          description: '',
          url: args.url,
          method: 'POST',
          events: [args.event],
          headers: {},
          payload: { format: 'json', maxPayloadSizeBytes: 1024 * 1024, includeRawEmail: false },
          retry: { enabled: true, maxAttempts: 3, backoffMs: 5000 },
          active: true
        });

        return {
          content: [{
            type: 'text',
            text: `✅ Outbound webhook created!\nID: ${webhook.id}\nTarget: ${webhook.url}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `❌ Failed: ${(error as Error).message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'list_webhooks',
    'List configured webhooks',
    {},
    async () => {
      const inbound = webhookManager.listInbound();
      const outbound = webhookManager.listOutbound();

      let text = `📡 Webhooks Configured:\n\n`;

      text += `📥 Inbound (${inbound.length}):\n`;
      text += inbound.map(w => `• ${w.name} (${w.endpoint}) [${w.triggerCount} triggers]`).join('\n') || 'None';

      text += `\n\n📤 Outbound (${outbound.length}):\n`;
      text += outbound.map(w => `• ${w.name} (${w.url}) [${w.successCount} ok / ${w.failureCount} fail]`).join('\n') || 'None';

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'webhook_logs',
    'View execution logs for a webhook',
    {
      webhook_id: z.string().uuid()
    },
    async ({ webhook_id }) => {
      const logs = webhookManager.getWebhookLogs(webhook_id, 10);
      
      if (logs.length === 0) {
        return { content: [{ type: 'text', text: 'No logs found.' }] };
      }

      const list = logs.map((l: any) => 
        `[${l.created_at}] ${l.status.toUpperCase()} (${l.response_status || '-'}) - ${l.duration_ms}ms${l.error_message ? '\nError: ' + l.error_message : ''}`
      ).join('\n');

      return { content: [{ type: 'text', text: `📝 Last 10 executions:\n\n${list}` }] };
    }
  );
}

```

#### 📁 utils

##### 📄 `src/utils/logger.ts`

```typescript
import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

export function createLogger(config?: {
  level?: string;
  file?: string;
}): pino.Logger {
  const level = config?.level || process.env.LOG_LEVEL || 'info';

  const targets: pino.TransportTargetOptions[] = [];

  // Always log to stderr (MCP uses stdout for protocol)
  if (process.env.NODE_ENV !== 'test') {
    targets.push({
      target: 'pino-pretty',
      options: {
        destination: 2, // stderr
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      },
      level
    });
  }

  // Optional file logging
  if (config?.file) {
    targets.push({
      target: 'pino/file',
      options: { destination: config.file },
      level
    });
  }

  if (targets.length === 0) {
    // Test mode: silent logger
    loggerInstance = pino({ level: 'silent' });
  } else {
    loggerInstance = pino({
      level,
      transport: { targets }
    });
  }

  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

```

#### 📁 webhooks

##### 📄 `src/webhooks/webhook-dispatcher.ts`

```typescript
import crypto from 'crypto';
import Handlebars from 'handlebars';
import { WebhookManager } from './webhook-manager.js';
import { EncryptionService } from '../security/encryption.js';
import { WebhookEvent, WebhookEventPayload, OutboundWebhook } from '../core/types.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class WebhookDispatcher {
  constructor(
    private webhookManager: WebhookManager,
    private encryption: EncryptionService
  ) {}

  async dispatch(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    const webhooks = this.webhookManager.getOutboundsByEvent(event);

    for (const webhook of webhooks) {
      try {
        await this.sendWebhook(webhook, event, data);
      } catch (error) {
        logger.error({
          webhookId: webhook.id,
          event,
          error
        }, 'Webhook dispatch failed');
      }
    }
  }

  private async sendWebhook(
    webhook: OutboundWebhook,
    event: WebhookEvent,
    data: Record<string, unknown>,
    attempt: number = 1
  ): Promise<void> {
    const startTime = Date.now();
    const payload: WebhookEventPayload = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      source: {
        accountId: (data.accountId as string) || '',
        accountEmail: (data.accountEmail as string) || '',
        personaId: data.personaId as string | undefined
      },
      data,
      metadata: {
        mcpVersion: '1.0.0',
        webhookId: webhook.id,
        attempt,
        maxAttempts: webhook.retry.maxAttempts
      }
    };

    let body: string;
    if (webhook.payload.template) {
      const template = Handlebars.compile(webhook.payload.template);
      body = template(payload);
    } else {
      body = JSON.stringify(payload);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MailingManager-MCP/1.0',
      'X-Webhook-Id': payload.id,
      'X-Webhook-Timestamp': payload.timestamp,
      ...webhook.headers
    };

    // Auth headers
    if (webhook.auth && webhook.auth.type !== 'none') {
      const authHeaders = await this.getAuthHeaders(webhook);
      Object.assign(headers, authHeaders);
    }

    // Sign payload
    const signature = this.encryption.signPayload(
      body,
      this.encryption.generateSecret() // Use webhook-specific secret in production
    );
    headers['X-Webhook-Signature'] = signature;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(webhook.url, {
        method: webhook.method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseBody.substring(0, 500)}`);
      }

      // Success
      this.webhookManager.updateOutboundStats(webhook.id, true);
      this.webhookManager.logWebhookExecution({
        webhookId: webhook.id,
        direction: 'outbound',
        event,
        status: 'success',
        requestPayload: body.substring(0, 10000),
        responseStatus: response.status,
        responseBody: responseBody.substring(0, 5000),
        durationMs: Date.now() - startTime,
        attempt
      });

      logger.info({
        webhookId: webhook.id,
        url: webhook.url,
        event
      }, 'Webhook dispatched');

      getEventBus().emit('webhook.dispatched', {
        webhookId: webhook.id,
        event
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.webhookManager.logWebhookExecution({
        webhookId: webhook.id,
        direction: 'outbound',
        event,
        status: 'failed',
        requestPayload: body.substring(0, 10000),
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
        attempt
      });

      // Retry
      if (webhook.retry.enabled && attempt < webhook.retry.maxAttempts) {
        const delayMs = webhook.retry.backoffMs * Math.pow(2, attempt - 1);
        logger.warn({
          webhookId: webhook.id,
          attempt: attempt + 1,
          delayMs
        }, 'Webhook retry scheduled');

        setTimeout(() => {
          this.sendWebhook(webhook, event, data, attempt + 1).catch(() => {});
        }, delayMs);
      } else {
        this.webhookManager.updateOutboundStats(webhook.id, false);
        logger.error({
          webhookId: webhook.id,
          error: errorMsg
        }, 'Webhook failed permanently');
      }
    }
  }

  private async getAuthHeaders(webhook: OutboundWebhook): Promise<Record<string, string>> {
    if (!webhook.auth) return {};

    // Get encrypted credentials from DB
    const row = this.webhookManager.getOutbound(webhook.id);
    if (!row?.auth) return {};

    // Note: credentials are decrypted from DB when needed
    // For now return empty; the credential decryption happens via webhook-manager
    return {};
  }
}

```

##### 📄 `src/webhooks/webhook-manager.ts`

```typescript
import crypto from 'crypto';
import { DatabaseManager } from '../storage/database.js';
import { EncryptionService } from '../security/encryption.js';
import { InboundWebhook, OutboundWebhook, EncryptedData } from '../core/types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export class WebhookManager {
  constructor(
    private db: DatabaseManager,
    private encryption: EncryptionService
  ) {}

  // ─── INBOUND ───

  createInbound(data: Omit<InboundWebhook, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): InboundWebhook {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const secret = this.encryption.generateSecret();
    const encryptedSecret = this.encryption.encrypt(secret);

    this.db.getDb().prepare(`
      INSERT INTO inbound_webhooks (id, name, description, endpoint, provider,
        account_id, secret_encrypted, active, actions, filters,
        trigger_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, data.name, data.description || '', data.endpoint, data.provider,
      data.accountId || null, JSON.stringify(encryptedSecret),
      data.active !== false ? 1 : 0,
      JSON.stringify(data.actions), data.filters ? JSON.stringify(data.filters) : null,
      now, now
    );

    logger.info({ id, name: data.name, endpoint: data.endpoint }, 'Inbound webhook created');
    return this.getInbound(id)!;
  }

  getInbound(id: string): InboundWebhook | null {
    const row = this.db.getDb().prepare('SELECT * FROM inbound_webhooks WHERE id = ?').get(id) as any;
    return row ? this.rowToInbound(row) : null;
  }

  getInboundByEndpoint(endpoint: string): InboundWebhook | null {
    const row = this.db.getDb().prepare('SELECT * FROM inbound_webhooks WHERE endpoint = ?').get(endpoint) as any;
    return row ? this.rowToInbound(row) : null;
  }

  listInbound(): InboundWebhook[] {
    const rows = this.db.getDb().prepare('SELECT * FROM inbound_webhooks ORDER BY name').all() as any[];
    return rows.map(r => this.rowToInbound(r));
  }

  getInboundSecret(id: string): string {
    const row = this.db.getDb().prepare(
      'SELECT secret_encrypted FROM inbound_webhooks WHERE id = ?'
    ).get(id) as { secret_encrypted: string } | undefined;

    if (!row) throw new Error(`Webhook ${id} not found`);
    const encrypted: EncryptedData = JSON.parse(row.secret_encrypted);
    return this.encryption.decrypt(encrypted);
  }

  deleteInbound(id: string): void {
    this.db.getDb().prepare('DELETE FROM inbound_webhooks WHERE id = ?').run(id);
    logger.info({ id }, 'Inbound webhook deleted');
  }

  updateInboundStats(id: string): void {
    const now = new Date().toISOString();
    this.db.getDb().prepare(`
      UPDATE inbound_webhooks SET trigger_count = trigger_count + 1, last_triggered = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
  }

  // ─── OUTBOUND ───

  createOutbound(data: Omit<OutboundWebhook, 'id' | 'createdAt' | 'updatedAt' | 'fireCount' | 'successCount' | 'failureCount'>): OutboundWebhook {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let encryptedCredentials: string | null = null;
    if (data.auth && data.auth.type !== 'none') {
      // Auth credentials should be passed via secure input, then encrypted
      encryptedCredentials = null; // Set later via updateOutboundAuth
    }

    this.db.getDb().prepare(`
      INSERT INTO outbound_webhooks (id, name, description, url, method,
        headers, auth_type, auth_credentials_encrypted,
        events, payload_config, retry_config,
        active, fire_count, success_count, failure_count,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)
    `).run(
      id, data.name, data.description || '', data.url, data.method || 'POST',
      JSON.stringify(data.headers || {}), data.auth?.type || null, encryptedCredentials,
      JSON.stringify(data.events), JSON.stringify(data.payload),
      JSON.stringify(data.retry),
      data.active !== false ? 1 : 0, now, now
    );

    logger.info({ id, name: data.name, url: data.url }, 'Outbound webhook created');
    return this.getOutbound(id)!;
  }

  getOutbound(id: string): OutboundWebhook | null {
    const row = this.db.getDb().prepare('SELECT * FROM outbound_webhooks WHERE id = ?').get(id) as any;
    return row ? this.rowToOutbound(row) : null;
  }

  listOutbound(): OutboundWebhook[] {
    const rows = this.db.getDb().prepare('SELECT * FROM outbound_webhooks ORDER BY name').all() as any[];
    return rows.map(r => this.rowToOutbound(r));
  }

  getOutboundsByEvent(event: string): OutboundWebhook[] {
    const all = this.listOutbound();
    return all.filter(w => w.active && w.events.includes(event as any));
  }

  deleteOutbound(id: string): void {
    this.db.getDb().prepare('DELETE FROM outbound_webhooks WHERE id = ?').run(id);
    logger.info({ id }, 'Outbound webhook deleted');
  }

  updateOutboundAuth(id: string, credentials: string): void {
    const encrypted = this.encryption.encrypt(credentials);
    const now = new Date().toISOString();
    this.db.getDb().prepare(`
      UPDATE outbound_webhooks SET auth_credentials_encrypted = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(encrypted), now, id);
  }

  updateOutboundStats(id: string, success: boolean): void {
    const now = new Date().toISOString();
    if (success) {
      this.db.getDb().prepare(`
        UPDATE outbound_webhooks SET fire_count = fire_count + 1, success_count = success_count + 1, last_fired = ?, updated_at = ? WHERE id = ?
      `).run(now, now, id);
    } else {
      this.db.getDb().prepare(`
        UPDATE outbound_webhooks SET fire_count = fire_count + 1, failure_count = failure_count + 1, updated_at = ? WHERE id = ?
      `).run(now, id);
    }
  }

  // ─── LOGS ───

  logWebhookExecution(log: {
    webhookId: string;
    direction: 'inbound' | 'outbound';
    event?: string;
    status: string;
    requestPayload?: string;
    responseStatus?: number;
    responseBody?: string;
    errorMessage?: string;
    durationMs?: number;
    attempt?: number;
  }): void {
    this.db.getDb().prepare(`
      INSERT INTO webhook_logs (id, webhook_id, direction, event, status,
        request_payload, response_status, response_body, error_message,
        duration_ms, attempt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(), log.webhookId, log.direction,
      log.event || null, log.status,
      log.requestPayload || null, log.responseStatus || null,
      log.responseBody || null, log.errorMessage || null,
      log.durationMs || null, log.attempt || 1,
      new Date().toISOString()
    );
  }

  getWebhookLogs(webhookId: string, limit: number = 50): any[] {
    return this.db.getDb().prepare(`
      SELECT * FROM webhook_logs WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(webhookId, limit);
  }

  private rowToInbound(row: any): InboundWebhook {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      endpoint: row.endpoint,
      provider: row.provider,
      accountId: row.account_id || undefined,
      active: !!row.active,
      actions: JSON.parse(row.actions),
      filters: row.filters ? JSON.parse(row.filters) : undefined,
      lastTriggered: row.last_triggered || undefined,
      triggerCount: row.trigger_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToOutbound(row: any): OutboundWebhook {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      url: row.url,
      method: row.method,
      headers: JSON.parse(row.headers),
      auth: row.auth_type ? { type: row.auth_type } : undefined,
      events: JSON.parse(row.events),
      payload: JSON.parse(row.payload_config),
      retry: JSON.parse(row.retry_config),
      active: !!row.active,
      lastFired: row.last_fired || undefined,
      fireCount: row.fire_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

```

##### 📄 `src/webhooks/webhook-server.ts`

```typescript
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import crypto from 'crypto';
import { WebhookManager } from './webhook-manager.js';
import { EncryptionService } from '../security/encryption.js';
import { AppConfig } from '../core/types.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../core/event-bus.js';

const logger = getLogger();

export class WebhookServer {
  private server: Server | null = null;
  private replayCache: Map<string, number> = new Map();
  private requestCounts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private config: AppConfig['webhooks'],
    private webhookManager: WebhookManager,
    private encryption: EncryptionService
  ) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        logger.info({
          host: this.config.host,
          port: this.config.port,
          basePath: this.config.basePath
        }, 'Webhook server started');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Rate limiting
      const clientIP = req.socket.remoteAddress || 'unknown';
      if (!this.checkRateLimit(clientIP)) {
        res.writeHead(429, { 'Retry-After': '60', 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests' }));
        return;
      }

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Signature, X-Webhook-Id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      // Only POST for webhooks
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Extract endpoint path
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const webhookPath = url.pathname.replace(this.config.basePath, '').replace(/^\/+/, '/');

      // Find matching webhook
      const webhook = this.webhookManager.getInboundByEndpoint(webhookPath);
      if (!webhook || !webhook.active) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Webhook not found' }));
        return;
      }

      // Read body
      const body = await this.readBody(req);

      // Signature validation
      if (this.config.security.signatureValidation) {
        const signature = req.headers[this.config.security.signatureHeader] as string;
        if (signature) {
          const secret = this.webhookManager.getInboundSecret(webhook.id);
          const isValid = this.encryption.verifySignature(
            body, signature, secret,
            this.config.security.signatureAlgorithm
          );
          if (!isValid) {
            logger.warn({ webhookId: webhook.id, requestId }, 'Invalid webhook signature');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
          }
        }
      }

      // IP whitelist
      if (this.config.security.ipWhitelist.length > 0) {
        if (!this.config.security.ipWhitelist.includes(clientIP)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
      }

      // Replay protection
      if (this.config.security.replayProtection) {
        const eventId = req.headers['x-webhook-id'] as string;
        if (eventId && this.isReplay(eventId)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'duplicate', requestId }));
          return;
        }
        if (eventId) {
          this.markProcessed(eventId);
        }
      }

      // Parse payload
      let payload: any;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { raw: body };
      }

      // Apply filters
      if (webhook.filters?.length) {
        const passes = this.applyFilters(payload, webhook.filters);
        if (!passes) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'filtered', requestId }));

          this.webhookManager.logWebhookExecution({
            webhookId: webhook.id,
            direction: 'inbound',
            status: 'filtered',
            requestPayload: body.substring(0, 10000),
            durationMs: Date.now() - startTime
          });
          return;
        }
      }

      // Accept immediately
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'accepted', requestId }));

      // Update stats
      this.webhookManager.updateInboundStats(webhook.id);

      // Log
      this.webhookManager.logWebhookExecution({
        webhookId: webhook.id,
        direction: 'inbound',
        status: 'success',
        requestPayload: body.substring(0, 10000),
        responseStatus: 200,
        durationMs: Date.now() - startTime
      });

      // Emit event for processing
      getEventBus().emit('webhook.received', {
        webhookId: webhook.id,
        requestId,
        payload
      });

    } catch (error) {
      logger.error({ requestId, error }, 'Webhook server error');
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', requestId }));
      }
    }
  }

  private applyFilters(payload: any, filters: any[]): boolean {
    for (const filter of filters) {
      const value = this.getNestedValue(payload, filter.field);
      if (value === undefined) return false;

      const stringValue = String(value);
      switch (filter.operator) {
        case 'equals':
          if (stringValue !== filter.value) return false;
          break;
        case 'contains':
          if (!stringValue.includes(filter.value)) return false;
          break;
        case 'not_contains':
          if (stringValue.includes(filter.value)) return false;
          break;
        default:
          break;
      }
    }
    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, key) => o?.[key], obj);
  }

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = this.requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      this.requestCounts.set(ip, {
        count: 1,
        resetAt: now + this.config.rateLimit.windowMs
      });
      return true;
    }

    entry.count++;
    return entry.count <= this.config.rateLimit.maxRequests;
  }

  private isReplay(eventId: string): boolean {
    return this.replayCache.has(eventId);
  }

  private markProcessed(eventId: string): void {
    this.replayCache.set(eventId, Date.now());
    // Cleanup old entries
    const cutoff = Date.now() - (this.config.security.replayWindowSeconds * 1000);
    for (const [id, timestamp] of this.replayCache) {
      if (timestamp < cutoff) this.replayCache.delete(id);
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) {
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

  getActiveCount(): number {
    return this.webhookManager.listInbound().filter(w => w.active).length;
  }
}

```

##### 📁 providers


---

**📄 Partie 2/2** - Fin de la documentation
