/**
 * Create a Reddit account for max@gapfix.net using Playwright.
 * Follows the same persistent-profile pattern as x-post.js.
 *
 * Usage:
 *   REDDIT_PASSWORD=<secret> node scripts/social/reddit-signup.js
 *
 * Outputs credentials to .env.reddit (gitignored).
 * Handles the OTP email verification step interactively (prompts for 6-digit code).
 */

import { getContext, closeContext, randomDelay, sleep, humanType } from './session.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promptAndWait } from '../telegram-wait-reply.mjs';

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

async function fillSignupForm(page, email, password) {
  console.log('[reddit-signup] Navigating to signup page...');
  await page.goto('https://www.reddit.com/register/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(2000, 3000);

  // Step 1: email
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await emailInput.click();
    await randomDelay(300, 500);
    // Use evaluate + keyboard to trigger React onChange properly
    await emailInput.evaluate((el, val) => {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, email);
    await randomDelay(1000, 1500);
    await emailInput.press('Enter');
    await randomDelay(2000, 3000);
    console.log('[reddit-signup] Email submitted');
  } else {
    console.log('[reddit-signup] Email step not found — may have redirected to combined form');
  }

  await page.screenshot({ path: 'scripts/social/.debug-reddit-after-email.png' }).catch(() => {});

  // Step 1b: OTP verification — Reddit now sends a 6-digit code to the email
  const otpStep = await page.locator('text=Verify your email').or(page.locator('text=6-digit code')).isVisible({ timeout: 5000 }).catch(() => false);
  if (otpStep) {
    console.log('\n[reddit-signup] EMAIL OTP REQUIRED');
    console.log('[reddit-signup] Requesting OTP from board via Telegram…');
    const otpCode = await promptAndWait('Reddit OTP required — please reply with the 6-digit code from max@gapfix.net inbox');
    if (!otpCode || otpCode.length < 4) {
      throw new Error('No OTP code provided — cannot continue signup');
    }
    // Find the OTP input and enter the code
    const otpInput = page.locator('input[name="otp"]').or(page.locator('input[placeholder*="code"]')).or(page.locator('input[inputmode="numeric"]')).first();
    await otpInput.waitFor({ state: 'visible', timeout: 10000 });
    await otpInput.fill(otpCode);
    await randomDelay(500, 1000);
    await otpInput.press('Enter');
    await randomDelay(2000, 3000);
    console.log('[reddit-signup] OTP code submitted');
    await page.screenshot({ path: 'scripts/social/.debug-reddit-after-otp.png' }).catch(() => {});
  }

  // Step 2: username + password
  const usernameInput = page.locator('input[name="username"]');
  // Try waiting for username input
  const usernameAttached = await usernameInput.waitFor({ state: 'attached', timeout: 15000 }).then(() => true).catch(() => false);
  if (!usernameAttached) {
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
    throw new Error(`Username step not reached. Page: ${bodyText}`);
  }
  await usernameInput.scrollIntoViewIfNeeded().catch(() => {});
  await randomDelay(1000, 2000);

  // Try username candidates until one is accepted
  let chosenUsername = null;
  for (const candidate of USERNAME_CANDIDATES) {
    await usernameInput.evaluate((el, val) => {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, candidate);
    await randomDelay(1200, 1800);

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
  await passwordInput.waitFor({ state: 'attached', timeout: 10000 });
  await passwordInput.scrollIntoViewIfNeeded().catch(() => {});
  await passwordInput.evaluate((el, val) => {
    const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeValueSetter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, password);
  await randomDelay(500, 1000);

  await page.screenshot({ path: 'scripts/social/.debug-reddit-before-submit.png' }).catch(() => {});

  // Check for CAPTCHA before submitting
  const captchaFrame = page.frameLocator('iframe[title*="reCAPTCHA"]').first();
  const captchaVisible = await captchaFrame.locator('.recaptcha-checkbox').isVisible({ timeout: 3000 }).catch(() => false);
  if (captchaVisible) {
    console.log('\n[reddit-signup] CAPTCHA detected. Notifying board via Telegram…');
    await promptAndWait('Reddit CAPTCHA detected — please solve it in the browser window, then reply "done"');
  }

  // Submit via Enter on password field
  await passwordInput.press('Enter');
  await randomDelay(3000, 5000);

  await page.screenshot({ path: 'scripts/social/.debug-reddit-after-submit.png' }).catch(() => {});

  return chosenUsername;
}

async function signup() {
  const password = getPassword();

  console.log('[reddit-signup] Starting Reddit signup flow...');
  const ctx = await getContext('reddit', { headless: false });
  const { page } = ctx;

  let username = null;
  try {
    username = await fillSignupForm(page, EMAIL, password);

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
