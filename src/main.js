/**
 * GapFix – main application entry point.
 */

// Redirect HTTP → HTTPS in production (no-op on localhost/127.0.0.1)
if (
  location.protocol === 'http:' &&
  location.hostname !== 'localhost' &&
  location.hostname !== '127.0.0.1'
) {
  location.replace('https://' + location.host + location.pathname + location.search + location.hash);
}

import './style.css';
import { parseExtendedKey, deriveAddress } from './bitcoin.js';
import { scanWallet } from './api.js';

// ---- DOM refs ----
const xpubInput = document.getElementById('xpub-input');
const scanBtn = document.getElementById('scan-btn');
const cancelBtn = document.getElementById('cancel-btn');
const errorDiv = document.getElementById('error-msg');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressPct = document.getElementById('progress-pct');
const progressAddr = document.getElementById('progress-addr');
const progressChecked = document.getElementById('progress-checked');
const progressBalance = document.getElementById('progress-balance');
const progressBalanceVal = document.getElementById('progress-balance-val');
const extendedBadge = document.getElementById('extended-scan-badge');
const multiFormatToggle = document.getElementById('multi-format-toggle');
const resultsSection = document.getElementById('results-section');
const resultsContainer = document.getElementById('results-container');

// ---- State ----
let abortController = null;

// ---- Event handlers ----

scanBtn.addEventListener('click', startScan);
cancelBtn.addEventListener('click', cancelScan);

xpubInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startScan();
});

// ---- Scan flow ----

async function startScan() {
  if (abortController) return; // MAX-11: prevent concurrent scans

  const key = xpubInput.value.trim();
  if (!key) {
    showError('Please paste your xpub, ypub, zpub, or equivalent testnet key.');
    return;
  }

  // Parse the key first
  let parsed;
  try {
    parsed = parseExtendedKey(key);
  } catch (err) {
    showError(err.message);
    return;
  }

  const multiFormat = multiFormatToggle ? multiFormatToggle.checked : false;

  clearError();
  setScanning(true, multiFormat);
  setProgress(0, 'Deriving addresses…');

  abortController = new AbortController();

  try {
    const { issues, hasIssues, batchErrors, scanSummary, addressLog } = await scanWallet({
      deriveAddressFns: buildDeriveAddressFns(parsed, multiFormat),
      keyType: parsed.type,
      maxDepth: 1000,
      gapLimit: 20,
      onProgress: ({ pct, address, totalReceived, checkedCount }) => {
        setProgress(pct, `Scanning addresses… ${pct}%`);
        updateLiveStats(address, totalReceived, checkedCount);
      },
      signal: abortController.signal,
    });

    if (batchErrors > 0) {
      showError(`Warning: ${batchErrors} address lookup${batchErrors > 1 ? 's' : ''} failed (rate limit or network error). Results may be incomplete — try scanning again.`);
    }

    showResults(issues, hasIssues, parsed, scanSummary, addressLog, multiFormat);
  } catch (err) {
    if (err.name === 'AbortError') {
      hideProgress();
      hideResults();
    } else {
      showError(`Scan failed: ${err.message}`);
      hideProgress();
      hideResults(); // MAX-12: clear stale results on scan failure
    }
  } finally {
    setScanning(false, false);
    abortController = null;
  }
}

function cancelScan() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

// ---- Derivation helpers ----

