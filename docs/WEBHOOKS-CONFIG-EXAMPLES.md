# 🔧 Configurations Webhooks Prêtes à l'Emploi

## 📋 Fichier de Configuration Principal

**~/.mailing-manager/config.json**

### Configuration de Base (Localhost - Développement)
```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "http://localhost:3100",
    "secret": "changez-moi-par-un-secret-fort",
    "timeout": 5000,
    "maxRetries": 3
  },
  "tasks": {
    "schedulerEnabled": true,
    "maxConcurrent": 5
  },
  "email": {
    "connectionTimeout": 30000,
    "maxConnections": 10
  }
}
```

### Configuration avec ngrok (Tunnel Public)
```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "https://abc123.ngrok.io",
    "secret": "a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4",
    "timeout": 10000,
    "maxRetries": 3,
    "retryDelay": 1000
  },
  "tasks": {
    "schedulerEnabled": true,
    "maxConcurrent": 10
  },
  "email": {
    "connectionTimeout": 30000,
    "maxConnections": 20
  },
  "logging": {
    "level": "info",
    "file": true
  }
}
```

### Configuration Production (VPS)
```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "https://webhooks.votredomaine.com",
    "secret": "utilisez-openssl-rand-hex-32-pour-generer",
    "timeout": 15000,
    "maxRetries": 5,
    "retryDelay": 2000,
    "enableCors": false,
    "trustedIps": [
      "203.0.113.0/24"
    ]
  },
  "tasks": {
    "schedulerEnabled": true,
    "maxConcurrent": 20
  },
  "email": {
    "connectionTimeout": 45000,
    "maxConnections": 50,
    "enablePooling": true
  },
  "security": {
    "rateLimiting": {
      "enabled": true,
      "maxRequests": 100,
      "windowMs": 60000
    },
    "encryption": {
      "algorithm": "aes-256-gcm"
    }
  },
  "logging": {
    "level": "warn",
    "file": true,
    "maxSize": "100m",
    "maxFiles": 10
  }
}
```

---

## 🔗 Exemples de Webhooks INBOUND

### 1. Webhook pour n8n - Envoi d'Email Simple
```json
{
  "type": "inbound",
  "name": "n8n-send-email",
  "description": "Permet à n8n de déclencher l'envoi d'emails",
  "path": "/automation/send-email",
  "secret": "secret-partage-avec-n8n",
  "actions": [
    {
      "type": "send_email",
      "parameters": {
        "accountId": "{{body.accountId}}",
        "to": "{{body.to}}",
        "cc": "{{body.cc}}",
        "subject": "{{body.subject}}",
        "body": "{{body.message}}",
        "html": "{{body.html}}"
      }
    }
  ],
  "validation": {
    "requiredFields": ["accountId", "to", "subject"]
  }
}
```

**Utilisation depuis n8n (HTTP Request node)** :
```http
POST https://votre-url.ngrok.io/webhook/[webhook-id]
Content-Type: application/json
X-Webhook-Secret: secret-partage-avec-n8n

{
  "accountId": "123e4567-e89b-12d3-a456-426614174000",
  "to": "destinataire@example.com",
  "subject": "Email automatique depuis n8n",
  "message": "Ceci est un message automatisé",
  "html": "<h1>Message HTML</h1><p>Avec du formatage</p>"
}
```

---

### 2. Webhook Multi-Actions - Workflow Complexe
```json
{
  "type": "inbound",
  "name": "n8n-complex-workflow",
  "description": "Cherche, filtre et traite des emails",
  "path": "/automation/process-emails",
  "secret": "autre-secret-fort",
  "actions": [
    {
      "type": "search",
      "parameters": {
        "accountId": "{{body.accountId}}",
        "folder": "INBOX",
        "from": "{{body.searchFrom}}",
        "since": "{{body.since}}"
      }
    },
    {
      "type": "move",
      "parameters": {
        "destination": "{{body.targetFolder}}",
        "emailIds": "{{previous.results}}"
      },
      "condition": {
        "if": "{{previous.count}} > 0"
      }
    },
    {
      "type": "send_email",
      "parameters": {
        "accountId": "{{body.accountId}}",
        "to": "{{body.notifyEmail}}",
        "subject": "Traitement terminé",
        "body": "{{previous.count}} emails ont été déplacés"
      }
    }
  ]
}
```

---

