# GapFix

**Recover Bitcoin stuck beyond the HD wallet address gap limit.**

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Live Site](https://img.shields.io/badge/Live-gapfix.net-f7931a)](https://gapfix.net)

GapFix is a free, open-source, client-side tool that scans your Bitcoin HD wallet up to 1 000 addresses deep, finds any UTXOs hidden beyond the 20-address gap limit, and tells you exactly which addresses to "dust" to make your wallet see everything again.

**No seed phrase required. No server. Runs entirely in your browser.**

Supports all major address formats: **legacy** (P2PKH / `1…`), **wrapped segwit** (P2SH-P2WPKH / `3…`), **native segwit** (P2WPKH / `bc1q…`), and **Taproot** (P2TR / `bc1p…`).

---

## The Problem

Bitcoin HD wallets generate addresses sequentially (index 0, 1, 2, …). To find all your funds, they scan forward but **stop after 20 consecutive unused addresses**. This is called the *gap limit*.

If Bitcoin was ever sent to an address at index 21 or higher — because you generated many receive addresses before they were used, or you moved between wallets/apps with different derivation settings — your wallet stops scanning before it reaches those funds. The balance shows ₿0. The funds are still there. They are just beyond the gap.

## The Fix

Send a tiny "dust" amount (294–546 sats, roughly pennies) to each empty address inside the gap. Once those addresses have a transaction, your wallet's scanner continues past them and discovers the hidden funds on the next rescan.

## How to Use

1. **Find your extended public key** in your wallet (see the table below).
2. **Open [gapfix.net](https://gapfix.net)** — no installation needed.
3. **Paste your xpub/ypub/zpub** and click **Scan**.
4. *(Optional)* Enable **multi-format scan** to also check Taproot (`bc1p…`) and other address formats derived from the same key.
5. GapFix shows any UTXOs hidden beyond the gap and generates a copy-paste dust address list.
6. **Send dust** to those addresses using your wallet.
7. **Rescan** your wallet — the hidden funds should now appear.

## Supported Wallets

| Wallet | Where to find your extended public key |
|---|---|
| Electrum | Wallet → Information → Master Public Key |
| Ledger Live | Account → Edit → Advanced → Extended public key |
| Trezor Suite | Account → Details → Public key (XPUB) |
| Sparrow | Settings → Keystore → Master Public Key |
| Coldcard | Advanced/Tools → View Identity → XPUB |

Works with any BIP32/BIP44/BIP49/BIP84/BIP86 compliant wallet.

## Features

- ✅ Supports **xpub** (P2PKH legacy `1…`), **ypub** (P2SH-P2WPKH `3…`), **zpub** (P2WPKH `bc1q…`), and **Taproot P2TR** (`bc1p…`)
- ✅ **Multi-format scan** — scan all address types from a single key in one pass (BIP44/49/84/86)
- ✅ Scans up to **1 000 external + 1 000 change addresses**
- ✅ Detects **all gap limit violations**, not just the first one
- ✅ Generates a copy-paste **dust address list** for batch sending
- ✅ Uses [Blockstream's public API](https://blockstream.info) — no API key needed
- ✅ Testnet support (tpub, upub, vpub, and testnet P2TR)
- ✅ 100% client-side — your key never leaves your browser

## Security

- **No private keys.** GapFix only needs your extended *public* key (xpub/ypub/zpub), which can derive receive addresses but cannot spend funds.
- **No data collection.** Nothing is sent to any GapFix server — there is not one. Address lookups go directly to Blockstream's public API.
- **Open source.** Audit the code. Build it yourself. Run it offline if you prefer maximum privacy (only Blockstream API calls require internet).
- **Taproot safe.** P2TR address derivation uses BIP341-compliant TapTweak computation entirely in-browser.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Some ideas for future improvements:
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

