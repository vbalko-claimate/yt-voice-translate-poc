# Security

## API Keys

The extension can send an ElevenLabs API key to the local Node bridge for the active session. If `Remember key locally` is disabled, the key is not persisted by the extension. If it is enabled, the key is encrypted with AES-GCM before being written to `chrome.storage.local`; the non-extractable WebCrypto key is stored in the extension's IndexedDB.

This is intended to avoid plain-text storage inside extension settings. It is not a replacement for a native OS keychain, and a fully compromised browser profile can still compromise local secrets.

Do not paste API keys into issues, logs, screenshots, or commits.

## Local Services

The companion services bind to `127.0.0.1` by default. Do not expose them on a public interface unless you add authentication and understand the risk.

## Reporting

If you find a security issue, open a private report through GitHub Security Advisories if available, or contact the maintainer directly.
