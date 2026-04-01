/**
 * Bitcoin HD wallet address derivation utilities.
 * Supports xpub (P2PKH), ypub (P2SH-P2WPKH), and zpub (P2WPKH / bech32).
 */

import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha2';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { base58check, bech32 } from '@scure/base';

// BIP32 version bytes for different key types
const VERSIONS = {
  xpub: { private: 0x0488ADE4, public: 0x0488B21E },
  ypub: { private: 0x049D7784, public: 0x049D7CB2 },
  zpub: { private: 0x04B2430C, public: 0x04B24746 },
  tpub: { private: 0x04358394, public: 0x043587CF },
  upub: { private: 0x044A4E28, public: 0x044A5262 },
  vpub: { private: 0x045F18BC, public: 0x045F1CF6 },
};

const b58c = base58check(sha256);

/**
 * hash160: SHA256 followed by RIPEMD160.
 */
function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

/**
 * P2PKH address (legacy, starts with "1").
 */
function toP2PKH(pubkey) {
  const h = hash160(pubkey);
  const payload = new Uint8Array(21);
  payload[0] = 0x00; // mainnet P2PKH version
  payload.set(h, 1);
  return b58c.encode(payload);
}

/**
 * P2SH-P2WPKH address (segwit-wrapped, starts with "3").
 */
function toP2SHP2WPKH(pubkey) {
  const h = hash160(pubkey);
  // redeemScript = OP_0 <20-byte-hash>
  const redeemScript = new Uint8Array(22);
  redeemScript[0] = 0x00; // OP_0
  redeemScript[1] = 0x14; // PUSH 20 bytes
  redeemScript.set(h, 2);
  const scriptHash = hash160(redeemScript);
  const payload = new Uint8Array(21);
  payload[0] = 0x05; // mainnet P2SH version
  payload.set(scriptHash, 1);
  return b58c.encode(payload);
}

/**
 * P2WPKH address (native segwit bech32, starts with "bc1q").
 */
function toP2WPKH(pubkey) {
  const h = hash160(pubkey);
  const words = bech32.toWords(h);
  return bech32.encode('bc', [0, ...words]);
}

/**
 * Detect key type from the prefix characters.
 */
export function detectKeyType(key) {
  const prefix = key.slice(0, 4).toLowerCase();
  if (prefix === 'xpub' || prefix === 'tpub') return prefix;
  if (prefix === 'ypub' || prefix === 'upub') return prefix;
  if (prefix === 'zpub' || prefix === 'vpub') return prefix;
  throw new Error(`Unrecognized key prefix: "${key.slice(0, 4)}". Expected xpub, ypub, or zpub.`);
}

/**
 * Parse an extended public key string into an HDKey instance.
 */
export function parseExtendedKey(key) {
  const type = detectKeyType(key);
  const versions = VERSIONS[type];
  if (!versions) throw new Error(`Unsupported key type: ${type}`);
  const hd = HDKey.fromExtendedKey(key, versions);
  return { hd, type };
}

/**
 * Derive a Bitcoin address from an HDKey at the given chain and index.
 * @param {HDKey} hd - The HD key (account-level xpub)
 * @param {number} chain - 0 = external, 1 = internal (change)
 * @param {number} index - Address index
 * @param {string} type - 'xpub'|'ypub'|'zpub'|'tpub'|'upub'|'vpub'
 * @returns {string} Bitcoin address
 */
export function deriveAddress(hd, chain, index, type) {
  const child = hd.derive(`m/${chain}/${index}`);
  if (!child.publicKey) throw new Error(`Failed to derive key at m/${chain}/${index}`);
  const pubkey = child.publicKey;
  const isTestnet = type === 'tpub' || type === 'upub' || type === 'vpub';

  if (type === 'xpub' || type === 'tpub') {
    if (isTestnet) {
      // testnet P2PKH
      const h = hash160(pubkey);
      const payload = new Uint8Array(21);
      payload[0] = 0x6F;
      payload.set(h, 1);
      return b58c.encode(payload);
    }
    return toP2PKH(pubkey);
  }
  if (type === 'ypub' || type === 'upub') {
    if (isTestnet) {
      const h = hash160(pubkey);
      const redeemScript = new Uint8Array(22);
      redeemScript[0] = 0x00;
      redeemScript[1] = 0x14;
      redeemScript.set(h, 2);
      const scriptHash = hash160(redeemScript);
      const payload = new Uint8Array(21);
      payload[0] = 0xC4; // testnet P2SH
      payload.set(scriptHash, 1);
      return b58c.encode(payload);
    }
    return toP2SHP2WPKH(pubkey);
  }
  if (type === 'zpub' || type === 'vpub') {
    const h = hash160(pubkey);
    const words = bech32.toWords(h);
    const hrp = isTestnet ? 'tb' : 'bc';
    return bech32.encode(hrp, [0, ...words]);
  }
  throw new Error(`Unknown key type: ${type}`);
}
