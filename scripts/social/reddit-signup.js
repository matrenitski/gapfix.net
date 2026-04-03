/**
 * Create a Reddit account for max@gapfix.net using Playwright.
 * Follows the same persistent-profile pattern as x-post.js.
 *
 * Usage:
 *   REDDIT_PASSWORD=<secret> node scripts/social/reddit-signup.js
 *
 * Outputs credentials to .env.reddit (gitignored).
 * Prints EMAIL_VERIFICATION_REQUIRED if email confirmation is needed.
 */

import { getContext, closeContext, randomDelay, sleep, humanType } from './session.js';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../..');

const EMAIL = 'max@gapfix.net';
const USERNAME_CANDIDATES = ['bitcoin_gap_fix', 'gapfixnet', 'btc_gap_fix', 'gap_fix_btc'];
const ENV_OUT = join(ROOT_DIR, '.env.reddit');

function getPassword() {
  const pw = process.env.REDDIT_PASSWORD;
  if (!pw) throw new Error('REDDIT_PASSWORD env var is required');
  return pw;
}

async function fillSignupForm(page, username, email, password) {
  console.log('[reddit-signup] Navigating to signup page...');
  await page.goto('https://www.reddit.com/register/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(2000, 3000);

  // Step 1: email
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await emailInput.fill(email);
    await randomDelay(500, 1000);
    const continueBtn = page.locator('button[type="submit"]').first();
    await continueBtn.click();
    await randomDelay(1500, 2500);
    console.log('[reddit-signup] Email submitted');
  } else {
    console.log('[reddit-signup] Email step not found — may have redirected to combined form');
  }

  await page.screenshot({ path: 'scripts/social/.debug-reddit-after-email.png' }).catch(() => {});

  // Step 2: username + password
  const usernameInput = page.locator('input[name="username"]');
  await usernameInput.waitFor({ state: 'visible', timeout: 15000 });

  // Try username candidates until one is accepted
  let chosenUsername = null;
  for (const candidate of USERNAME_CANDIDATES) {
    await usernameInput.fill('');
    await humanType(page, candidate, 80);
    await randomDelay(1000, 1500);

    // Check if username is available (Reddit shows error text inline)
    const unavailableMsg = page.locator('text=That username is already taken').first();
    const errorMsg = page.locator('text=Username not available').first();
    if (
      await unavailableMsg.isVisible({ timeout: 2000 }).catch(() => false) ||
      await errorMsg.isVisible({ timeout: 500 }).catch(() => false)
    ) {
      console.log(`[reddit-signup] Username "${candidate}" taken, trying next...`);
      continue;
    }
    chosenUsername = candidate;
    console.log(`[reddit-signup] Username "${chosenUsername}" appears available`);
    break;
  }

  if (!chosenUsername) {
    throw new Error('All username candidates were taken — add more candidates or choose manually');
  }

  // Fill password
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
  await passwordInput.fill('');
  await humanType(page, password, 80);
  await randomDelay(500, 1000);

  await page.screenshot({ path: 'scripts/social/.debug-reddit-before-submit.png' }).catch(() => {});

  // Check for CAPTCHA before submitting
  const captchaFrame = page.frameLocator('iframe[title*="reCAPTCHA"]').first();
  const captchaVisible = await captchaFrame.locator('.recaptcha-checkbox').isVisible({ timeout: 3000 }).catch(() => false);
  if (captchaVisible) {
    console.log('\n[reddit-signup] CAPTCHA detected. Manual action required:');
    console.log('  1. The browser window should be open (re-run with headless=false if needed)');
    console.log('  2. Complete the reCAPTCHA in the browser');
    console.log('  3. Press ENTER here to continue after completing CAPTCHA');
    await waitForEnter();
  }

  // Submit
  const signupBtn = page.locator('button[type="submit"]').first();
  await signupBtn.click();
  await randomDelay(3000, 5000);

  await page.screenshot({ path: 'scripts/social/.debug-reddit-after-submit.png' }).catch(() => {});

  return chosenUsername;
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
    process.stdout.write('\nPress ENTER after completing the CAPTCHA... ');
  });
}

async function signup() {
  const password = getPassword();

  console.log('[reddit-signup] Starting Reddit signup flow...');
  const ctx = await getContext('reddit', { headless: false }); // headless:false so board can handle CAPTCHA
  const { page } = ctx;

  let username = null;
  try {
    username = await fillSignupForm(page, USERNAME_CANDIDATES[0], EMAIL, password);

    // Post-submit: check for email verification prompt
    const currentUrl = page.url().toString();
    const emailVerifyPrompt =
      await page.locator('text=Verify your email').isVisible({ timeout: 5000 }).catch(() => false) ||
      await page.locator('text=check your email').isVisible({ timeout: 1000 }).catch(() => false) ||
      currentUrl.includes('verification');

    if (emailVerifyPrompt) {
      console.log('\nEMAIL_VERIFICATION_REQUIRED');
      console.log('[reddit-signup] Check max@gapfix.net inbox for a verification link from Reddit.');
    }

    // Save credentials
    const envContent = `REDDIT_USERNAME=${username}\nREDDIT_EMAIL=${EMAIL}\nREDDIT_PASSWORD=${password}\n`;
    writeFileSync(ENV_OUT, envContent, { encoding: 'utf8' });
    console.log(`[reddit-signup] Credentials saved to .env.reddit`);

    const success = currentUrl.includes('reddit.com') && !currentUrl.includes('register');
    console.log(`[reddit-signup] ${success ? 'Account created successfully!' : 'Signup may have encountered an issue — check screenshot.'}`);
    console.log(`[reddit-signup] Username: ${username}`);
    return { success, username, emailVerificationRequired: emailVerifyPrompt };
  } catch (err) {
    console.error('[reddit-signup] Failed:', err.message);
    await page.screenshot({ path: 'scripts/social/.debug-reddit-fail.png' }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await closeContext(ctx);
  }
}

signup().then(r => {
  if (!r.success) process.exit(1);
});