### 3. Webhook pour Zapier - Formulaire Web
```json
{
  "type": "inbound",
  "name": "zapier-contact-form",
  "description": "Traite les soumissions de formulaire de contact",
  "path": "/zapier/contact",
  "secret": "zapier-webhook-secret",
  "actions": [
    {
      "type": "send_email",
      "parameters": {
        "accountId": "votre-compte-support",
        "to": "support@votreentreprise.com",
        "subject": "Nouveau contact : {{body.name}}",
        "body": "Nom: {{body.name}}\nEmail: {{body.email}}\nMessage: {{body.message}}"
      }
    },
    {
      "type": "send_email",
      "parameters": {
        "accountId": "votre-compte-noreply",
        "to": "{{body.email}}",
        "subject": "Merci pour votre message",
        "html": "<h2>Merci {{body.name}} !</h2><p>Nous avons bien reçu votre message et vous répondrons sous 24h.</p>"
      }
    }
  ]
}
```

---

### 4. Webhook Trigger de Tâche
```json
{
  "type": "inbound",
  "name": "trigger-cleanup-task",
  "description": "Déclenche une tâche de nettoyage",
  "path": "/trigger/cleanup",
  "secret": "task-trigger-secret",
  "actions": [
    {
      "type": "trigger_task",
      "parameters": {
        "taskId": "{{body.taskId}}"
      }
    }
  ]
}
```

---

## 📤 Exemples de Webhooks OUTBOUND

### 1. Notification n8n - Emails Importants
```json
{
  "type": "outbound",
  "name": "notify-important-emails",
  "description": "Notifie n8n des emails importants",
  "url": "https://votre-instance-n8n.com/webhook/email-received",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer votre-token-api"
  },
  "events": ["email.received"],
  "secret": "secret-partage-avec-n8n",
  "filters": {
    "from": ["boss@company.com", "client@important.com"],
    "folder": "INBOX",
    "hasAttachment": true
  },
  "retries": {
    "maxAttempts": 5,
    "backoff": "exponential",
    "initialDelay": 1000
  }
}
```

**Payload envoyé** :
```json
{
  "event": "email.received",
  "timestamp": "2025-01-15T10:30:00Z",
  "webhookId": "webhook-id-123",
  "data": {
    "accountId": "account-id",
    "email": {
      "id": "email-id",
      "from": {
        "name": "Boss Name",
        "address": "boss@company.com"
      },
      "to": [{"address": "you@company.com"}],
      "subject": "URGENT: Review this ASAP",
      "body": "Email content...",
      "date": "2025-01-15T10:25:00Z",
      "hasAttachment": true,
      "attachments": [
        {
          "filename": "document.pdf",
          "size": 123456,
          "contentType": "application/pdf"
        }
      ]
    }
  }
}
```

---

### 2. Webhook vers Slack - Notification d'Équipe
```json
{
  "type": "outbound",
  "name": "slack-notifications",
  "description": "Envoie des notifications Slack",
  "url": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX",
  "method": "POST",
  "events": ["email.received", "email.sent"],
  "filters": {
    "folder": "INBOX",
    "subject": "*urgent*"
  },
  "transform": {
    "template": {
      "text": "📧 Nouvel email urgent",
      "blocks": [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*De:* {{data.email.from.address}}\n*Sujet:* {{data.email.subject}}"
          }
        }
      ]
    }
  }
}
```

---

### 3. Webhook vers Dashboard Custom
```json
{
  "type": "outbound",
  "name": "dashboard-metrics",
  "description": "Envoie les métriques au dashboard",
  "url": "https://api.votredashboard.com/v1/metrics",
  "method": "POST",
  "headers": {
    "X-API-Key": "votre-api-key",
    "Content-Type": "application/json"
  },
  "events": ["email.sent", "email.received", "email.deleted"],
  "batchMode": {
    "enabled": true,
    "maxSize": 100,
    "flushInterval": 60000
  },
  "transform": {
    "template": {
      "metric": "email.{{event}}",
      "value": 1,
      "timestamp": "{{timestamp}}",
      "tags": {
        "account": "{{data.accountId}}",
        "folder": "{{data.email.folder}}"
      }
    }
  }
}
```

---

### 4. Webhook CRM Sync (Airtable)
```json
{
  "type": "outbound",
  "name": "airtable-sync",
  "description": "Synchronise les emails avec Airtable",
  "url": "https://api.airtable.com/v0/appXXXXXX/Emails",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer keyXXXXXXXXXXXXXX",
    "Content-Type": "application/json"
  },
  "events": ["email.received"],
  "filters": {
    "from": "*@clients.com"
  },
  "transform": {
    "template": {
      "fields": {
        "Subject": "{{data.email.subject}}",
        "From": "{{data.email.from.address}}",
        "Date": "{{data.email.date}}",
        "Body": "{{data.email.body.text}}",
        "Status": "New"
      }
    }
  }
}
```

