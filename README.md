# GapFix

**Recover Bitcoin stuck beyond the HD wallet address gap limit.**

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Live Site](https://img.shields.io/badge/Live-gapfix.net-f7931a)](https://gapfix.net)

GapFix is a free, open-source, client-side tool that scans your Bitcoin HD wallet up to 1 000 addresses deep, finds any UTXOs hidden beyond the 20-address gap limit, and tells you exactly which addresses to "dust" to make your wallet see everything again.

**No seed phrase required. No server. Runs entirely in your browser.**

---

## The Problem

Bitcoin HD wallets generate addresses sequentially (index 0, 1, 2, …). To find all your funds, they scan forward but **stop after 20 consecutive unused addresses**. This is called the *gap limit*.

If Bitcoin was ever sent to an address at index 21 or higher — because you generated many receive addresses before they were used, or you moved between wallets/apps with different derivation settings — your wallet stops scanning before it reaches those funds. The balance shows ₿0. The funds are still there. They're just beyond the gap.

## The Fix

Send a tiny "dust" amount (294–546 sats, roughly pennies) to each empty address inside the gap. Once those addresses have a transaction, your wallet's scanner continues past them and discovers the hidden funds on the next rescan.

## Features

- ✅ Supports **xpub** (P2PKH legacy), **ypub** (P2SH-P2WPKH segwit-wrapped), **zpub** (P2WPKH native segwit)
- ✅ Scans up to **1 000 external + 1 000 change addresses**
- ✅ Detects **all gap limit violations**, not just the first one
- ✅ Generates a copy-paste **dust address list** for batch sending
- ✅ Uses [Blockstream's public API](https://blockstream.info) — no API key needed
- ✅ Testnet support (tpub, upub, vpub)
- ✅ 100% client-side — your key never leaves your browser

## Supported Wallets

Works with any BIP32/BIP44/BIP49/BIP84 compliant wallet:

| Wallet | xpub location |
|---|---|
| Electrum | Wallet → Information → Master Public Key |
| Ledger Live | Account → Edit → Advanced → Extended public key |
| Trezor Suite | Account → Details → Public key (XPUB) |
| Sparrow | Settings → Keystore → Master Public Key |
| Coldcard | Advanced/Tools → View Identity → XPUB |

## Quick Start

### Use the hosted version

Visit **[gapfix.net](https://gapfix.net)** — nothing to install.

### Run locally

```bash
git clone https://github.com/matrenitski/gapfix.net.git
cd gapfix.net
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for production

```bash
npm run build
# Output is in dist/
```

## Deploy to Vercel

1. Fork or clone this repo to your GitHub account.
2. Go to [vercel.com](https://vercel.com) → New Project → import `gapfix.net`.
3. No environment variables needed. Vercel auto-detects the `vercel.json` config.
4. Click **Deploy**.
5. To connect your custom domain: Vercel Dashboard → Domains → add `gapfix.net`.
   Then in Namecheap DNS, add a CNAME record pointing `www` → `cname.vercel-dns.com`
   and an A record pointing `@` → `76.76.21.21`.

## Architecture

```
src/
  bitcoin.js   — HD key parsing and address derivation (@scure/bip32)
  api.js       — Blockstream API calls, gap analysis algorithm
  main.js      — UI logic, scan orchestration
  style.css    — Styling
index.html     — Single-page app shell
vite.config.js — Build config
vercel.json    — Vercel deployment config
```

**Key dependencies:**

| Package | Purpose |
|---|---|
| `@scure/bip32` | BIP32 HD key derivation |
| `@scure/base` | Base58check and bech32 encoding |
| `@noble/hashes` | SHA-256 and RIPEMD-160 |
| `vite` | Build tool / dev server |

All crypto dependencies are from the [noble/scure](https://github.com/paulmillr/noble-hashes) suite — audited, zero-dependency pure JavaScript.

## Security

- **No private keys.** GapFix only needs your extended *public* key (xpub/ypub/zpub), which can derive receive addresses but cannot spend funds.
- **No data collection.** Nothing is sent to any GapFix server — there isn't one. Address lookups go directly to Blockstream's public API.
- **Open source.** Audit the code. Build it yourself. Run it offline if you prefer maximum privacy (only Blockstream API calls require internet).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Some ideas for future improvements:
- [ ] Support for Taproot (P2TR / zpub v2, starts with `bc1p`)
- [ ] Batch address check API (reduce scan time)
- [ ] mempool.space as alternative/fallback API
- [ ] Dark/light theme toggle
- [ ] Downloadable scan report (PDF/CSV)
- [ ] QR code output for dust addresses

## Author

Made by [Max Matrenitski](https://github.com/matrenitski) — open-source Bitcoin tooling.

If GapFix saved your coins, consider giving the repo a ⭐ and sharing it with other Bitcoin users who might be in the same situation.

## License

[MIT](LICENSE) © Max Matrenitski