function buildDeriveAddressFns(parsed, multiFormat) {
  const isTestnet = ['tpub', 'upub', 'vpub'].includes(parsed.type);

  const allFormats = isTestnet
    ? [
        { keyType: 'tpub', type: 'P2PKH', bip: 44 },
        { keyType: 'upub', type: 'P2SH-P2WPKH', bip: 49 },
        { keyType: 'vpub', type: 'P2WPKH', bip: 84 },
        { keyType: 'p2tr-test', type: 'P2TR', bip: 86 },
      ]
    : [
        { keyType: 'xpub', type: 'P2PKH', bip: 44 },
        { keyType: 'ypub', type: 'P2SH-P2WPKH', bip: 49 },
        { keyType: 'zpub', type: 'P2WPKH', bip: 84 },
        { keyType: 'p2tr', type: 'P2TR', bip: 86 },
      ];

  const primaryFmt = allFormats.find(f => f.keyType === parsed.type) || allFormats[2];

  const fns = [{
    fn: (chain, idx) => deriveAddress(parsed.hd, chain, idx, primaryFmt.keyType),
    type: primaryFmt.type,
    bip: primaryFmt.bip,
  }];

  if (multiFormat) {
    for (const fmt of allFormats) {
      if (fmt.keyType !== primaryFmt.keyType) {
        fns.push({
          fn: (chain, idx) => deriveAddress(parsed.hd, chain, idx, fmt.keyType),
          type: fmt.type,
          bip: fmt.bip,
        });
      }
    }
  }

  return fns;
}

function getBlockstreamBaseUrl(keyType) {
  return ['tpub', 'upub', 'vpub', 'p2tr-test'].includes(keyType)
    ? 'https://blockstream.info/testnet/api'
    : 'https://blockstream.info/api';
}

// ---- UI helpers ----

function setScanning(active, multiFormat) {
  scanBtn.disabled = active;
  scanBtn.textContent = active ? 'Scanning…' : 'Scan for Gap Issues';
  cancelBtn.style.display = active ? 'inline-flex' : 'none';
  if (extendedBadge) extendedBadge.style.display = (active && multiFormat) ? 'inline-flex' : 'none';
  if (active) {
    progressSection.classList.add('visible');
    hideResults();
    resetLiveStats();
  } else {
    progressSection.classList.remove('visible');
  }
}

function resetLiveStats() {
  progressAddr.textContent = '—';
  progressChecked.textContent = '0 checked';
  progressBalanceVal.textContent = '0';
  progressBalance.style.display = 'none';
}

function updateLiveStats(address, totalReceived, checkedCount) {
  progressAddr.textContent = address;
  progressChecked.textContent = `${checkedCount.toLocaleString()} checked`;
  if (totalReceived > 0) {
    progressBalanceVal.textContent = totalReceived.toLocaleString();
    progressBalance.style.display = 'inline';
  }
}

function hideProgress() {
  progressSection.classList.remove('visible');
}

function setProgress(pct, label) {
  progressBar.style.width = `${pct}%`;
  progressPct.textContent = `${pct}%`;
  progressText.textContent = label || '';
}

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.add('visible');
}

function clearError() {
  errorDiv.classList.remove('visible');
  errorDiv.textContent = '';
}

function hideResults() {
  resultsSection.classList.remove('visible');
  resultsContainer.innerHTML = '';
}

