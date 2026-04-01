/**
 * Blockchain API utilities using Blockstream's public API.
 * No API key required. Works for both mainnet and testnet.
 */

const MAINNET_API = 'https://blockstream.info/api';
const TESTNET_API = 'https://blockstream.info/testnet/api';

const BATCH_SIZE = 10;      // concurrent requests per batch
const BATCH_DELAY_MS = 300; // ms between batches to respect rate limits

function getBaseUrl(keyType) {
  return (keyType === 'tpub' || keyType === 'upub' || keyType === 'vpub')
    ? TESTNET_API
    : MAINNET_API;
}

/**
 * Fetch address stats from Blockstream.
 * Returns { txCount, totalReceived } or throws on failure.
 */
async function fetchAddressStats(address, baseUrl, signal) {
  const url = `${baseUrl}/address/${address}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API error ${res.status} for ${address}`);
  const data = await res.json();
  const txCount =
    (data.chain_stats?.tx_count ?? 0) +
    (data.mempool_stats?.tx_count ?? 0);
  const totalReceived =
    (data.chain_stats?.funded_txo_sum ?? 0) +
    (data.mempool_stats?.funded_txo_sum ?? 0);
  return { txCount, totalReceived };
}

/**
 * Fetch stats for a batch of addresses in parallel.
 */
async function fetchBatch(addresses, baseUrl, signal) {
  return Promise.all(
    addresses.map(({ address, chain, index }) =>
      fetchAddressStats(address, baseUrl, signal)
        .then(stats => ({ address, chain, index, ...stats }))
        .catch(() => ({ address, chain, index, txCount: 0, totalReceived: 0, error: true }))
    )
  );
}

/**
 * Sleep utility.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scan an HD wallet for address gap issues.
 *
 * @param {Object} params
 * @param {Function} params.deriveAddressFn - (chain, index) => address string
 * @param {string} params.keyType - key type for API selection
 * @param {number} [params.maxDepth=1000] - max addresses to scan per chain
 * @param {number} [params.gapLimit=20] - standard gap limit
 * @param {Function} [params.onProgress] - progress callback (0–100)
 * @param {AbortSignal} [params.signal] - abort signal
 * @returns {Promise<ScanResult>}
 */
export async function scanWallet({
  deriveAddressFn,
  keyType,
  maxDepth = 1000,
  gapLimit = 20,
  onProgress,
  signal,
}) {
  const baseUrl = getBaseUrl(keyType);
  const chains = [0, 1]; // 0=external, 1=change
  const results = { external: [], change: [] };
  const totalWork = maxDepth * chains.length;
  let doneWork = 0;

  for (const chain of chains) {
    const chainKey = chain === 0 ? 'external' : 'change';
    const usedAddresses = []; // { address, index, totalReceived }
    let gapCount = 0;

    let i = 0;
    while (i < maxDepth) {
      // Build batch
      const batchAddrs = [];
      for (let b = 0; b < BATCH_SIZE && i + b < maxDepth; b++) {
        const idx = i + b;
        batchAddrs.push({ address: deriveAddressFn(chain, idx), chain, index: idx });
      }

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const batchResults = await fetchBatch(batchAddrs, baseUrl, signal);

      for (const r of batchResults) {
        doneWork++;
        if (onProgress) onProgress(Math.round((doneWork / totalWork) * 100));

        if (r.txCount > 0) {
          usedAddresses.push({ address: r.address, index: r.index, totalReceived: r.totalReceived });
          gapCount = 0;
        } else {
          gapCount++;
        }
      }

      i += BATCH_SIZE;

      // If the last BATCH_SIZE addresses were all unused, check if gap >= limit
      // We need to continue scanning beyond the gap limit to find hidden funds,
      // but we stop only when we've seen maxDepth or consistent empty run
      if (gapCount >= maxDepth - i + BATCH_SIZE) break; // all remaining would be past limit
      if (i < maxDepth) await sleep(BATCH_DELAY_MS);
    }

    results[chainKey] = usedAddresses;
  }

  return analyzeResults(results, gapLimit);
}

/**
 * Analyze scan results to find gaps and hidden funds.
 */
function analyzeResults(results, gapLimit) {
  const issues = [];

  for (const [chainName, usedAddresses] of Object.entries(results)) {
    if (usedAddresses.length === 0) continue;

    // Sort by index
    usedAddresses.sort((a, b) => a.index - b.index);

    // Find gaps >= gapLimit between consecutive used addresses
    for (let i = 1; i < usedAddresses.length; i++) {
      const prev = usedAddresses[i - 1];
      const curr = usedAddresses[i];
      const gap = curr.index - prev.index - 1;

      if (gap >= gapLimit) {
        // Addresses from (prev.index+1) to (curr.index-1) are empty gap
        const gapAddresses = [];
        // We only need the first gapLimit of them to "fill" the gap
        for (let g = prev.index + 1; g < curr.index && gapAddresses.length < gapLimit; g++) {
          gapAddresses.push(g);
        }
        issues.push({
          chain: chainName,
          hiddenAddress: curr.address,
          hiddenIndex: curr.index,
          hiddenAmount: curr.totalReceived,
          prevUsedIndex: prev.index,
          gapSize: gap,
          dustIndexes: gapAddresses,
        });
      }
    }

    // Check if the very first used address is beyond the gap limit
    // (wallet starting from 0 would never reach it)
    if (usedAddresses[0].index >= gapLimit) {
      const dustIndexes = [];
      for (let g = 0; g < usedAddresses[0].index && dustIndexes.length < gapLimit; g++) {
        dustIndexes.push(g);
      }
      issues.unshift({
        chain: chainName,
        hiddenAddress: usedAddresses[0].address,
        hiddenIndex: usedAddresses[0].index,
        hiddenAmount: usedAddresses[0].totalReceived,
        prevUsedIndex: -1,
        gapSize: usedAddresses[0].index,
        dustIndexes,
      });
    }
  }

  return { issues, hasIssues: issues.length > 0 };
}
