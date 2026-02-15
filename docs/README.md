# 🏗️ Architecture & Technical Reference - Mailing Manager MCP

Mailing Manager MCP is built with an enterprise-grade modular architecture, prioritizing security, performance, and total observability. This document provides deep technical insights into the server's internals.

---

## 🧩 System Architecture

The server is divided into specialized managers, each handling a specific domain of the email lifecycle:

```
┌─────────────────────────────────────────────────────┐
│                   MCP INTERFACE (stdio/http)         │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Account  │  │  Email   │  │ Persona  │          │
│  │ Manager  │  │  Client  │  │ Manager  │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │             │                │
│  ┌────▼─────────────▼─────────────▼─────┐          │
│  │        SECURITY & ENCRYPTION         │          │
│  │      (Argon2id + AES-256-GCM)        │          │
│  └────┬───────────────────────────┬─────┘          │
│       │                           │                │
│  ┌────▼───────────┐         ┌─────▼───────────┐    │
│  │ SQLite Storage │         │    Event Bus    │    │
│  │ (FTS5 Memory)  │         │ (Internal Hooks)│    │
│  └────────────────┘         └─────┬───────────┘    │
│                                   │                │
│  ┌──────────┐  ┌──────────┐  ┌────▼─────┐          │
│  │Directive │  │   Task   │  │ Webhook  │          │
│  │ Engine   │  │  Engine  │  │ Manager  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

---

## 📊 Data & Memory Strategy

### FTS5 Local Search Memory
To optimize AI token usage and speed, the server utilizes **SQLite FTS5 (Full-Text Search)**.
- **Table**: `email_search`
- **Columns**: `message_id`, `account_id`, `folder`, `sender`, `recipients`, `subject`, `body_text`, `attachments`, `date`.
- **Optimization**: Body text is stripped of HTML and raw headers before indexing.
- **Delta Sync**: Incremental logic that fetches newest emails first and stops at the last known UID.

### 📜 360° Activity Journal
Total transparency is achieved through the `email_activity_log` table, recording every interaction:
- **Actions**: `read`, `sent`, `sync`, `download`, `move`, `delete`, `task_start`, `task_complete`, `task_failed`.
- **Metadata**: Timestamps, associated Account IDs, Message IDs, and result details.

---

## 🔐 Security Reference

### Encryption Pipeline
1.  **Key Derivation**: User's `MASTER_KEY` is processed via **Argon2id** (3 iterations, 64MB memory) to generate a 256-bit derived key.
2.  **Storage**: Credentials (passwords, tokens) are never stored in plain text.
3.  **Cipher**: **AES-256-GCM** provides both confidentiality and authenticity. Each entry has a unique 12-byte IV and a 16-byte authentication tag.

### Secure Handshake
The `SecureInput` module launches an ephemeral HTTP/S server for sensitive entries. 
- **Keys**: Ephemeral ECDH (P-256) keys are generated for every session to encrypt data between the browser and the MCP server.
- **Protection**: CSRF protection and strictly enforced CSP headers.

---

## ⚙️ Environment Variables (.env)

The server behavior can be entirely controlled via environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MAILING_MANAGER_UNLOCK_CODE` | Master password to unlock the vault (preferred name). | - |
| `MAILING_MANAGER_MASTER_KEY` | Legacy alias for the master password. | - |
| `MAILING_MANAGER_DATA_DIR` | Path to the storage directory. | `~/.mailing-manager` |
| `MAILING_MANAGER_SYNC_LIMIT` | Max emails per sync session (Cap: 100). | `20` |
| `MAILING_MANAGER_AUTO_SYNC_ON_LOAD`| Automatically sync active accounts on startup. | `false` |
| `MAILING_MANAGER_WEBHOOK_ENABLED` | Enable the inbound/outbound webhook system. | `true` |
| `MAILING_MANAGER_WEBHOOK_PORT` | Port for the inbound webhook server. | `3100` |
| `MAILING_MANAGER_WEBHOOK_HOST` | Host for the inbound webhook server. | `localhost` |
| `MAILING_MANAGER_HTTP_PORT` | Port for the management API (if enabled). | `3000` |
| `MAILING_MANAGER_HTTP_HOST` | Host for the management API. | `localhost` |
| `LOG_LEVEL` | Logging verbosity (`trace`, `debug`, `info`, `warn`, `error`).| `info` |
| `REMOTE_MODE` | Force remote interactive mode (Pinggy/SSH tunnels). | `false` |

---

## 🔗 Internal Event Bus (Functional Hooks)

The `EventBus` facilitates real-time reactions to system events. These can be mapped to **Outbound Webhooks**:

- `email.received`: Triggered after a successful sync/fetch of a new message.
- `email.sent`: Logged after an email is dispatched.
- `email.deleted` / `email.moved`: Standard management hooks.
- `task.completed`: Emitted when a scheduled task finishes its run.
- `task.failed`: Contains the error message for debugging.
- `directive.triggered`: Emitted when an automation rule matches an email.
- `account.error`: For real-time monitoring of IMAP/SMTP connection issues.

---

## 📁 Project Structure

```
mailing-manager-mcp/
├── dist/                 # Compiled JavaScript (Production)
├── migrations/           # SQLite Database migrations (Initial & Activity Log)
├── src/
│   ├── core/             # Server logic, Config manager, and Type definitions
│   ├── storage/          # Database manager and FTS5 logic
│   ├── security/         # Argon2 and AES encryption service
│   ├── email/            # IMAP/SMTP clients and Connection pooling
│   ├── accounts/         # Account management and Sync service
│   ├── tasks/            # Croner-based Task engine
│   ├── personas/         # AI Persona behavioral engine
│   ├── webhooks/         # Inbound server and Outbound dispatcher
│   ├── secure-input/     # Browser-based ephemeral security portal
│   └── tools/            # MCP Tool registration and implementations
└── tests/                # Unit and Integration test suites
```

---

## 🚀 Publication Note
This project is officially maintained by **Tatine13**.
Repository: `https://github.com/Tatine13/mailing-manager-mcp`
NPM: `@tatine13/mcp-manager`

---
<div align="center">
**Mailing Manager MCP - The Blueprint for AI Email Orchestration**
</div>
