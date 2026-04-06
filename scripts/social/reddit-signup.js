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
import { solveCaptcha } from '../solve-captcha.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../..');

const EMAIL = 'max@gapfix.net';
const USERNAME_CANDIDATES = ['bitcoin_gap_fix', 'gapfixnet', 'btc_gap_fix', 'gap_fix_btc'];
const ENV_OUT = join(ROOT_DIR, '.env.reddit');

/**
 * Detects and handles the Reddit OTP "Verify your email" step.
 * Uses locator.waitFor() — NOT page.waitForSelector() — to work with Playwright text selectors.
 */
async function handleOtpIfPresent(page, promptFn) {
  // Check if OTP input is present in DOM (use 'attached' — Reddit renders it hidden via CSS)
  const otpInput = page.locator('input[placeholder="Verification code"]');
  const otpPresent = await otpInput.waitFor({ state: 'attached', timeout: 12000 }).then(() => true).catch(() => false);
  if (!otpPresent) {
    // Also try by inputmode=numeric as fallback
    const otpAlt = page.locator('input[inputmode="numeric"]');
    const altPresent = await otpAlt.waitFor({ state: 'attached', timeout: 3000 }).then(() => true).catch(() => false);
    if (!altPresent) {
      console.log('[reddit-signup] No OTP step detected — proceeding');
      return;
    }
  }
  console.log('\n[reddit-signup] EMAIL OTP REQUIRED');
  console.log('[reddit-signup] Requesting OTP from board via Telegram…');
  const otpCode = await promptFn('Reddit signup OTP required — please reply with the 6-digit code from max@gapfix.net inbox');
  if (!otpCode || otpCode.replace(/\D/g, '').length < 4) {
    throw new Error('No OTP code provided — cannot continue signup');
  }
  const digits = otpCode.replace(/\D/g, '');
  // Use JS evaluate to fill — bypasses CSS visibility constraints
  await page.evaluate((val) => {
    const input = document.querySelector('input[placeholder="Verification code"]') ||
                  document.querySelector('input[inputmode="numeric"]');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  }, digits);
  await randomDelay(500, 1000);
  // Click Continue button
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /continue/i.test(b.textContent));
    if (btn) btn.click();
  });
  await randomDelay(2000, 3000);
  console.log('[reddit-signup] OTP code submitted');
  await page.screenshot({ path: 'scripts/social/.debug-reddit-after-otp.png' }).catch(() => {});
}

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

  // Also try clicking the Continue button explicitly (Reddit UI sometimes needs it)
  const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
  if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continueBtn.click();
    await randomDelay(1500, 2500);
  }

  await page.screenshot({ path: 'scripts/social/.debug-reddit-after-email.png' }).catch(() => {});

  // Step 1b: OTP verification — Reddit sends a 6-digit code to the email
  // Use locator.waitFor() — NOT page.waitForSelector() — to properly handle Playwright text selectors
  await handleOtpIfPresent(page, promptAndWait);

  // Step 2: username + password — wait for VISIBLE username input (not just attached)
  const usernameInput = page.locator('input[name="username"]');
  const usernameVisible = await usernameInput.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (!usernameVisible) {
    // Check if we're still on OTP page (got stuck)
    const stillOtp = await page.locator('input[placeholder="Verification code"]').isVisible({ timeout: 2000 }).catch(() => false);
    if (stillOtp) {
      throw new Error('Stuck on OTP page — verification code was not accepted');
    }
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
    console.log('\n[reddit-signup] reCAPTCHA detected — invoking solve-captcha fallback chain…');
    // Extract site key from the reCAPTCHA iframe src
    const siteKey = await page.evaluate(() => {
      const el = document.querySelector('.g-recaptcha');
      return el ? el.dataset.sitekey : null;
    }).catch(() => null);
    const token = await solveCaptcha({
      pageUrl: 'https://www.reddit.com/register/',
      siteKey: siteKey || '',
      agentContext: 'Reddit signup (gapfix.net growth)',
    });
    if (token) {
      // Inject the solved token into the hidden textarea
      await page.evaluate((t) => {
        const el = document.querySelector('#g-recaptcha-response');
        if (el) { el.value = t; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, token);
    }
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

    // Post-submit: Reddit may show OTP page again after account creation
    await handleOtpIfPresent(page, promptAndWait);

    // Check final state
    const currentUrl = page.url().toString();

    // Save credentials
    const envContent = `REDDIT_USERNAME=${username}\nREDDIT_EMAIL=${EMAIL}\nREDDIT_PASSWORD=${password}\n`;
    writeFileSync(ENV_OUT, envContent, { encoding: 'utf8' });
    console.log(`[reddit-signup] Credentials saved to .env.reddit`);

    const success = currentUrl.includes('reddit.com') && !currentUrl.includes('register');
    console.log(`[reddit-signup] ${success ? 'Account created successfully!' : 'Signup may have encountered an issue — check screenshot.'}`);
    console.log(`[reddit-signup] Username: ${username}`);
    return { success, username };
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
