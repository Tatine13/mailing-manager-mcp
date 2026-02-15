# 🔗 Guide Complet des Webhooks - Mailing Manager MCP

Ce guide centralise tout ce que vous devez savoir pour intégrer Mailing Manager avec des services externes comme n8n, Zapier ou vos propres API.

---

## 🎯 Concepts Clés

### 1. Webhooks INBOUND (Recevoir)
Permet à des services tiers de commander votre MCP (ex: n8n envoie un mail via votre compte).
- **Endpoint** : `http://localhost:3100/webhook/[id]`
- **Sécurité** : Clé secrète obligatoire (`X-Webhook-Secret`).

### 2. Webhooks OUTBOUND (Notifier)
Votre MCP notifie un service tiers d'un événement (ex: Alerter Slack quand un email du "Boss" arrive).
- **Événements** : `email.received`, `email.sent`, `task.completed`, etc.
- **Sécurité** : Signé avec HMAC-SHA256.

---

## 🛠️ Configuration du Serveur

Dans votre fichier `~/.mailing-manager/config.json` :
```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "baseUrl": "https://votre-tunnel.ngrok.io",
    "security": {
      "signatureValidation": true
    }
  }
}
```

---

## 🚀 Exemples Pratiques

### n8n (Outbound)
Pour recevoir une alerte dans n8n lors d'un nouvel email :
1. Créez un **Webhook Node** dans n8n.
2. Utilisez l'outil MCP `create_outbound_webhook` :
```json
{
  "name": "Notify n8n",
  "url": "https://votre-n8n.cloud/webhook/...",
  "events": ["email.received"]
}
```

### Zapier (Inbound)
Pour envoyer un mail depuis un Google Form via Zapier :
1. Configurez un Webhook POST dans Zapier vers votre MCP.
2. Payload : `{"action": "send_email", "to": "...", "subject": "..."}`.

---

## ❓ FAQ & Troubleshooting

**Q: Comment tester en local ?**  
R: Utilisez **ngrok** (`ngrok http 3100`) pour exposer votre port local au web.

**Q: Pourquoi mon webhook renvoie 401 ?**  
R: Vérifiez que le header `X-Webhook-Secret` correspond exactement à celui configuré dans le tool `create_inbound_webhook`.

---
*Pour des exemples de payloads détaillés, consultez `docs/WEBHOOKS-CONFIG-EXAMPLES.md`.*
