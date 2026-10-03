# Fontshare assets

Satoshi (see `DESIGN.md`). Font binaries are excluded from Git; remote font loading is not supported.

- `pnpm fonts:download` fetches `Satoshi-Variable.woff2` from Fontshare and verifies its SHA-256.
- `pnpm fonts:check` verifies the bundled license text and the font hash (part of `pnpm check`).

License: [LICENSE.txt](./LICENSE.txt).
