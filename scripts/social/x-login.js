/**
 * X.com manual login helper — opens a browser, waits for board to log in,
 * then saves the session cookies for headless automation.
 *
 * X's bot detection blocks automated credential entry.
 * This script handles that by letting a human do the login once.
 *
 * Usage:
 *   node scripts/social/x-login.js
 *
 * 1. A Chrome window opens at x.com/login
 * 2. Board types credentials and completes any captcha
 * 3. Once logged in (home page loads), script auto-saves the session
 * 4. Window closes — future scripts run headlessly
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getContext, closeContext, sleep } from './session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function login() {
  console.log('[x-login] Opening browser for manual login...');
  console.log('[x-login] Please log in to X.com in the browser window that opens.');
  console.log('[x-login] The window will close automatically once you\'re logged in.\n');

  const ctx = await getContext('x', { headless: false });
  const { context, page } = ctx;

  try {
    await page.goto('https://x.com/login', { waitUntil: 'load', timeout: 30000 });

    console.log('[x-login] Browser is open. Log in manually now...');
    console.log('[x-login] Waiting up to 5 minutes for successful login...\n');

    // Wait until the URL is no longer the login flow
    await page.waitForURL(
      url => {
        const s = url.toString();
        return !s.includes('/i/flow') && !s.includes('/login');
      },
      { timeout: 300000 }
    );

    await sleep(2000);

    // Verify the correct account is logged in
    console.log('[x-login] Verifying account...');
    await page.goto('https://x.com/settings/account', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);

    const pageContent = await page.content();
    const expectedUsername = 'bitcoin_gap_fix';

    if (!pageContent.includes(expectedUsername)) {
      console.error(`[x-login] WRONG ACCOUNT DETECTED!`);
      console.error(`[x-login] Expected @${expectedUsername} but a different account is logged in.`);
      console.error(`[x-login] Please log OUT of all X accounts in this browser, then run this script again and log in as max@gapfix.net`);
      await page.goto('https://x.com/logout', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
      await sleep(2000);
      throw new Error(`Wrong account — expected @${expectedUsername}`);
    }

    console.log(`[x-login] Correct account (@${expectedUsername}) confirmed!`);
    console.log('[x-login] Session saved. Browser closing...');

    // Give a moment for session to fully establish
    await sleep(2000);

  } catch (err) {
    console.error('[x-login] Timed out or error:', err.message);
    console.error('[x-login] Please try running the script again.');
  } finally {
    await closeContext(ctx);
  }
}

login();
