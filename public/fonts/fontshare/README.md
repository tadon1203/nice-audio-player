# Fontshare assets

Download Switzer and Zodiak manually from Fontshare. Only these four normal WOFF2 files are required:

- `Switzer-Regular.woff2`
- `Switzer-Medium.woff2`
- `Switzer-Semibold.woff2`
- `Zodiak-Regular.woff2`

Rename the downloaded files to these canonical repository names and place them in this directory.
The files remain local and are excluded from Git. Remote font loading is unsupported.

Run `pnpm fonts:check` to verify installation. `pnpm package` requires the font check to pass.
Final visual review must confirm successful WOFF2 responses and no fallback-font use in the browser developer tools.
