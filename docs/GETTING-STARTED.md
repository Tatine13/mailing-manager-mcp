# 🚀 Guide de Démarrage Rapide - Mailing Manager MCP

Bienvenue dans le Mailing Manager MCP. Ce guide vous aidera à configurer votre environnement et à envoyer votre premier email en moins de 10 minutes.

---

## 📋 Prérequis
- **Node.js** v18 ou supérieur.
- **npm** v9 ou supérieur.
- Un compte email (Gmail avec mot de passe d'application ou compte IMAP standard).

## 🛠️ Installation (3 min)

### 1. Cloner et Construire
```bash
git clone https://github.com/Tatine13/mailing-manager-mcp.git
cd mailing-manager-mcp
npm install
npm run build
```

### 2. Configuration Initiale
Copiez le fichier d'exemple et définissez votre code de déverrouillage :
```bash
cp .env.example .env
# Éditez le .env pour définir MAILING_MANAGER_UNLOCK_CODE
```

### 3. Setup du Coffre-fort
Initialisez la base de données chiffrée :
```bash
npm run setup
```
*Note : Si vous êtes en local, cela peut ouvrir un formulaire sécurisé dans votre navigateur.*

---

## 📬 Ajouter votre premier compte (2 min)

Nous recommandons d'utiliser la méthode **Direct** pour votre premier test.

### Exemple pour Gmail (avec App Password)
1. Générez un mot de passe d'application sur votre compte Google.
2. Utilisez l'outil MCP ou la CLI :
```bash
# Via la CLI (pour test rapide)
node dist/bin/cli.js add_account --method direct --email votre@gmail.com --password "xxxx xxxx xxxx xxxx" --provider gmail
```

---

## 🧪 Premier Test (1 min)

### 1. Synchroniser les messages
Récupérez vos 20 derniers emails dans la mémoire locale FTS5 :
```bash
# Remplacez ACCOUNT_ID par l'ID retourné lors de l'ajout
node dist/bin/cli.js sync_emails --account_id "votre-id"
```

### 2. Rechercher en local
Testez la vitesse de la recherche FTS5 :
```bash
node dist/bin/cli.js search_local_emails --query "bienvenue"
```

---

## 🔗 Prochaines Étapes
- **Webhooks** : Consultez le [Guide Complet des Webhooks](WEBHOOKS-COMPLETE-GUIDE.md).
- **Automatisation** : Découvrez comment créer des [Tâches et Directives](README.md#automation).
- **Sécurité** : Apprenez-en plus sur notre [Architecture de Chiffrement](README.md#security).

---
Besoin d'aide ? [Ouvrez une Issue](https://github.com/Tatine13/mailing-manager-mcp/issues) sur GitHub ! 🚀
