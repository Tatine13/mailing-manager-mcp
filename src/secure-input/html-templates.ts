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
        .map(o => {
          const selected = field.value === o.value ? 'selected' : '';
          return `<option value="${escapeHtml(o.value)}" ${selected}>${escapeHtml(o.label)}</option>`;
        })
        .join('');
      return `
        <div class="field">
          <label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
          <select id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}"
                  ${field.required ? 'required' : ''} ${field.readOnly ? 'disabled' : ''}>
            <option value="">-- Select --</option>
            ${optionsHtml}
          </select>
          ${field.readOnly ? `<input type="hidden" name="${escapeHtml(field.name)}" value="${escapeHtml(field.value || '')}">` : ''}
        </div>`;
    }
    const attrs: string[] = [];
    if (field.required) attrs.push('required');
    if (field.readOnly) attrs.push('readonly');
    if (field.value) attrs.push(`value="${escapeHtml(field.value)}"`);
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
               ${attrs.join(' ')}
               style="${field.readOnly ? 'background: rgba(255,255,255,0.05); color: #888; cursor: not-allowed;' : ''}" />
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
        placeholder: '••••••••'
      }]
    : request.fields || [];

  const fieldsHtml = buildFieldsHtml(fields);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(request.title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    :root {
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --border: rgba(255, 255, 255, 0.1);
      --success: #10b981;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      background: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.15) 0px, transparent 50%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-x: hidden;
    }

    .container {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 40px;
      max-width: 450px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .header { text-align: center; margin-bottom: 32px; }
    
    .icon-wrapper {
      width: 64px;
      height: 64px;
      background: rgba(99, 102, 241, 0.1);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      color: var(--primary);
      font-size: 28px;
      border: 1px solid rgba(99, 102, 241, 0.2);
    }

    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-muted); font-size: 0.9rem; }

    .security-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 32px;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .field { margin-bottom: 24px; }
    label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; color: var(--text-muted); }
    
    input, select {
      width: 100%;
      padding: 14px 16px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: #fff;
      font-size: 1rem;
      transition: all 0.3s;
      outline: none;
    }

    input:focus, select:focus {
      border-color: var(--primary);
      background: rgba(15, 23, 42, 0.8);
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
    }

    .actions { display: flex; flex-direction: column; gap: 12px; margin-top: 32px; }
    
    button {
      width: 100%;
      padding: 14px;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .btn-primary {
      background: var(--primary);
      color: white;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    .btn-primary:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
    }

    .btn-primary:active { transform: translateY(0); }
    
    .btn-primary:disabled {
      background: #334155;
      color: var(--text-muted);
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }

    .footer-note {
      text-align: center;
      margin-top: 24px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .error-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #f87171;
      padding: 12px;
      border-radius: 12px;
      font-size: 0.85rem;
      margin-top: 20px;
      display: none;
      text-align: center;
    }

    /* Success State */
    .success-state { text-align: center; padding: 20px 0; }
    .success-icon {
      font-size: 48px;
      color: var(--success);
      margin-bottom: 20px;
      animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
  </style>
</head>
<body>
  <div class="container" id="mainContainer">
    <div class="header">
      <div class="icon-wrapper">
        <i class="fas fa-shield-halved"></i>
      </div>
      <h1>${escapeHtml(request.title)}</h1>
      <p class="subtitle">Secure session &bull; Mailing Manager</p>
    </div>

    <div class="security-status">
      <i class="fas fa-lock"></i>
      <span>End-to-end encrypted connection</span>
    </div>

    <form id="secureForm" novalidate>
      ${fieldsHtml}
      <div class="actions">
        <button type="submit" class="btn-primary" id="submitBtn">
          <span>Authorize Access</span>
        </button>
      </div>
      <div class="error-box" id="errorBox"></div>
    </form>

    <div class="footer-note">
      This link will expire automatically.
    </div>
  </div>

<script>
(function(){
  var SERVER_PUB = '${serverPublicKey}';
  var CSRF = '${csrf}';
  var SUBMIT_URL = '/submit/${token}';

  console.log('🔐 Secure Handshake Initialized');

  function b64ToAB(b64){
    var bin=atob(b64);
    var bytes=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    return bytes.buffer;
  }
  
  function abToB64(buf){
    var bytes=new Uint8Array(buf);
    var bin='';
    for(var i=0;i<bytes.byteLength;i++) bin+=String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function encryptAndSubmit(formData){
    console.log('📦 Encrypting data...', Object.keys(formData));
    var btn=document.getElementById('submitBtn');
    var errBox=document.getElementById('errorBox');
    var container=document.getElementById('mainContainer');
    
    btn.disabled=true;
    var originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Chiffrage...';
    errBox.style.display='none';

    try {
      // 1. Generate ephemeral client key
      var kp = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
      
      // 2. Import server public key
      var serverKey = await crypto.subtle.importKey('raw', b64ToAB(SERVER_PUB), {name:'ECDH',namedCurve:'P-256'}, false, []);
      
      // 3. Derive shared secret
      var shared = await crypto.subtle.deriveBits({name:'ECDH',public:serverKey}, kp.privateKey, 256);
      
      // 4. Create AES key from secret
      var aesKeyBuf = await crypto.subtle.digest('SHA-256', shared);
      var aesKey = await crypto.subtle.importKey('raw', aesKeyBuf, {name:'AES-GCM'}, false, ['encrypt']);
      
      // 5. Encrypt
      var iv = crypto.getRandomValues(new Uint8Array(12));
      var plain = new TextEncoder().encode(JSON.stringify(formData));
      var ct = await crypto.subtle.encrypt({name:'AES-GCM', iv:iv, tagLength:128}, aesKey, plain);
      
      var ctBytes = new Uint8Array(ct);
      var encrypted = ctBytes.slice(0, ctBytes.length - 16);
      var tag = ctBytes.slice(ctBytes.length - 16);
      var clientPub = await crypto.subtle.exportKey('raw', kp.publicKey);
      
      console.log('🚀 Sending payload to server...');
      
      var resp = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csrf: CSRF,
          encrypted: abToB64(encrypted.buffer),
          clientPublicKey: abToB64(clientPub),
          iv: abToB64(iv.buffer),
          tag: abToB64(tag.buffer)
        })
      });

      if (resp.ok) {
        console.log('✅ Handshake Successful');
        container.innerHTML = '<div class="success-state"><div class="success-icon"><i class="fas fa-check-circle"></i></div><h1>Accès Autorisé</h1><p class="subtitle">Vos identifiants ont été transmis en toute sécurité.</p><p class="footer-note" style="margin-top:20px">Cette fenêtre va se fermer.</p></div>';
        setTimeout(function(){ window.close(); }, 3000);
      } else {
        var errorData = await resp.json().catch(function(){ return {error: 'Server Error ' + resp.status}; });
        throw new Error(errorData.error || 'Submission failed');
      }
    } catch(e) {
      console.error('❌ Error:', e);
      errBox.textContent = 'Erreur: ' + e.message;
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }

  document.getElementById('secureForm').addEventListener('submit', function(e){
    e.preventDefault();
    console.log('Submit triggered');
    var fd = {};
    var form = e.target;
    
    // Explicitly grab known fields to avoid any loop issues
    var inputs = form.querySelectorAll('input, select');
    for(var i=0; i<inputs.length; i++) {
      var input = inputs[i];
      if (input.name) {
        if (input.required && !input.value) {
          input.style.borderColor = '#ef4444';
          input.focus();
          return;
        }
        fd[input.name] = input.value;
      }
    }
    
    encryptAndSubmit(fd);
  });

  var first = document.querySelector('input:not([readonly]), select:not([disabled])');
  if(first) first.focus();
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
