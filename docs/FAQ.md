FAQ Mailing Manager MCP

>>>...ICI SERONT INSERER LES QUESTIONS / RéPONSES UTILES DE LA FAQ:...<<<



# Q1: Est ce que ce MCP fonctionne sans webhooks ?

# R1: 

Oui, le MCP fonctionne PARFAITEMENT sans webhooks ! ✅
Les webhooks sont une fonctionnalité OPTIONNELLE et avancée.
Le MCP fonctionne en mode basique avec :

✅ Gestion multi-comptes email
✅ Envoi/réception d'emails
✅ Recherche et filtrage
✅ Personas
✅ Directives
✅ Tasks planifiées
✅ Tous les outils MCP via Claude Desktop/Cursor

Les webhooks servent uniquement pour :

❌ Intégration avec n8n, Zapier, etc.
❌ Notifications externes en temps réel
❌ Déclenchements depuis d'autres services

Pour désactiver les webhooks :
json{
  "webhooks": {
    "enabled": false  // C'est tout !
  }
}

Résumé : Vous pouvez utiliser le MCP à 100% sans jamais toucher aux webhooks. Ils sont juste un bonus pour ceux qui veulent des automations avancées avec d'autres outils. 👍et de l'entrée de mot de passe ou oauth c'est ca21:29Clarified password and OAuth authentication mechanismsL'utilisateur demande comment fonctionne l'entrée du mot de passe ou OAuth pour l'authentification des comptes email. C'est une question importante sur la sécurité et l'expérience utilisateur.

Pour etre plus précis sur les webhook d'authentification :

Comment le master password est entré
Comment les credentials des comptes email sont entrés (mot de passe classique vs OAuth2)
Le flux d'authentification sécurisé
Comment ça marche avec CLI vs navigateur

Regardons dans le document de développement ce qui est prévu...
Dans la doc, je vois qu'il y a une mention de "secure-input" et de formulaires sécurisés via navigateur. Il faut que je clarifie les différentes méthodes d'authentification.Afficher plusTerminéExactement ! Voici comment l'authentification fonctionne :
🔐 Deux Niveaux d'Authentification
1️⃣ Master Password (Une seule fois au setup)
Première installation :
bashmailing-manager setup
Le système vous demande de créer un master password pour chiffrer TOUTES vos données. C'est fait :

✅ Via le terminal (input sécurisé masqué)
✅ OU via un formulaire web local sécurisé
✅ Stocké chiffré (jamais en clair)
✅ Demandé UNE SEULE FOIS au setup

Ensuite :

Soit stocké dans le keychain de l'OS (macOS Keychain, Windows Credential Manager)
Soit vous le rentrez au démarrage du serveur (si pas de keychain)


2️⃣ Credentials des Comptes Email (Deux méthodes)
Méthode A : Mot de passe classique 🔑
Pour Gmail, Outlook, etc. avec un App Password :
bash# Via l'outil MCP dans Claude/Cursor
"add_account"

# Le système vous demande :
Email: votre@gmail.com
App Password: xxxx-xxxx-xxxx-xxxx  [masqué]
Important : Vous devez d'abord générer un "App Password" :

Gmail : Google Account → Security → 2-Step Verification → App Passwords
Outlook : Account → Security → App Passwords
Yahoo : Account Security → Generate App Password


Méthode B : OAuth2 🔐 (Recommandé)
Pour Gmail, Outlook, Yahoo avec OAuth2 :
Processus :
bash# Via l'outil MCP
"add_account" 
  → Provider: Gmail
  → Auth Method: OAuth2

# Le système :
1. Ouvre votre navigateur automatiquement
2. Vous connecte à Google/Microsoft/Yahoo
3. Vous demande d'autoriser l'accès
4. Récupère le token automatiquement
5. Stocke le token CHIFFRÉ dans la DB


**Avantages OAuth2** :
- ✅ Plus sécurisé (pas de mot de passe stocké)
- ✅ Révocable à tout moment
- ✅ Permissions granulaires
- ✅ Auto-renouvellement des tokens

---

## 🛡️ Flux de Sécurité Complet
```
┌─────────────────────────────────────────────┐
│  1. Première Installation                   │
│     mailing-manager setup                   │
│     → Créer Master Password (une fois)      │
│     → Chiffrement de la base de données     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  2. Ajouter un Compte Email                 │
│     Via MCP tool "add_account"              │
│                                             │
│     Choix A: App Password                   │
│     → Entrer le password                    │
│     → Stocké CHIFFRÉ avec AES-256-GCM       │
│                                             │
│     Choix B: OAuth2                         │
│     → Navigateur s'ouvre                    │
│     → Login Google/Microsoft/Yahoo          │
│     → Token récupéré et stocké CHIFFRÉ      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  3. Utilisation Quotidienne                 │
│     Serveur MCP démarre                     │
│     → Master password déjà dans keychain    │
│     → Déchiffre les credentials             │
│     → Se connecte aux comptes email         │
│     → Vous utilisez via Claude/Cursor       │
└─────────────────────────────────────────────┘
```
💡 En Résumé
Vous entrez des mots de passe :

Une fois : Master password au setup
Par compte email :

SOIT app password (masqué)
SOIT OAuth2 via navigateur (plus simple et sécurisé)



Après :

Tout est automatique
Credentials chiffrés
Accès via Claude/Cursor sans re-saisir de password

Méthode recommandée : OAuth2 pour Gmail/Outlook (zéro mot de passe à gérer !) 🎯
