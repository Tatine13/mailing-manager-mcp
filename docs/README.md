# 📧 Mailing Manager MCP - (NB: pour publier sur fkom13 ou Tatine13 je sais pas encore)

<div align="center">

[![npm version](https://badge.fury.io/js/@mailing-ai%2Fmcp-manager.svg)](https://badge.fury.io/js/@mailing-ai/mcp-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@mailing-ai/mcp-manager.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Enterprise-grade Multi-Account Email Management powered by Model Context Protocol**

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Tools](#-available-tools) • [Security](#-security)

</div>

---

## 📋 Overview

Mailing Manager MCP is a secure, extensible MCP (Model Context Protocol) server that enables AI assistants like Claude and Cursor to manage multiple email accounts with advanced features:

- 🎭 **AI Personas** - Define communication styles and behaviors
- 📋 **Directives** - Contextual automation rules for emails
- ⚙️ **Task Scheduling** - Cron-based automated workflows
- 🔗 **Webhooks** - Inbound/outbound event integration
- 🔐 **Enterprise Security** - AES-256-GCM encryption with Argon2

---

## ✨ Features

### 🔐 Ultra-Secure Architecture
| Feature | Implementation |
|---------|---------------|
| **Encryption** | AES-256-GCM for all credentials |
| **Key Derivation** | Argon2id (memory: 64MB, iterations: 3) |
| **Master Password** | Never stored, only hashed |
| **OAuth2 Tokens** | Encrypted with unique IVs |
| **OS Keychain** | Optional integration (macOS/Windows/Linux) |

### 📬 Multi-Account Support
- **Unlimited email accounts**
- **Provider Presets**: Gmail, Outlook, Yahoo, iCloud, Fastmail, Custom
- **Authentication Methods**: OAuth2, App Passwords, Password
- **Protocols**: IMAP, SMTP with TLS

### 🎭 AI Personas System
Define how your AI assistant communicates:
```typescript
{
  name: "Professional",
  tone: "formal",           // professional | casual | formal | friendly
  style: "concise",         // concise | detailed | bullet-points
  signature: "Best regards,\nJohn Doe",
  responseTime: "within-hour"
}
```

### 📋 Directives Engine
Create conditional automation rules:
```typescript
{
  name: "Priority Boss Emails",
  trigger: {
    conditions: [
      { field: "sender", operator: "contains", value: "boss@company.com" }
    ]
  },
  actions: [
    { type: "flag", parameters: { flag: "urgent" } }
  ]
}
```

### ⚙️ Task Automation
Schedule complex workflows:
```typescript
{
  name: "Daily Digest",
  schedule: { type: "cron", value: "0 9 * * *" },  // Every day at 9 AM
  type: "digest_generation"
}
```

### 🔗 Webhooks
- **Inbound**: Receive events from external services
- **Outbound**: Send notifications to Slack, Zapier, n8n, Make
- **Security**: HMAC signature verification, rate limiting, replay protection

---

## 🚀 Installation

### Via npm (Recommended)
```bash
npm install -g @mailing-ai/mcp-manager
```

### First-Time Setup
```bash
mailing-manager setup
```

This opens a secure browser form to:
1. Create your master password
2. Initialize the encrypted database
3. Add your first email account

---

## ⚙️ Configuration

### For Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mailing-manager": {
      "command": "npx",
      "args": ["@mailing-ai/mcp-manager", "server"],
      "env": {
        "MAILING_MANAGER_DATA_DIR": "~/.mailing-manager",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### For Cursor IDE

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mailing-manager": {
      "command": "npx",
      "args": ["@mailing-ai/mcp-manager", "server"],
      "env": {
        "MAILING_MANAGER_DATA_DIR": "~/.mailing-manager"
      }
    }
  }
}
```

### For Other MCP Clients

```bash
# Start the MCP server
mailing-manager server

# Or with HTTP transport
mailing-manager server --transport http

