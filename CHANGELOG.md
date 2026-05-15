# Changelog - Mailing Manager MCP

## [1.1.1] - 2026-04-03
### Fixed
- **Node.js v24 Compatibility**: `better-sqlite3` native module must be recompiled after Node.js major version upgrade.
  - Symptom: `ERR_DLOPEN_FAILED` - `NODE_MODULE_VERSION 127` vs `137` mismatch
  - Fix: `cd tools/mcp-mails && rm -rf node_modules/better-sqlite3 && npm install better-sqlite3 && npm run build`
  - Note: `npm install` alone may timeout during native compilation. If it does, ensure `node-gyp` is installed (`sudo npm i -g node-gyp`) and that build tools are present (`build-essential`, `python3`).

## [1.1.0] - 2026-03-26
### Added
- **Thread-Aware Replies**: `get_email_thread` fetches full conversation history via Message-ID/References.
- **Thread Summary**: `get_thread_summary` generates condensed summaries for AI context.
- **Auto-Context Injection**: `send_email` now supports `thread_aware` + `thread_email_id` params to inject thread history into replies.

### Fixed
- **MIME Marker Issue**: Thread context injection now uses `📎` markers instead of `---` to avoid breaking MIME parsing.

## [1.0.2] - 2026-03-25
### Fixed
- **readEmail UID Bug**: Added `{ uid: true }` option to IMAP fetch for proper UID-based email reading.
- **Attachment Display**: Enhanced `read_email` output to show attachment details (filename, type, size, part ID).

### Added
- **get_sync_status**: New tool to view sync state (last UID, total count, date range).
- **reset_sync**: New tool to clear local cache and force full re-sync.

## [1.0.1] - 2026-02-15
### Documentation
- Alignment fix and NPM/GitHub release preparation.

## [1.0.0] - 2026-02-15
### Initial Public Release (Professional Edition)

#### Key Features
- **Universal Handshake**: Implemented A+B+C authentication methods (Local, Direct, Pinggy Tunnel).
- **FTS5 Memory**: Lightning-fast local email indexing with SQLite Full-Text Search.
- **Delta Sync**: Intelligent incremental synchronization logic.
- **AI-Pro Parsing**: Robust text extraction from multipart/mixed emails.
- **360 Logging**: Comprehensive activity journal for auditing all operations.
- **Attachment Manager**: Part-ID based downloads and sending local file attachments.
- **Personas & Tasks**: Behavioral engine for AI tone/signature and Cron-based scheduler.
- **Webhooks**: Bidirectional webhooks (inbound/outbound) for external integrations.

#### Security
- **Hardened Encryption**: AES-256-GCM storage with Argon2id key derivation.
- **Vault Stability**: Non-blocking stdio transport even when vault is locked.
