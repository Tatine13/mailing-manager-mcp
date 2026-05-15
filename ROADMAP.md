# Product Roadmap - Mailing Manager MCP

This document outlines the strategic evolution of the Mailing Manager.

---

## v1.1.0 - Thread-Aware Intelligence (Released 2026-03-26)
*Focus: Context-aware email handling for smarter AI replies.*
- [x] **Thread-Aware Replies**: Fetch full thread history before replying for context-rich responses.
- [x] **Thread Detection**: Auto-detect conversation threads via `References` and `In-Reply-To` headers.
- [x] **Thread Summary**: Generate concise thread summaries for token-efficient AI context.

## v1.0.0 - Stability & Reliability (Released)
*Focus: Secure foundation and robust core tools.*
- [x] **Universal Secure Handshake (A+B+C)**: Support for Local, Direct, and Remote (Pinggy) setup.
- [x] **FTS5 Search Memory**: Instant local search across accounts.
- [x] **Robust Decoding**: Support for Quoted-Printable, Base64, and HTML-to-Text extraction.
- [x] **Full Activity Tracing**: 360° logging of all operations.
- [x] **Sync Management**: `get_sync_status` and `reset_sync` tools for full sync control.
- [x] **Attachment Details**: Full attachment info display (name, type, size, part ID).

## v1.5.0 - Intelligence & Automation (Q2 2026)
*Focus: Active management and AI-driven workflows.*
- [ ] **Functional Task Engine**: Automated email digests, smart cleanup, and auto-responding.
- [ ] **Advanced Filtering**: Regular expression support and attachment-based directives.
- [ ] **Persona Templates**: Out-of-the-box identities (Assistant, Support, Personal).

## v2.0.0 - Industrial Scale (Q3 2026)
*Focus: Performance, concurrency, and enterprise features.*
- [ ] **Background Worker Architecture**: Async job queue using SQLite for heavy operations.
- [ ] **Unified Multi-Account View**: Search and organize emails across all accounts in a single call.
- [ ] **Provider Extensions**: Specialized support for Gmail `X-GM-RAW` and IMAP `IDLE`.
- [ ] **Asset Lifecycle Management**: Automated cleanup of local attachment cache.

---
MIT © [Tatine13](https://github.com/Tatine13)
