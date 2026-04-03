/**
 * Blockchain API utilities using Blockstream's public API.
 * No API key required. Works for both mainnet and testnet.
 */

const MAINNET_API = 'https://blockstream.info/api';
const TESTNET_API = 'https://blockstream.info/testnet/api';

const BATCH_SIZE = 10;      // concurrent requests per batch
const BATCH_DELAY_MS = 300; // ms between batches to respect rate limits

function getBaseUrl(keyType) {
  return (keyType === 'tpub' || keyType === 'upub' || keyType === 'vpub' || keyType === 'p2tr-test')
    ? TESTNET_API
    : MAINNET_API;
}

/**
 * Fetch address stats from Blockstream.
 * Returns { txCount, received, spent, balance } or throws on failure.
 */
async function fetchAddressStats(address, baseUrl, signal) {
  const url = `${baseUrl}/address/${address}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API error ${res.status} for ${address}`);
  const data = await res.json();
  const txCount =
    (data.chain_stats?.tx_count ?? 0) +
    (data.mempool_stats?.tx_count ?? 0);
  const received =
    (data.chain_stats?.funded_txo_sum ?? 0) +
    (data.mempool_stats?.funded_txo_sum ?? 0);
  const spent =
    (data.chain_stats?.spent_txo_sum ?? 0) +
    (data.mempool_stats?.spent_txo_sum ?? 0);
  return { txCount, received, spent, balance: received - spent };
}

/**
 * Fetch stats for a batch of address items in parallel.
 * Each item should have at least { address }; all fields are passed through.
 */
async function fetchBatch(items, baseUrl, signal) {
  return Promise.all(
    items.map(item =>
      fetchAddressStats(item.address, baseUrl, signal)
        .then(stats => ({ ...item, ...stats }))
        .catch(() => ({ ...item, txCount: 0, received: 0, spent: 0, balance: 0, error: true }))
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
 * @param {Function} [params.deriveAddressFn] - legacy: (chain, index) => address string
 * @param {Array}    [params.deriveAddressFns] - new: array of { fn, type, bip }
 * @param {string}   params.keyType - key type for API selection
 * @param {number}   [params.maxDepth=1000] - max addresses to scan per chain
 * @param {number}   [params.gapLimit=20] - standard gap limit
 * @param {Function} [params.onProgress] - progress callback
 * @param {AbortSignal} [params.signal] - abort signal
 * @returns {Promise<ScanResult>}
 */
export async function scanWallet({
  deriveAddressFn,
  deriveAddressFns,
  keyType,
  maxDepth = 1000,
  gapLimit = 20,
  onProgress,
  signal,
}) {
  // Normalize to array format
  const formats = deriveAddressFns || (deriveAddressFn
    ? [{ fn: deriveAddressFn, type: 'primary', bip: null }]
    : []);

  const baseUrl = getBaseUrl(keyType);
  const chains = [0, 1]; // 0=external, 1=change
  const results = { external: [], change: [] };
  const addressLog = []; // all scanned addresses
  let doneWork = 0;
  let batchErrors = 0;
  let totalReceivedAll = 0;
  let totalSpentAll = 0;
  let activeAddressCount = 0;

  for (let chainIdx = 0; chainIdx < chains.length; chainIdx++) {
    const chain = chains[chainIdx];
    const chainKey = chain === 0 ? 'external' : 'change';
    const chainLabel = chain === 0 ? 'external' : 'change';
    const usedAddresses = [];
    let lastUsedIndex = -1;

    // Dynamic depth: at least maxDepth, or lastUsedIndex + 1000 rounded up to next 1000 boundary
    const effectiveDepth = () =>
      lastUsedIndex < 0
        ? maxDepth
        : Math.max(Math.ceil((lastUsedIndex + 1000) / 1000) * 1000, maxDepth);

    let i = 0;
    while (i < effectiveDepth()) {
      // Capture depth at batch start so building and processing use the same bound
      const currentDepth = effectiveDepth();

      // Build batch: BATCH_SIZE indices, all formats per index
      const batchItems = [];
      for (let b = 0; b < BATCH_SIZE && i + b < currentDepth; b++) {
        const idx = i + b;
        for (const fmt of formats) {
          const bipPath = fmt.bip != null
            ? `m/${fmt.bip}'/0'/0'/${chain}/${idx}`
            : `m/${chain}/${idx}`;
          batchItems.push({
            address: fmt.fn(chain, idx),
            chain,
            index: idx,
            addressType: fmt.type,
            bip: fmt.bip,
            derivationPath: bipPath,
          });
        }
      }

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const batchResults = await fetchBatch(batchItems, baseUrl, signal);

      // Group results by index
      const byIndex = new Map();
      for (const r of batchResults) {
        if (!byIndex.has(r.index)) byIndex.set(r.index, []);
        byIndex.get(r.index).push(r);
      }

      // Process each index in order
      for (let b = 0; b < BATCH_SIZE && i + b < currentDepth; b++) {
        const idx = i + b;
        const indexResults = byIndex.get(idx) || [];
        doneWork++;

        let hasActivity = false;

        for (const r of indexResults) {
          if (r.error) batchErrors++;

          addressLog.push({
            address: r.address,
            chain,
            chainLabel,
            index: idx,
            addressType: r.addressType,
            bip: r.bip,
            derivationPath: r.derivationPath,
            txCount: r.txCount,
            received: r.received,
            spent: r.spent,
            balance: r.balance,
            error: r.error || false,
          });

          if (r.txCount > 0 && !r.error) {
            hasActivity = true;
            totalReceivedAll += r.received;
            totalSpentAll += r.spent;
            usedAddresses.push({
              address: r.address,
              index: idx,
              totalReceived: r.received,
            });
          }
        }

        if (hasActivity) {
          lastUsedIndex = Math.max(lastUsedIndex, idx);
          activeAddressCount++;
        }

        if (onProgress) {
          const depth = effectiveDepth();
          const chainProgress = Math.min(i + BATCH_SIZE, depth) / depth;
          const overallProgress = (chainIdx + chainProgress) / chains.length;
          onProgress({
            pct: Math.min(99, Math.round(overallProgress * 100)),
            address: indexResults[0]?.address || '',
            totalReceived: totalReceivedAll,
            checkedCount: doneWork,
            currentPath: indexResults[0]?.derivationPath || '',
            recentEntries: indexResults,
          });
        }
      }

      i += BATCH_SIZE;

      if (i < effectiveDepth()) await sleep(BATCH_DELAY_MS);
    }

    results[chainKey] = usedAddresses;
  }

  return {
    ...analyzeResults(results, gapLimit),
    batchErrors,
    scanSummary: {
      totalChecked: doneWork,
      totalReceived: totalReceivedAll,
      totalSent: totalSpentAll,
      totalBalance: totalReceivedAll - totalSpentAll,
      activeAddressCount,
    },
    addressLog,
  };
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
