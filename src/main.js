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
  const key = xpubInput.value.trim();
  if (!key) {
    showError('Please paste your xpub, ypub, or zpub key.');
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

  clearError();
  setScanning(true);
  setProgress(0, 'Deriving addresses…');

  abortController = new AbortController();

  try {
    const { issues, hasIssues, batchErrors } = await scanWallet({
      deriveAddressFn: (chain, index) => deriveAddress(parsed.hd, chain, index, parsed.type),
      keyType: parsed.type,
      maxDepth: 1000,
      gapLimit: 20,
      onProgress: (pct) => setProgress(pct, `Scanning addresses… ${pct}%`),
      signal: abortController.signal,
    });

    if (batchErrors > 0) {
      showError(`Warning: ${batchErrors} address lookup${batchErrors > 1 ? 's' : ''} failed (rate limit or network error). Results may be incomplete — try scanning again.`);
    }

    showResults(issues, hasIssues, parsed);
  } catch (err) {
    if (err.name === 'AbortError') {
      hideProgress();
      hideResults();
    } else {
      showError(`Scan failed: ${err.message}`);
      hideProgress();
    }
  } finally {
    setScanning(false);
    abortController = null;
  }
}

function cancelScan() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

// ---- UI helpers ----

function setScanning(active) {
  scanBtn.disabled = active;
  scanBtn.textContent = active ? 'Scanning…' : 'Scan for Gap Issues';
  cancelBtn.style.display = active ? 'inline-flex' : 'none';
  if (active) {
    progressSection.classList.add('visible');
    hideResults();
  } else {
    progressSection.classList.remove('visible');
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

function showResults(issues, hasIssues, parsed) {
  resultsContainer.innerHTML = '';

  if (!hasIssues) {
    const ok = document.createElement('div');
    ok.className = 'result-ok';
    ok.innerHTML = `
      <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
      </svg>
      <span>No gap limit issues found! All funds are within the 20-address gap limit and should be visible to your wallet.</span>
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

  resultsSection.classList.add('visible');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderIssue(issue, parsed) {
  const chainLabel = issue.chain === 'external' ? 'External (receiving)' : 'Change (internal)';
  const dustAddresses = issue.dustIndexes.map(
    idx => deriveAddress(parsed.hd, issue.chain === 'external' ? 0 : 1, idx, parsed.type)
  );
  const dustAmount = parsed.type === 'zpub' || parsed.type === 'vpub' ? 294 : 546;

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
