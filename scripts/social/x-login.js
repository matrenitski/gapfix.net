/**
 * X.com login script — run this ONCE manually to establish a session.
 * Launches a visible browser, logs in, saves cookies.
 * Subsequent automation scripts use the saved session (no re-login needed).
 *
 * Usage:
 *   node scripts/social/x-login.js
 *
 * Requires in .env:
 *   X_USERNAME=bitcoin_gap_fix
 *   X_EMAIL=max@gapfix.net
 *   X_PASSWORD=your_password_here
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getContext, saveSession, sleep, randomDelay } from './session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dep needed)
function loadEnv() {
  const envPath = join(__dirname, '../../.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

async function login() {
  const env = loadEnv();
  const username = env.X_USERNAME || 'bitcoin_gap_fix';
  const email = env.X_EMAIL || 'max@gapfix.net';
  const password = env.X_PASSWORD;

  if (!password) {
    console.error('ERROR: X_PASSWORD not set in .env');
    process.exit(1);
  }

  console.log('[x-login] Launching browser (visible)...');
  const { browser, context, page } = await getContext('x', { headless: false });

  try {
    await page.goto('https://x.com/login', { waitUntil: 'networkidle' });
    await randomDelay(1000, 2000);

    // Enter username/email
    const usernameInput = page.locator('input[autocomplete="username"]');
    await usernameInput.waitFor({ timeout: 15000 });
    await usernameInput.fill(email);
    await randomDelay(500, 1000);

    await page.keyboard.press('Enter');
    await randomDelay(1500, 2500);

    // X sometimes asks for username after email — handle it
    const maybeUsernameVerify = page.locator('input[data-testid="ocfEnterTextTextInput"]');
    if (await maybeUsernameVerify.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[x-login] Username verification step detected');
      await maybeUsernameVerify.fill(username);
      await page.keyboard.press('Enter');
      await randomDelay(1000, 2000);
    }

    // Enter password
    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.waitFor({ timeout: 15000 });
    await passwordInput.fill(password);
    await randomDelay(500, 1000);

    await page.keyboard.press('Enter');
    await randomDelay(3000, 5000);

    // Wait for home feed
    await page.waitForURL('**/home', { timeout: 30000 });
    console.log('[x-login] Logged in successfully!');

    await saveSession('x', context);
  } catch (err) {
    console.error('[x-login] Login failed:', err.message);
    console.log('[x-login] Current URL:', page.url());
    // Keep browser open so user can inspect
    await sleep(10000);
  } finally {
    await browser.close();
  }
}

login();
