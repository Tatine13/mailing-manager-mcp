- Idées de dev:

📋 Projet - Mailing-Manager MCP
🎯 Vue d'ensemble
Développement d'un serveur Model Context Protocol (MCP) pour la gestion d'emails multi-comptes avec support avancé de personas, directives et tâches automatisées. Le projet doit être exécutable via npx, ultra sécurisé, et offrir une expérience utilisateur fluide pour la configuration des comptes email.
---
🌟 Objectifs Principaux
1. Gestion multi-comptes IMAP/POP/SMTP sans limites
2. Sécurité maximale avec chiffrement et méthodes d'authentification multiples
3. Système de personas par compte pour personnaliser le comportement de l'IA
4. Directives contextuelles pour guider l'IA dans ses interactions
5. Tâches d'automatisation intégrées et configurables
6. Installation facile via ecosystem npm/npx
7. Configuration flexible avec mode automatique OU interactif multi-OS
---
📐 Architecture Technique
Technologies
- Language: TypeScript (Node.js >= 18)
- Protocoles Supportés: IMAP4, POP3, SMTP, Eメール (SMTPS/IMAPS)
- Chiffrement: AES-256-GCM, argon2 pour les hashs
- Stockage: SQLite (config locale) + encrypted config files
- CLI: Inquirer.js / enquirer pour l'interactivité
- Cross-platform GUI support: 
  - blessed pour TUI
  - electron pour popup (optionnelle)
  - Fallback console standard
