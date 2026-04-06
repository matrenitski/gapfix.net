/**
 * Create a Bitcointalk account for max@gapfix.net using Playwright.
 * Follows the same persistent-profile pattern as x-post.js.
 *
 * Usage:
 *   BITCOINTALK_PASSWORD=<secret> node scripts/social/bitcointalk-signup.js
 *
 * Session stored in .sessions/profiles/bitcointalk/ (gitignored).
 * Prints EMAIL_VERIFICATION_REQUIRED if email confirmation is needed.
 */

import { getContext, closeContext, randomDelay, sleep, humanType } from './session.js';
import { promptAndWait } from '../telegram-wait-reply.mjs';
import { randomBytes } from 'crypto';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EMAIL = 'max@gapfix.net';
const USERNAME_CANDIDATES = ['bitcoin_gap_fix', 'gapfixnet', 'btc_gap_fix', 'gap_fix_btc', 'gapfix_max'];

function getPassword() {
  const pw = process.env.BITCOINTALK_PASSWORD;
  if (!pw) throw new Error('BITCOINTALK_PASSWORD env var is required');
  return pw;
}

function waitForEnter(msg) {
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
    process.stdout.write(`\n${msg}\nPress ENTER to continue... `);
  });
}

async function signup() {
  const password = getPassword();

  console.log('[bitcointalk-signup] Starting Bitcointalk signup flow...');
  // Use headless:false so board can handle CAPTCHA/manual verification
  const ctx = await getContext('bitcointalk', { headless: false });
  const { page } = ctx;

  try {
    await page.goto('https://bitcointalk.org/index.php?action=register', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await randomDelay(2000, 3000);

    // Accept terms if present
    const agreeBtn = page.locator('input[name="regSubmit2"]').or(page.locator('input[value="I Agree"]')).first();
    if (await agreeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await agreeBtn.click();
      await randomDelay(1500, 2500);
      console.log('[bitcointalk-signup] Accepted registration terms');
    }

    await page.screenshot({ path: 'scripts/social/.debug-bt-after-agree.png' }).catch(() => {});

    // Fill username
    let chosenUsername = null;
    for (const candidate of USERNAME_CANDIDATES) {
      const userInput = page.locator('input[name="user"]').first();
      await userInput.waitFor({ state: 'visible', timeout: 10000 });
      await userInput.fill('');
      await humanType(page, candidate, 80);
      await randomDelay(800, 1200);
      chosenUsername = candidate;
      break; // Bitcointalk doesn't do live availability checks; pick first candidate
    }

    // Fill email (twice)
    const emailInput = page.locator('input[name="email"]').first();
    await emailInput.fill(EMAIL);
    await randomDelay(300, 600);

    const email2Input = page.locator('input[name="email2"]').first();
    if (await email2Input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await email2Input.fill(EMAIL);
      await randomDelay(300, 600);
    }

    // Fill password (twice)
    const passInput = page.locator('input[name="passwrd1"]').first();
    await passInput.fill('');
    await humanType(page, password, 80);
    await randomDelay(400, 800);

    const pass2Input = page.locator('input[name="passwrd2"]').first();
    if (await pass2Input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pass2Input.fill('');
      await humanType(page, password, 80);
      await randomDelay(400, 800);
    }

    await page.screenshot({ path: 'scripts/social/.debug-bt-before-captcha.png' }).catch(() => {});

    // Bitcointalk uses a visual CAPTCHA — always notify via Telegram since CAPTCHA is required
    // (Detection by any CAPTCHA-related input or the known verification section)
    const hasCaptcha = await page.locator('input[name="verificationcode"], input[id*="captcha"], img[id="captcha"], table:has(td:has-text("Visual verification"))').first()
      .waitFor({ state: 'attached', timeout: 5000 }).then(() => true).catch(() => false);
    if (hasCaptcha) {
      console.log('\n[bitcointalk-signup] CAPTCHA detected. Notifying board via Telegram…');
      await promptAndWait(
        'Bitcointalk signup CAPTCHA — a browser window is open on your screen. Please:\n' +
        '1. Look at the CAPTCHA image in the browser\n' +
        '2. Type the CAPTCHA code into the verification field\n' +
        '3. Reply here with "done" when complete'
      );
    }

    await page.screenshot({ path: 'scripts/social/.debug-bt-before-submit.png' }).catch(() => {});

    // Submit registration
    const submitBtn = page.locator('input[type="submit"][name="regSubmit"]').or(page.locator('input[value="Register"]')).first();
    await submitBtn.click();
    await randomDelay(3000, 5000);

    await page.screenshot({ path: 'scripts/social/.debug-bt-after-submit.png' }).catch(() => {});

    const currentUrl = page.url().toString();
    const pageText = await page.textContent('body').catch(() => '');

    const emailVerifyRequired =
      pageText.toLowerCase().includes('verification') ||
      pageText.toLowerCase().includes('check your email') ||
      pageText.toLowerCase().includes('activate');

    if (emailVerifyRequired) {
      console.log('\nEMAIL_VERIFICATION_REQUIRED');
      console.log('[bitcointalk-signup] Check max@gapfix.net inbox for an activation link from Bitcointalk.');
    }

    const usernameError =
      pageText.toLowerCase().includes('username is already') ||
      pageText.toLowerCase().includes('name is taken');
    if (usernameError) {
      console.error(`[bitcointalk-signup] Username "${chosenUsername}" was rejected — try a different one.`);
      return { success: false, error: 'username_taken' };
    }

    const success = !pageText.toLowerCase().includes('error') && (
      emailVerifyRequired || pageText.toLowerCase().includes('thank you') || currentUrl.includes('index.php')
    );

    console.log(`[bitcointalk-signup] ${success ? 'Registration submitted successfully!' : 'Check screenshots for errors.'}`);
    console.log(`[bitcointalk-signup] Username: ${chosenUsername}`);
    console.log('[bitcointalk-signup] Session profile saved to .sessions/profiles/bitcointalk/');

    return { success, username: chosenUsername, emailVerificationRequired: emailVerifyRequired };
  } catch (err) {
    console.error('[bitcointalk-signup] Failed:', err.message);
    await page.screenshot({ path: 'scripts/social/.debug-bt-fail.png' }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await closeContext(ctx);
  }
}

signup().then(r => {
  if (!r.success) process.exit(1);
});
