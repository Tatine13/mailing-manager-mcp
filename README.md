# 📧 Mailing Manager MCP (v1.0.0)

<div align="center">

[![npm version](https://badge.fury.io/js/@tatine13%2Fmcp-manager.svg)](https://badge.fury.io/js/@tatine13/mcp-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol-blue.svg)](https://modelcontextprotocol.io)

**Enterprise-grade Multi-Account Email Orchestration powered by Model Context Protocol**

</div>

---

## 📋 Overview

Mailing Manager MCP is the most advanced, secure, and production-ready **Model Context Protocol (MCP)** server for email management. Designed for AI agents (Gemini, Claude, GPT), it transforms your mailboxes into a structured, searchable, and intelligent memory bank.

It allows AI assistants like Claude and Cursor to manage multiple email accounts with advanced features while keeping your credentials **ultra-secure**.

---

## 🌟 Killer Features

### 🔐 Universal Secure Handshake (A+B+C)
Configure any account safely across any environment:
*   **Method A (Local)**: Fast setup via local browser.
*   **Method B (Direct)**: Quick injection for trusted environments.
*   **Method C (Public Tunnel)**: Configures remote clients (n8n, mobile) via secure temporary SSH tunnels (Pinggy).

### 🧠 FTS5 Local AI Memory
Don't let your AI drown in tokens. Mailing Manager syncs your emails to a **Local SQLite Full-Text Search (FTS5)** table:
*   **Instant Search**: Sub-millisecond lookups across all accounts.
*   **Token Optimization**: Extracts clean text, removing heavy HTML and technical headers.
*   **Attachment Awareness**: The AI sees what's available to download without fetching binaries.

### 🔄 Delta Synchronization
Intelligent incremental sync logic that only fetches what's new. 
*   **Performance**: Syncs newest first and stops at the last known email.
*   **Control**: Configurable limits (Default 20, Max 100 per session).
*   **Auto-Sync**: Support for automatic sync on startup.

### 📜 360° Activity Audit
Full transparency for both the user and the AI. Every action is logged in a dedicated activity journal:
*   **Read/Sent**: Know exactly what was accessed or dispatched.
*   **Sync/Download**: Track background memory updates and file transfers.
*   **Task/Directive**: Monitor automated workflows.

---

## 🚀 Installation

### Prerequisites
- Node.js >= 18
- npm >= 9

### Setup
```bash
git clone https://github.com/Tatine13/mailing-manager-mcp.git
cd mailing-manager-mcp
npm install
npm run build
```

### First-Time Setup
First, create your encryption password (used to secure your SQLite DB):
```bash
# Set your master key in your environment
export MAILING_MANAGER_UNLOCK_CODE="your-secure-password"

# Run setup
npm run setup
```
This opens a secure browser form to initialize the encrypted database and add your first account.

---

## ⚙️ Configuration

### For Gemini CLI / Claude Desktop
Add this to your `settings.json`:

```json
{
  "mcpServers": {
    "mailing-manager": {
      "command": "node",
      "args": ["/path/to/dist/bin/server.js"],
      "env": {
        "MAILING_MANAGER_UNLOCK_CODE": "your-secure-password",
        "MAILING_MANAGER_SYNC_LIMIT": "50",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

---

## 📬 Multi-Account Support
- **Unlimited email accounts**
- **Provider Presets**: Gmail, Outlook, Yahoo, iCloud, Fastmail, Custom
- **Authentication Methods**: App Passwords, Password (**OAuth2 support planned for v1.5**)
- **Protocols**: IMAP, SMTP with TLS

---

## 🛠️ Available Tools (34)

### 👤 Account & Provider Management
| Tool | Description |
|------|-------------|
| `add_account` | Add a new email account via Direct, Local or Public tunnel. |
| `list_accounts` | List all configured email accounts. |
| `remove_account` | Remove an email account. |
| `test_connection` | Test the connection to an email account. |
| `add_provider_preset` | Add or update an email provider preset (IMAP/SMTP template). |
| `list_provider_presets` | List all available email provider presets. |
| `vault_status` | Check if the server vault is unlocked and ready. |

### 📧 Email Operations (IMAP/SMTP)
| Tool | Description |
|------|-------------|
| `list_emails` | List emails from an account folder. |
| `read_email` | Read the full clean content of an email (No Base64 spam). |
| `send_email` | Send an email from an account (supports local attachments). |
| `search_emails` | Search emails across folders (Online). |
| `move_email` | Move an email to another folder. |
| `delete_email` | Delete an email. |
| `download_attachment` | Download an email attachment to the local assets folder. |

### 🧠 Local Memory & Audit
| Tool | Description |
|------|-------------|
| `sync_emails` | Synchronize emails from a folder to the local FTS5 database. |
| `search_local_emails` | Fast offline search in synced emails (FTS5). |
| `get_email_history` | View the history of all email actions (read, sent, sync, download). |
| `get_server_info` | Get server version, configuration and environment info. |

### 🎭 AI Personas
| Tool | Description |
|------|-------------|
| `create_persona` | Create a new AI persona for automated email handling. |
| `list_personas` | List all personas for an account. |
| `update_persona` | Update an existing persona. |
| `delete_persona` | Delete a persona. |

### 📋 Automation Directives
| Tool | Description |
|------|-------------|
| `create_directive` | Create an automation directive (rule). |
| `list_directives` | List directives for an account. |
| `test_directive` | Test which directives match a specific email. |
| `delete_directive` | Delete a directive. |

### ⚙️ Scheduled Tasks
| Tool | Description |
|------|-------------|
| `create_task` | Create a scheduled task (Cron/Interval). |
| `list_tasks` | List all tasks. |
| `execute_task` | Manually execute a task immediately. |
| `delete_task` | Delete a task. |

### 🔗 Webhooks
| Tool | Description |
|------|-------------|
| `create_inbound_webhook` | Create an endpoint to receive external webhooks. |
| `create_outbound_webhook` | Create a webhook to notify external systems. |
| `list_webhooks` | List configured webhooks. |
| `webhook_logs` | View execution logs for a webhook. |

---

## 🛡️ Security First
*   **AES-256-GCM**: Credentials are never stored in plaintext.
*   **Argon2id**: Military-grade key derivation.
*   **Vault Architecture**: The server stays up even if locked, ensuring protocol stability.
*   **Secure Input**: Browser-based ephemeral interface for safe password entry.

---

## 📄 License
MIT © [Tatine13](https://github.com/Tatine13)

<div align="center">
**Made with ❤️ for the AI-powered future of email management**
</div>
