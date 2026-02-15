# Changelog - Mailing Manager MCP

## [Unreleased] - v1.5.0
### Planned
- **Functional Tasks**: Real logic for `digest`, `cleanup`, and `auto_respond`.
- **Advanced Decoders**: UTF-8 support for quoted-printable and base64.
- **Unified Multi-Account Search**: Search across multiple servers in one job.

## [1.0.0] - 2026-02-15
### Initial Public Release (Professional Edition)

#### ✨ Key Features
- **Universal Handshake**: Implemented A+B+C authentication methods (Local, Direct, Pinggy Tunnel) for cross-environment setup.
- **FTS5 Memory**: Lightning-fast local email indexing with SQLite Full-Text Search for instant offline querying.
- **Delta Sync**: Intelligent incremental synchronization logic that prioritizes new data and respects configurable limits.
- **AI-Pro Parsing**: Robust text extraction from multipart/mixed emails, optimized for LLM token efficiency (Base64 filtering).
- **360° Logging**: Comprehensive activity journal for auditing all operations (Sent, Read, Sync, Download, Task, Directive).
- **Attachment Manager**: Part-ID based downloads and support for sending local file attachments.
- **Personas & Tasks**: Integrated behavioral engine for AI tone/signature and a robust Cron-based task scheduler.
- **UI 2026**: Modern Glassmorphism design for the interactive security portal.

#### 🏗️ Project Reorganization
- **Architecture**: Moved legacy scripts and code maps to `_archs/`.
- **Testing**: Centralized demo and verification scripts into `tests/`.
- **Documentation**: Restructured `docs/` with specialized guides for Webhooks and FAQ.
- **Packaging**: Optimized `.gitignore` and `.npmignore` for professional distribution.

#### 🛡️ Security
- **Hardened Encryption**: AES-256-GCM storage with Argon2id key derivation.
- **Vault Stability**: Non-blocking stdio transport even when the vault is locked.