---

## 🎯 Workflows Complets n8n

### Workflow 1 : Auto-Réponse Intelligente

```
┌─────────────────┐
│  Webhook Reçu   │ ← Mailing Manager (email.received)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Filtre         │ Si sujet contient "question" ou "help"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenAI         │ Génère une réponse contextuelle
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Request   │ → POST vers Mailing Manager webhook
└─────────────────┘    (send_email action)
```

**Nodes n8n** :

1. **Webhook Node**
   - URL: Généré par n8n
   - Method: POST
   
2. **Filter Node**
   ```
   Conditions:
   - subject contains "question" OR
   - subject contains "help" OR
   - body contains "urgent"
   ```

3. **OpenAI Node**
   ```
   Model: gpt-4
   Prompt: "Generate a helpful email response to: {{$json.data.email.body}}"
   ```

4. **HTTP Request Node**
   ```
   Method: POST
   URL: https://votre-url/webhook/[inbound-webhook-id]
   Headers:
     X-Webhook-Secret: votre-secret
   Body:
     {
       "accountId": "{{$json.data.accountId}}",
       "to": "{{$json.data.email.from.address}}",
       "subject": "Re: {{$json.data.email.subject}}",
       "message": "{{$node['OpenAI'].json.response}}"
     }
   ```

---

### Workflow 2 : Archivage Intelligent

```
┌─────────────────┐
│  Schedule       │ Chaque jour à 2h du matin
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Request   │ → Mailing Manager webhook
└────────┬────────┘    (search old emails)
         │
         ▼
┌─────────────────┐
│  Function       │ Analyse et catégorise
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Switch         │ Selon catégorie
└────┬───┬───┬────┘
     │   │   │
     ▼   ▼   ▼
  Archive Keep Delete
```

---

## 🔐 Génération de Secrets Sécurisés

### Méthode 1 : OpenSSL (Recommandé)
```bash
# Secret de 32 bytes (256 bits)
openssl rand -hex 32

# Résultat exemple:
# a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0
```

### Méthode 2 : Node.js
```javascript
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('hex'));
```

### Méthode 3 : En ligne (1Password, LastPass)
```
https://1password.com/password-generator/
Longueur: 64 caractères
Inclure: a-z, A-Z, 0-9
```

---

## 📝 Templates de Test

### Test Webhook INBOUND avec curl
```bash
#!/bin/bash
# test-inbound-webhook.sh

WEBHOOK_URL="https://votre-url/webhook/[webhook-id]"
SECRET="votre-secret"

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d '{
    "accountId": "test-account-id",
    "to": "test@example.com",
    "subject": "Test Email",
    "message": "Ceci est un test"
  }' \
  -v
```

### Serveur de Test pour OUTBOUND
```javascript
// test-webhook-server.js
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

app.post('/webhook/test', (req, res) => {
  console.log('═══ Webhook Reçu ═══');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  // Vérifier la signature
  const signature = req.headers['x-webhook-signature'];
  const secret = 'votre-secret-partagé';
  
  if (signature) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    const isValid = signature === expectedSignature;
    console.log('Signature valide:', isValid);
  }
  
  res.json({ received: true, timestamp: new Date() });
});

app.listen(8080, () => {
  console.log('Serveur de test webhook sur http://localhost:8080');
  console.log('Exposez avec ngrok: ngrok http 8080');
});
```

---

## ⚡ Quick Commands

```bash
# Démarrer le serveur avec webhooks
mailing-manager server

# Démarrer avec ngrok
ngrok http 3100

# Tester la connectivité
curl http://localhost:3100/health

# Voir les logs webhook
tail -f ~/.mailing-manager/logs/webhooks.log

# Générer un secret
openssl rand -hex 32

# Tester un webhook
curl -X POST http://localhost:3100/webhook/[id] \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: secret" \
  -d '{"test":"data"}'
```

---

## 📚 Ressources Supplémentaires

- **n8n Documentation**: https://docs.n8n.io
- **Zapier Webhooks**: https://zapier.com/apps/webhook/integrations
- **ngrok Docs**: https://ngrok.com/docs
- **Cloudflare Tunnel**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Express.js**: https://expressjs.com/

---

Vous avez maintenant tous les exemples de configuration pour démarrer avec les webhooks ! 🚀
