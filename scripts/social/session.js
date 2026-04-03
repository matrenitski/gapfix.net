/**
 * Browser session manager — handles persistent login for social media automation.
 * Uses Playwright persistent context so login/cookies survive across runs.
 *
 * Usage:
 *   import { getContext, closeContext } from './session.js';
 *   const { browser, context, page } = await getContext('x');
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(__dirname, '../../.sessions');

function sessionPath(service) {
  return join(SESSIONS_DIR, `${service}.json`);
}

/**
 * Launch a browser context with saved cookies for the given service.
 * If no session exists, launches a fresh context (user must log in manually).
 */
export async function getContext(service, { headless = true } = {}) {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  // Load saved cookies/storage if they exist
  const sessFile = sessionPath(service);
  if (existsSync(sessFile)) {
    const state = JSON.parse(readFileSync(sessFile, 'utf8'));
    if (state.cookies) await context.addCookies(state.cookies);
  }

  const page = await context.newPage();

  return { browser, context, page };
}

/**
 * Save current session cookies so the next run can reuse them.
 */
export async function saveSession(service, context) {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
  const cookies = await context.cookies();
  writeFileSync(sessionPath(service), JSON.stringify({ cookies }, null, 2));
  console.log(`[session] Saved ${service} session (${cookies.length} cookies)`);
}

/**
 * Human-like delay to avoid detection.
 */
export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function randomDelay(minMs = 1000, maxMs = 3000) {
  return sleep(Math.floor(Math.random() * (maxMs - minMs) + minMs));
}