function showResults(issues, hasIssues, parsed, scanSummary, addressLog, multiFormat) {
  resultsContainer.innerHTML = '';

  if (!hasIssues) {
    const ok = document.createElement('div');
    ok.className = 'result-ok';
    const statsLine = scanSummary
      ? `<span class="result-ok-stats">Checked ${scanSummary.totalChecked.toLocaleString()} addresses · ${(scanSummary.activeAddressCount || 0).toLocaleString()} with activity · ${scanSummary.totalReceived.toLocaleString()} sats received · ${(scanSummary.totalSent || 0).toLocaleString()} sats sent · ${(scanSummary.totalBalance || 0).toLocaleString()} sats balance</span>`
      : '';
    ok.innerHTML = `
      <div class="result-ok-body">
        <div class="result-ok-main">
          <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <span>No gap limit issues found! All funds are within the 20-address gap limit and should be visible to your wallet.</span>
        </div>
        ${statsLine}
      </div>
    `;
    resultsContainer.appendChild(ok);
  } else {
    const summary = document.createElement('p');
    summary.style.cssText = 'color: var(--text-muted); font-size:0.9rem; margin-bottom:16px;';
    summary.textContent = `Found ${issues.length} gap issue${issues.length > 1 ? 's' : ''}. Send dust to the addresses below to make your wallet rescan past the gap.`;
    resultsContainer.appendChild(summary);

    for (const issue of issues) {
      resultsContainer.appendChild(renderIssue(issue, parsed));
    }
  }

  // Derivation panel
  resultsContainer.appendChild(renderDerivationPanel(parsed, multiFormat));

  // Address explorer
  if (addressLog && addressLog.length > 0) {
    const baseUrl = getBlockstreamBaseUrl(parsed.type);
    const explorer = renderAddressExplorer(addressLog, baseUrl);
    if (explorer) resultsContainer.appendChild(explorer);
  }

  resultsSection.classList.add('visible');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderIssue(issue, parsed) {
  const chainLabel = issue.chain === 'external' ? 'External (receiving)' : 'Change (internal)';
  const dustAddresses = issue.dustIndexes.map(
    idx => deriveAddress(parsed.hd, issue.chain === 'external' ? 0 : 1, idx, parsed.type)
  );
  const dustAmount = parsed.type === 'zpub' || parsed.type === 'vpub' || parsed.type === 'p2tr' || parsed.type === 'p2tr-test' ? 294 : 546;

  const el = document.createElement('div');
  el.className = 'result-issue';
  el.innerHTML = `
    <h3>
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="m10.29 3.86-8.75 15.14A1 1 0 0 0 2.41 21h17.18a1 1 0 0 0 .87-1.5L11.71 4.36a1 1 0 0 0-1.42-.5z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Gap Issue — ${chainLabel} Chain
    </h3>
    <div class="detail-row">
      <span class="detail-label">Hidden address</span>
      <span class="detail-value">${issue.hiddenAddress}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Address index</span>
      <span class="detail-value">m/…/${issue.chain === 'external' ? '0' : '1'}/${issue.hiddenIndex}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Gap size</span>
      <span class="detail-value">${issue.gapSize} consecutive empty addresses</span>
    </div>
    ${issue.hiddenAmount > 0 ? `
    <div class="detail-row">
      <span class="detail-label">Total received (sats)</span>
      <span class="detail-value" style="color: var(--green)">${issue.hiddenAmount.toLocaleString()} sats</span>
    </div>` : ''}
    <div class="dust-list">
      <h4>Dust these ${dustAddresses.length} addresses (${dustAmount} sats each)</h4>
      ${dustAddresses.map(addr => `
        <div class="dust-item">
          <span class="dust-addr">${addr}</span>
          <span class="dust-amount">${dustAmount} sats</span>
        </div>
      `).join('')}
      <div class="copy-section">
        <button class="btn btn-ghost copy-btn" data-addresses="${dustAddresses.join('\n')}" data-amount="${dustAmount}">
          Copy addresses
        </button>
        <span class="copy-note">Paste into your wallet's "Send to many" or send individually</span>
      </div>
    </div>
  `;

  // Attach copy handler
  const copyBtn = el.querySelector('.copy-btn');
  copyBtn.addEventListener('click', () => {
    const text = dustAddresses.map(a => `${a}\t${dustAmount}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy addresses'; }, 2000);
    });
  });

  return el;
}

// ---- Derivation panel ----

function renderDerivationPanel(parsed, multiFormat) {
  const typeMap = {
    xpub: { bip: 44, name: 'BIP44', addrType: 'P2PKH (legacy)', addrExample: '1…', network: 'mainnet' },
    ypub: { bip: 49, name: 'BIP49', addrType: 'P2SH-P2WPKH (wrapped segwit)', addrExample: '3…', network: 'mainnet' },
    zpub: { bip: 84, name: 'BIP84', addrType: 'P2WPKH (native segwit)', addrExample: 'bc1q…', network: 'mainnet' },
    tpub: { bip: 44, name: 'BIP44', addrType: 'P2PKH (legacy)', addrExample: 'm…', network: 'testnet' },
    upub: { bip: 49, name: 'BIP49', addrType: 'P2SH-P2WPKH (wrapped segwit)', addrExample: '2…', network: 'testnet' },
    vpub: { bip: 84, name: 'BIP84', addrType: 'P2WPKH (native segwit)', addrExample: 'tb1q…', network: 'testnet' },
    'p2tr': { bip: 86, name: 'BIP86', addrType: 'P2TR (taproot)', addrExample: 'bc1p…', network: 'mainnet' },
    'p2tr-test': { bip: 86, name: 'BIP86', addrType: 'P2TR (taproot)', addrExample: 'tb1p…', network: 'testnet' },
  };

  const info = typeMap[parsed.type] || typeMap.xpub;
  const extPath = `m/${info.bip}'/0'/0'/0/N`;
  const intPath = `m/${info.bip}'/0'/0'/1/N`;

  const el = document.createElement('div');
  el.className = 'derivation-panel';
  el.innerHTML = `
    <div class="derivation-panel-title">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      Derivation Scheme
    </div>
    <div class="derivation-panel-body">
      <div class="derivation-row">
        <span class="derivation-label">Standard</span>
        <span class="derivation-value">${info.name} · ${info.addrType} · <code>${info.addrExample}</code> · ${info.network}</span>
      </div>
      <div class="derivation-row">
        <span class="derivation-label">External chain</span>
        <code class="derivation-value">${extPath}</code>
      </div>
      <div class="derivation-row">
        <span class="derivation-label">Change chain</span>
        <code class="derivation-value">${intPath}</code>
      </div>
      ${multiFormat ? `
      <div class="derivation-row">
        <span class="derivation-label">Also scanned</span>
        <span class="derivation-value">P2PKH (m/44'…), P2SH-P2WPKH (m/49'…), P2WPKH (m/84'…), P2TR (m/86'…)</span>
      </div>
      ` : ''}
      <p class="derivation-note">
        Your <code>${parsed.type}</code> key prefix encodes the derivation standard — the address format is fixed.
        External chain (0) = receiving addresses · Change chain (1) = wallet-internal change.
      </p>
    </div>
  `;

  return el;
}

// ---- Address Explorer ----

function renderAddressExplorer(addressLog, baseUrl) {
  if (addressLog.length === 0) return null;

  const activeCount = addressLog.filter(a => a.txCount > 0).length;

  const section = document.createElement('div');
  section.className = 'explorer-section';

  const header = document.createElement('div');
  header.className = 'explorer-header';
  header.innerHTML = `
    <div class="explorer-title-row">
      <h3>Address Explorer</h3>
      <span class="explorer-meta">${addressLog.length.toLocaleString()} scanned · ${activeCount} with activity</span>
    </div>
    <label class="explorer-filter-label">
      <input type="checkbox" class="explorer-filter-cb" />
      <span>Active only</span>
    </label>
  `;
  section.appendChild(header);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'explorer-table-wrap';

  const table = document.createElement('table');
  table.className = 'explorer-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Path</th>
        <th>Address</th>
        <th>Type</th>
        <th>TXs</th>
        <th>Received</th>
        <th>Balance</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  const sentinel = document.createElement('div');
  sentinel.className = 'explorer-sentinel';
  tableWrap.appendChild(sentinel);

  section.appendChild(tableWrap);

  const BATCH = 50;
  let loaded = 0;
  let currentLog = addressLog;
  let loading = false;

  const filterCb = header.querySelector('.explorer-filter-cb');

  function rebuildTable() {
    const activeOnly = filterCb.checked;
    currentLog = activeOnly ? addressLog.filter(a => a.txCount > 0) : addressLog;
    tbody.innerHTML = '';
    loaded = 0;
    sentinel.style.display = '';
    observer.observe(sentinel);
    loadMore();
  }

  function loadMore() {
    if (loading) return;
    loading = true;
    const slice = currentLog.slice(loaded, loaded + BATCH);
    const fragment = document.createDocumentFragment();
    for (const item of slice) {
      fragment.appendChild(createAddressRow(item, baseUrl));
    }
    tbody.appendChild(fragment);
    loaded += slice.length;
    loading = false;
    if (loaded >= currentLog.length) {
      observer.unobserve(sentinel);
      sentinel.style.display = 'none';
    }
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMore();
  }, { threshold: 0.1 });

  observer.observe(sentinel);

  filterCb.addEventListener('change', () => {
    rebuildTable();
  });

  loadMore(); // Initial load

  return section;
}

function createAddressRow(item, baseUrl) {
  const row = document.createElement('tr');
  row.className = item.txCount > 0 ? 'addr-row addr-row--active' : 'addr-row';

  const balanceCls = item.balance > 0 ? 'balance-pos' : item.balance < 0 ? 'balance-neg' : '';
  // Truncate address: first 10 + last 8
  const shortAddr = item.address.length > 22
    ? item.address.slice(0, 10) + '…' + item.address.slice(-8)
    : item.address;

  row.innerHTML = `
    <td class="col-index">${item.index}</td>
    <td class="col-path mono">${item.derivationPath}</td>
    <td class="col-addr mono" title="${item.address}">${shortAddr}</td>
    <td class="col-type">${item.addressType}</td>
    <td class="col-txs">${item.txCount > 0 ? item.txCount : '—'}</td>
    <td class="col-received mono">${item.received > 0 ? item.received.toLocaleString() : '—'}</td>
    <td class="col-balance mono ${balanceCls}">${item.balance !== 0 ? item.balance.toLocaleString() : '—'}</td>
  `;

  if (item.txCount > 0) {
    row.classList.add('addr-row--clickable');
    let detailRow = null;
    let txCache = null;
    let isExpanded = false;

    row.addEventListener('click', async () => {
      if (!detailRow) {
        isExpanded = true;
        detailRow = document.createElement('tr');
        detailRow.className = 'addr-detail-row';
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.className = 'addr-detail-cell';
        cell.innerHTML = '<span class="tx-loading">Loading transactions…</span>';
        detailRow.appendChild(cell);
        row.after(detailRow);
        row.classList.add('addr-row--expanded');

        try {
          const res = await fetch(`${baseUrl}/address/${item.address}/txs`);
          txCache = res.ok ? (await res.json()).slice(0, 25) : [];
        } catch {
          txCache = [];
        }

        const explorerBase = baseUrl.includes('testnet')
          ? 'https://blockstream.info/testnet/tx/'
          : 'https://blockstream.info/tx/';

        if (txCache.length > 0) {
          cell.innerHTML = `<div class="tx-list">${txCache.map(tx =>
            `<a class="tx-link" href="${explorerBase}${tx.txid}" target="_blank" rel="noopener">${tx.txid}</a>`
          ).join('')}</div>`;
        } else {
          cell.innerHTML = '<span class="tx-empty">No transactions found.</span>';
        }
      } else {
        isExpanded = !isExpanded;
        detailRow.style.display = isExpanded ? '' : 'none';
        row.classList.toggle('addr-row--expanded', isExpanded);
      }
    });
  }

  return row;
}

// ---- FAQ accordion ----

document.querySelectorAll('.faq-q').forEach(q => {
  q.addEventListener('click', () => {
    const answer = q.nextElementSibling;
    const isOpen = answer.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('open'));
    document.querySelectorAll('.faq-q').forEach(qq => qq.classList.remove('open'));
    // Toggle clicked
    if (!isOpen) {
      answer.classList.add('open');
      q.classList.add('open');
    }
  });
});

// Hide cancel button initially
cancelBtn.style.display = 'none';
