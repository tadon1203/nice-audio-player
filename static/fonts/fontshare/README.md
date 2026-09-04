# Fontshare assets

Nice Audio Player uses Satoshi as specified by `DESIGN.md`.

Download Satoshi from the official Fontshare distribution with:

```text
pnpm fonts:download
```

The command downloads `https://api.fontshare.com/v2/fonts/download/satoshi`,
extracts `Satoshi-Variable.woff2`, and verifies its SHA-256 hash. The source
page is https://www.fontshare.com/fonts/satoshi.

Font binaries are intentionally excluded from Git. Remote font loading is not
supported.

The applicable license is available in [LICENSE.txt](./LICENSE.txt).

Run `pnpm fonts:check` before validating or building the renderer. The check
also verifies the bundled FFL text and approved font hash.
