# Security

## API Keys

The extension can send an ElevenLabs API key to the local Node bridge for the active session. The key is not stored by the extension, but it is still present in local process memory while the bridge is running.

Do not paste API keys into issues, logs, screenshots, or commits.

## Local Services

The companion services bind to `127.0.0.1` by default. Do not expose them on a public interface unless you add authentication and understand the risk.

## Reporting

If you find a security issue, open a private report through GitHub Security Advisories if available, or contact the maintainer directly.

