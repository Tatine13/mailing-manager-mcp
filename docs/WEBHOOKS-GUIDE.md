# 🔗 Guide Complet des Webhooks — Mailing Manager MCP

## 📋 Table des Matières
1. [Comprendre les Webhooks](#comprendre-les-webhooks)
2. [Les Deux Types de Webhooks](#les-deux-types-de-webhooks)
3. [Options de Déploiement](#options-de-déploiement)
4. [Configuration Étape par Étape](#configuration-étape-par-étape)
5. [Exemples Pratiques](#exemples-pratiques)
6. [Intégrations Populaires](#intégrations-populaires)
7. [Sécurité](#sécurité)

---

## 🎯 Comprendre les Webhooks

### Qu'est-ce qu'un Webhook ?

Un webhook est un **point d'entrée HTTP** qui permet à deux applications de communiquer en temps réel. C'est comme une "notification push" entre services.

```
┌─────────────┐                ┌─────────────┐
│   Email     │  Nouvel Email  │   Webhook   │
│   Server    │────────────────▶│   Endpoint  │
│   (IMAP)    │                │   (n8n)     │
└─────────────┘                └─────────────┘
```

### Dans Mailing Manager MCP

Votre serveur MCP peut :
- ✅ **RECEVOIR** des webhooks (Inbound) = autres services vous envoient des données
- ✅ **ENVOYER** des webhooks (Outbound) = vous notifiez d'autres services

---

## 🔄 Les Deux Types de Webhooks

### 1️⃣ **Webhooks INBOUND** (Recevoir)

**Votre serveur MCP reçoit des requêtes HTTP** d'autres services.

**Exemples d'usage** :
- Un formulaire sur votre site web déclenche l'envoi d'un email
- n8n vous envoie une commande pour traiter un email
- Zapier déclenche une tâche automatisée
- Un CRM crée un ticket et vous notifie par webhook

**Comment ça marche** :
```
Service Externe  ──HTTP POST──▶  Mailing Manager MCP
   (n8n)                         (port 3100 par défaut)
                                  
Reçoit: { "action": "send_email", "to": "user@example.com" }
Exécute: Envoie l'email via le compte configuré
```

**Configuration** :
```json
{
  "type": "inbound",
  "name": "n8n-trigger",
  "path": "/automation/send-email",
  "secret": "votre-secret-securise",
  "actions": [
    {
      "type": "send_email",
      "accountId": "votre-compte-id"
    }
  ]
}
```

**URL résultante** :
```
http://votre-serveur:3100/webhook/[webhook-id]
```

### 2️⃣ **Webhooks OUTBOUND** (Envoyer)

**Votre serveur MCP envoie des notifications** vers d'autres services.

**Exemples d'usage** :
- Notifier n8n quand un email important arrive
- Envoyer des stats vers un dashboard
- Alerter Slack quand un email urgent arrive
- Synchroniser avec un CRM quand un email est envoyé

**Comment ça marche** :
```
Email reçu  ──▶  Mailing Manager MCP  ──HTTP POST──▶  n8n
                 (détecte l'événement)                (webhook URL)
                                  
Envoie: { "event": "email.received", "from": "boss@company.com", ... }
```

**Configuration** :
```json
{
  "type": "outbound",
  "name": "notify-n8n",
  "url": "https://votre-n8n.com/webhook/email-received",
  "events": ["email.received", "email.sent"],
  "secret": "secret-partagé-avec-n8n",
  "filters": {
    "from": "boss@company.com"  // Seulement les emails du patron
  }
}
```

---

## 🌐 Options de Déploiement

### Option 1 : **Localhost (Développement uniquement)** 🏠

**Quand utiliser** : Tests locaux sur votre machine

**Comment** :
```bash
# Dans votre config ~/.mailing-manager/config.json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "http://localhost:3100"
  }
}

# Démarrer le serveur
mailing-manager server
```

**URL webhook** : `http://localhost:3100/webhook/[id]`

**❌ Limitations** :
- N'est accessible que depuis votre machine
- Impossible de recevoir des webhooks d'internet
- OK pour tester, pas pour la production

---

### Option 2 : **Tunnel Public (Gratuit, Simple)** 🌉

**Services gratuits de tunnel** :

#### **A. ngrok (Recommandé)** ⭐

```bash
# 1. Installer ngrok
npm install -g ngrok

# 2. Démarrer le tunnel
ngrok http 3100

# Résultat:
# Forwarding  https://abc123.ngrok.io -> http://localhost:3100
```

**Configuration** :
```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "https://abc123.ngrok.io"
  }
}
```

**URL webhook** : `https://abc123.ngrok.io/webhook/[id]`

**✅ Avantages** :
- 100% gratuit (plan free)
- Installation en 30 secondes
- HTTPS automatique
- Interface web pour voir les requêtes

**❌ Inconvénients** :
- URL change à chaque redémarrage (sauf plan payant)
- Session limitée à 8h (gratuit)

#### **B. Cloudflare Tunnel (Gratuit, URL fixe)** ⭐⭐

```bash
# 1. Installer cloudflared
brew install cloudflare/cloudflare/cloudflared  # macOS
# ou télécharger depuis cloudflare.com

# 2. Login
cloudflared tunnel login

# 3. Créer un tunnel
cloudflared tunnel create mailing-manager

# 4. Configurer
cat > ~/.cloudflared/config.yml <<EOF
tunnel: [TUNNEL-ID]
credentials-file: /path/to/credentials.json

ingress:
  - hostname: webhooks.votredomaine.com
    service: http://localhost:3100
  - service: http_status:404
EOF

# 5. Créer le DNS record
cloudflared tunnel route dns mailing-manager webhooks.votredomaine.com

# 6. Démarrer
cloudflared tunnel run mailing-manager
```

**✅ Avantages** :
- **Complètement gratuit**
- **URL fixe** qui ne change jamais
- HTTPS automatique
- Pas de limite de temps
- Production-ready

**❌ Inconvénients** :
- Configuration plus complexe
- Nécessite un domaine (peut être gratuit avec Freenom)

#### **C. LocalTunnel (Simple, Gratuit)** 

```bash
# 1. Installer
npm install -g localtunnel

# 2. Démarrer
lt --port 3100 --subdomain mailing-manager

# URL: https://mailing-manager.loca.lt
```

**✅ Avantages** :
- Très simple
- Gratuit
- URL personnalisable

**❌ Inconvénients** :
- Moins fiable que ngrok
- Page d'avertissement pour les visiteurs

---

### Option 3 : **Serveur Cloud (Production)** ☁️

#### **A. VPS Gratuit — Oracle Cloud** 💰 GRATUIT

Oracle Cloud offre **GRATUITEMENT** :
- 2 instances VM (ARM)
- 1 GB RAM chacune
- 200 GB de stockage
- Trafic illimité
- **À VIE (Free Tier permanent)**

**Configuration** :
```bash
# 1. Créer une VM sur Oracle Cloud
# 2. SSH vers la VM
ssh ubuntu@votre-ip-publique

# 3. Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Installer votre serveur
npm install -g @mailing-ai/mcp-manager

# 5. Configurer
mkdir -p ~/.mailing-manager
# Copier votre config

# 6. Démarrer avec PM2 (process manager)
npm install -g pm2
pm2 start mailing-manager --name "mcp-server" -- server
pm2 save
pm2 startup  # Auto-start au redémarrage

# 7. Configurer le firewall
sudo ufw allow 3100/tcp
```

**Configuration webhook** :
```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "http://votre-ip-publique:3100"
  }
}
```

**✅ Avantages** :
- **Gratuit à vie**
- IP publique fixe
- Contrôle total
- Production-ready

**❌ Inconvénients** :
- Configuration système nécessaire
- Gestion de la sécurité (firewall, updates)

#### **B. Autres Options VPS Gratuites/Pas Chères**

| Service | Prix | Ressources |
|---------|------|------------|
| **Oracle Cloud** | GRATUIT | 1-2 GB RAM, ARM |
| **Google Cloud** | $300 crédit (90j) | Au choix |
| **AWS Free Tier** | GRATUIT (12 mois) | t2.micro |
| **Azure** | $200 crédit | B1S |
| **Railway** | $5/mois | 512MB RAM |
| **Fly.io** | Gratuit (limité) | Shared CPU |

---

### Option 4 : **Derrière un Reverse Proxy (Production)** 🔒

Si vous avez déjà un serveur avec Nginx :

```nginx
# /etc/nginx/sites-available/webhooks
server {
    listen 80;
    server_name webhooks.votredomaine.com;

    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Puis avec certbot pour HTTPS gratuit :
```bash
sudo certbot --nginx -d webhooks.votredomaine.com
```

---

## 🛠️ Configuration Étape par Étape

### Scénario 1 : **Utiliser avec n8n (Recommandé)** 

#### Setup n8n

**Option A : n8n Cloud (Gratuit jusqu'à 5000 exécutions/mois)**
- Aller sur [n8n.cloud](https://n8n.cloud)
- Créer un compte gratuit
- C'est prêt ! Vous avez une URL permanente

**Option B : n8n Self-hosted (Gratuit, illimité)**
```bash
# Avec Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Accès: http://localhost:5678
```

#### Webhook INBOUND : n8n → Mailing Manager

**Dans n8n** :
1. Créer un workflow
2. Ajouter node "HTTP Request"
3. Configuration :
   ```
   Method: POST
   URL: https://votre-tunnel.ngrok.io/webhook/[webhook-id]
   Headers:
     X-Webhook-Secret: votre-secret
   Body: { "action": "send_email", "to": "dest@example.com", "subject": "Test" }
   ```

**Dans Mailing Manager** :
```typescript
// Via le tool MCP
{
  "tool": "create_inbound_webhook",
  "arguments": {
    "name": "n8n-automation",
    "description": "Receive commands from n8n",
    "secret": "votre-secret-identique",
    "actions": [
      {
        "type": "send_email",
        "parameters": {
          "accountId": "{{body.accountId}}",
          "to": "{{body.to}}",
          "subject": "{{body.subject}}",
          "body": "{{body.message}}"
        }
      }
    ]
  }
}
```

#### Webhook OUTBOUND : Mailing Manager → n8n

**Dans n8n** :
1. Créer un workflow
2. Ajouter node "Webhook"
3. Copier l'URL du webhook (ex: `https://votre-n8n.cloud/webhook/abc123`)

**Dans Mailing Manager** :
```typescript
{
  "tool": "create_outbound_webhook",
  "arguments": {
    "name": "notify-n8n-new-email",
    "url": "https://votre-n8n.cloud/webhook/abc123",
    "events": ["email.received"],
    "secret": "secret-partagé",
    "filters": {
      "folder": "INBOX",
      "from": "important@company.com"
    }
  }
}
```

**Dans n8n (traitement)** :
```
Webhook Received → If node (check conditions) → Multiple branches:
  ├─ Send to Slack
  ├─ Create Notion page
  ├─ Add to Airtable
  └─ Send SMS via Twilio
```

---

### Scénario 2 : **Zapier (No-code, Simple)** 

#### Webhook INBOUND : Zapier → Mailing Manager

**Dans Zapier** :
1. Créer un Zap
2. Trigger : N'importe quoi (Google Form, Typeform, etc.)
3. Action : "Webhooks by Zapier" → POST
4. URL : `https://votre-tunnel.ngrok.io/webhook/[id]`
5. Headers : `X-Webhook-Secret: votre-secret`
6. Body : 
   ```json
   {
     "action": "send_email",
     "to": "{{trigger.email}}",
     "subject": "Merci !",
     "body": "Email automatique"
   }
   ```

#### Webhook OUTBOUND : Mailing Manager → Zapier

**Dans Zapier** :
1. Créer un Zap
2. Trigger : "Webhooks by Zapier" → Catch Hook
3. Copier l'URL fournie

**Dans Mailing Manager** :
```typescript
{
  "tool": "create_outbound_webhook",
  "arguments": {
    "name": "notify-zapier",
    "url": "https://hooks.zapier.com/hooks/catch/123456/abc123/",
    "events": ["email.received", "email.sent"]
  }
}
```

---

### Scénario 3 : **Make.com (ex-Integromat)** 

Même principe que Zapier mais avec Make.com. Make offre un plan gratuit généreux (1000 opérations/mois).

---

### Scénario 4 : **Webhooks Custom (API personnalisée)** 

Si vous développez votre propre API :

**Recevoir des webhooks de Mailing Manager** :

```javascript
// Votre API Express
const express = require('express');
const crypto = require('crypto');
const app = express();

app.post('/mailing-webhook', express.json(), (req, res) => {
  // 1. Vérifier la signature
  const signature = req.headers['x-webhook-signature'];
  const secret = 'votre-secret-partagé';
  const payload = JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // 2. Traiter l'événement
  const { event, data } = req.body;
  
  if (event === 'email.received') {
    console.log('Nouvel email reçu:', data.subject);
    // Faire quelque chose (enregistrer en DB, notifier, etc.)
  }
  
  res.json({ success: true });
});

app.listen(8080);
```

---

## 💡 Exemples Pratiques

### Exemple 1 : **Auto-réponse intelligente** 

**Workflow** :
```
Email reçu (urgent)
  ↓ (webhook outbound)
n8n reçoit la notification
  ↓
n8n analyse avec GPT-4
  ↓
n8n génère une réponse
  ↓ (webhook inbound)
Mailing Manager envoie la réponse
```

**Configuration n8n** :
1. **Webhook** : Reçoit l'email de Mailing Manager
2. **Filter** : Si le sujet contient "urgent"
3. **OpenAI** : Génère une réponse appropriée
4. **HTTP Request** : Renvoie à Mailing Manager pour envoi

---

### Exemple 2 : **Dashboard en temps réel**

**Workflow** :
```
Chaque email envoyé/reçu
  ↓ (webhook outbound)
Serveur de dashboard
  ↓
Met à jour les statistiques en temps réel
  ↓
Dashboard web affiche les métriques
```

---

### Exemple 3 : **CRM Sync**

**Workflow** :
```
Email important du client
  ↓ (webhook outbound)
n8n
  ↓
Airtable/Notion : Crée une entrée
  ↓
Slack : Notifie l'équipe commerciale
```

---

## 🔐 Sécurité

### 1. **Secrets de Webhook**

**TOUJOURS** utiliser un secret fort :

```bash
# Générer un secret sécurisé
openssl rand -hex 32
# Résultat: a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0
```

### 2. **Vérification de Signature**

Mailing Manager signe automatiquement tous les webhooks sortants :

```javascript
// Vérification côté récepteur
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return signature === expectedSignature;
}
```

### 3. **HTTPS Obligatoire en Production**

❌ **Jamais ça** :
```json
{
  "url": "http://unsecured-site.com/webhook"
}
```

✅ **Toujours ça** :
```json
{
  "url": "https://secured-site.com/webhook"
}
```

### 4. **Filtrage IP (Optionnel mais recommandé)**

Si vous connaissez l'IP source :

```nginx
# Nginx
location /webhook {
    allow 203.0.113.0/24;  # IP de n8n
    deny all;
    
    proxy_pass http://localhost:3100;
}
```

### 5. **Rate Limiting**

Le serveur MCP inclut déjà un rate limiting par défaut (100 req/min par IP).

---

## 🎓 Quelle Option Choisir ?

### Pour débuter / Tester (5 minutes) :
**→ ngrok** (localhost + tunnel)
```bash
ngrok http 3100
```

### Pour usage personnel / Hobby (Gratuit, permanent) :
**→ Cloudflare Tunnel** + domaine gratuit
```bash
cloudflared tunnel
```

### Pour production / Business (Gratuit) :
**→ Oracle Cloud VPS** + Nginx + Certbot
```bash
Instance gratuite Oracle + SSL gratuit
```

### Pour no-code / Simplicité :
**→ n8n Cloud** (gratuit jusqu'à 5000 exec/mois)
```
Hébergé, géré, prêt à l'emploi
```

---

## 🚀 Quick Start Recommandé

**Pour commencer MAINTENANT (en 5 minutes)** :

```bash
# 1. Installer ngrok
npm install -g ngrok

# 2. Configurer Mailing Manager
cat > ~/.mailing-manager/config.json <<EOF
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "http://localhost:3100"
  }
}
EOF

# 3. Démarrer le serveur
mailing-manager server &

# 4. Démarrer ngrok dans un autre terminal
ngrok http 3100

# 5. Copier l'URL ngrok (ex: https://abc123.ngrok.io)
# 6. Mettre à jour config.json avec cette URL
# 7. Redémarrer le serveur

# 8. Créer votre premier webhook inbound
# Via Claude Desktop / Cursor avec l'outil MCP

# 9. Tester
curl -X POST https://abc123.ngrok.io/webhook/[id] \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: votre-secret" \
  -d '{"test": "data"}'
```

---

## 📊 Comparatif Final

| Solution | Prix | Difficulté | URL Fixe | Production |
|----------|------|-----------|----------|------------|
| **Localhost** | Gratuit | ⭐ | ❌ | ❌ |
| **ngrok** | Gratuit | ⭐ | ❌ | ⚠️ |
| **Cloudflare Tunnel** | Gratuit | ⭐⭐ | ✅ | ✅ |
| **LocalTunnel** | Gratuit | ⭐ | ⚠️ | ❌ |
| **Oracle Cloud** | Gratuit | ⭐⭐⭐ | ✅ | ✅ |
| **VPS Payant** | $5-10/mois | ⭐⭐⭐ | ✅ | ✅ |

---

## ❓ FAQ

**Q: Puis-je utiliser les webhooks sans exposer mon serveur sur internet ?**  
R: Oui ! Les webhooks OUTBOUND fonctionnent même sans serveur public. Seuls les INBOUND nécessitent une URL accessible.

**Q: ngrok est-il sécurisé ?**  
R: Oui, le trafic est chiffré. Mais pour la production, préférez votre propre serveur ou Cloudflare Tunnel.

**Q: Combien coûte n8n Cloud ?**  
R: Plan gratuit : 5000 exécutions/mois. Au-delà : $20/mois.

**Q: Puis-je changer l'URL de mon webhook ?**  
R: Oui, mettez à jour la config et redémarrez le serveur. Les webhooks créés continueront de fonctionner.

**Q: Les webhooks fonctionnent-ils avec Claude Desktop ?**  
R: Oui ! Claude Desktop communique avec le serveur MCP qui gère les webhooks en parallèle.

---

## 🎯 Conclusion

**Recommandation finale** :

1. **Débutants** : ngrok (5 min setup)
2. **Avancés** : Cloudflare Tunnel (gratuit, permanent)
3. **Production** : Oracle Cloud VPS (gratuit à vie)
4. **No-code** : n8n Cloud (simple, puissant)

Vous avez maintenant tout pour mettre en place des webhooks puissants et gratuits ! 🚀