# Or both transports
mailing-manager server --transport both
```

---

## 🛠️ Available Tools

### Account Management
| Tool | Description |
|------|-------------|
| `add_account` | Add a new email account (opens secure browser form) |
| `list_accounts` | List all configured accounts |
| `remove_account` | Remove an account and its data |
| `test_connection` | Verify account connectivity |

### Email Operations
| Tool | Description |
|------|-------------|
| `list_emails` | List emails in a folder with pagination |
| `read_email` | Read full email content |
| `send_email` | Send emails with attachments and CC/BCC |
| `search_emails` | Advanced search with filters |
| `move_email` | Move emails between folders |
| `delete_email` | Delete emails |
| `flag_email` | Star or flag emails |

### Personas
| Tool | Description |
|------|-------------|
| `create_persona` | Create a new AI persona |
| `list_personas` | List all personas |
| `update_persona` | Modify persona settings |
| `delete_persona` | Remove a persona |

### Directives
| Tool | Description |
|------|-------------|
| `create_directive` | Create automation directive |
| `list_directives` | List all directives |
| `test_directive` | Test directive against an email |

### Tasks
| Tool | Description |
|------|-------------|
| `create_task` | Create scheduled task |
| `list_tasks` | List all tasks |
| `execute_task` | Run a task manually |
| `pause_task` / `resume_task` | Control task execution |

### Webhooks
| Tool | Description |
|------|-------------|
| `create_inbound_webhook` | Create webhook endpoint |
| `create_outbound_webhook` | Set up event notifications |
| `list_webhooks` | List all webhooks |
| `webhook_logs` | View execution history |

---

## 🔒 Security

### Encryption Details

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Master Password (User Input)                                │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────┐                                        │
│  │   Argon2id      │  Time: 3 iterations                    │
│  │   Key Derivation│  Memory: 64 MB                         │
│  └────────┬────────┘  Parallelism: 4                        │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │   256-bit Key   │  Used for all encryption               │
│  └────────┬────────┘                                        │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────┐                                        │
│  │  AES-256-GCM    │  Each value: unique IV + auth tag      │
│  │  Encryption     │                                        │
│  └─────────────────┘                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Zero-Trust Design
- ✅ No credentials stored in plaintext
- ✅ Master password never written to disk
- ✅ Each encrypted value uses a unique IV
- ✅ OAuth tokens encrypted separately
- ✅ Database fields encrypted at rest

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   MCP Client                         │
│              (Claude / Cursor / Other)               │
└──────────────────┬──────────────────────────────────┘
                   │ MCP Protocol (stdio/http)
┌──────────────────▼──────────────────────────────────┐
│              Mailing Manager Server                  │
├──────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Account  │  │  Email   │  │ Persona  │          │
│  │ Manager  │  │  Client  │  │ Manager  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Directive │  │   Task   │  │ Webhook  │          │
│  │ Engine   │  │  Engine  │  │ Manager  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│  ┌──────────────────────────────────────┐          │
│  │        Security & Encryption         │          │
│  └──────────────────────────────────────┘          │
└──────────────────┬──────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│  IMAP   │  │  SMTP   │  │ OAuth2  │
│ Servers │  │ Servers │  │Providers│
└─────────┘  └─────────┘  └─────────┘
```

---

## 📖 Usage Examples

### Natural Language with Claude/Cursor

Once configured, interact with your emails naturally:

```
"Check my Gmail inbox for unread emails from last week"

"Send an email to john@company.com about the project update"

"Create a professional persona for business communications"

"Set up a task to archive old emails every Monday at 9 AM"

"Show me emails from my boss that are flagged as urgent"
```

### Supported Email Providers

| Provider | Auth Methods | Notes |
|----------|-------------|-------|
| **Gmail** | OAuth2, App Password | Basic auth deprecated |
| **Outlook / Microsoft 365** | OAuth2 | Basic auth deprecated since Oct 2022 |
| **Yahoo Mail** | App Password | Requires app-specific password |
| **iCloud Mail** | App Password | Requires app-specific password |
| **Fastmail** | Password, App Password | Standard password supported |
| **Custom IMAP/SMTP** | Password | Self-hosted servers |

---

## 🧪 Development

### Prerequisites
- Node.js >= 18
- npm >= 9

### Setup
```bash
# Clone the repository
git clone https://github.com/your-org/mailing-manager-mcp.git
cd mailing-manager-mcp

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build
npm run build
```

### Project Structure
```
mailing-manager-mcp/
├── src/
│   ├── bin/              # CLI and server entry points
│   ├── core/             # Core server and types
│   ├── auth/             # OAuth2 providers
│   ├── email/            # IMAP/SMTP clients
│   ├── accounts/         # Account management
│   ├── personas/         # Persona system
│   ├── directives/       # Automation directives
│   ├── tasks/            # Task engine
│   ├── webhooks/         # Webhook system
│   ├── security/         # Encryption layer
│   ├── storage/          # Database layer
│   └── tools/            # MCP tool implementations
├── tests/                # Test suites
├── migrations/           # Database migrations
└── config/               # Configuration templates
```

---

## 📝 Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MAILING_MANAGER_DATA_DIR` | Data directory path | `~/.mailing-manager` |
| `LOG_LEVEL` | Logging level | `info` |
| `REMOTE_MODE` | Enable remote secure input | `false` |

### Config File (`~/.mailing-manager/config.json`)

```json
{
  "webhooks": {
    "enabled": true,
    "port": 3100,
    "security": {
      "signatureValidation": true,
      "replayProtection": true
    }
  },
  "tasks": {
    "schedulerEnabled": true,
    "maxConcurrent": 5
  },
  "security": {
    "autoLockTimeoutMinutes": 30
  }
}
```

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) - The foundation for AI assistant integration
- [ImapFlow](https://github.com/postalsys/imapflow) - Modern IMAP client library
- [Nodemailer](https://nodemailer.com) - SMTP client for Node.js
- [node-argon2](https://github.com/ranisalt/node-argon2) - Secure password hashing

---

## 📞 Support

- **GitHub Issues**: [Report bugs](https://github.com/your-org/mailing-manager-mcp/issues)
- **Discord**: [Join community](https://discord.gg/mailing-manager)

---

<div align="center">

**Made with ❤️ for the AI-powered future of email management**

[⬆ Back to Top](#-mailing-manager-mcp)

</div>
