/**
 * CAPTCHA solving utility with 3-step fallback chain:
 *   1. Automated (2captcha API) — no human needed
 *   2. Telegram relay — board solves it in-browser, replies "done"
 *   3. Manual Chrome fallback — logs instructions
 *
 * Usage:
 *   import { solveCaptcha, solveImageCaptcha } from './solve-captcha.mjs';
 *
 *   // For reCAPTCHA v2
 *   const token = await solveCaptcha({ pageUrl, siteKey, agentContext });
 *   if (token) injectToken(token); // else board already solved it in browser
 *
 *   // For visual/image CAPTCHA (Bitcointalk)
 *   const text = await solveImageCaptcha({ imageBase64, agentContext });
 *   if (text) await page.fill('input[name="verificationcode"]', text);
 *   // else board already typed it in browser
 */

import { Solver } from '@2captcha/captcha-solver';
import { promptAndWait } from './telegram-wait-reply.mjs';
import { waitForCloudflare } from './social/session.js';

const CAPTCHA_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for Telegram fallback

/**
 * Solve a reCAPTCHA v2 with the 3-step fallback chain.
 *
 * @param {object} opts
 * @param {string} opts.pageUrl       URL of the page with the CAPTCHA
 * @param {string} opts.siteKey       reCAPTCHA site key (data-sitekey attribute)
 * @param {string} opts.agentContext  Short description for Telegram message (e.g. "Reddit signup")
 * @returns {Promise<string|null>}    Token to inject, or null if solved manually
 */
export async function solveCaptcha({ pageUrl, siteKey, agentContext }) {
  // Step 1: Try 2captcha automated solving
  if (process.env.CAPTCHA_API_KEY) {
    try {
      console.log(`[solve-captcha] Attempting automated reCAPTCHA solve via 2captcha for ${agentContext}…`);
      const solver = new Solver(process.env.CAPTCHA_API_KEY);
      const result = await solver.recaptchaV2({ pageurl: pageUrl, googlekey: siteKey });
      console.log('[solve-captcha] 2captcha solved reCAPTCHA successfully');
      return result.data; // g-recaptcha-response token
    } catch (e) {
      console.warn(`[solve-captcha] 2captcha failed: ${e.message} — falling back to Telegram`);
    }
  } else {
    console.log('[solve-captcha] CAPTCHA_API_KEY not set — skipping 2captcha, using Telegram relay');
  }

  // Step 2: Telegram relay — board solves in browser
  try {
    await promptAndWait(
      `${agentContext}: a reCAPTCHA has appeared in the browser window.\n\n` +
      `Please solve it in the browser, then reply "done" here.`,
      CAPTCHA_TIMEOUT_MS,
    );
    console.log('[solve-captcha] Board confirmed CAPTCHA solved via Telegram');
    return null; // caller proceeds — browser already has the token
  } catch (e) {
    console.warn(`[solve-captcha] Telegram relay timed out or failed: ${e.message}`);
  }

  // Step 3: Manual fallback — log instructions
  console.error(
    `[solve-captcha] MANUAL ACTION REQUIRED: Open the browser window, solve the CAPTCHA on ${pageUrl}, then re-run the script.`,
  );
  return null;
}

/**
 * Handle a Cloudflare Turnstile challenge with a 2-step fallback chain:
 *   1. Wait for auto-resolve (works in non-headless mode with a seasoned profile)
 *   2. Telegram relay — board completes the challenge in the visible browser window
 *
 * @param {object} opts
 * @param {import('playwright').Page} opts.page         The Playwright page object
 * @param {string} opts.pageUrl       URL of the page showing the challenge (for the Telegram message)
 * @param {string} opts.agentContext  Short description for Telegram message
 * @returns {Promise<boolean>}  true if the page is unblocked, false on failure
 */
export async function solveTurnstile({ page, pageUrl, agentContext }) {
  // Step 1: Wait for auto-resolve (non-headless + persistent profile often passes automatically)
  const autoResolved = await waitForCloudflare(page, 20000);
  if (autoResolved) return true;

  // Step 2: Telegram relay — board solves in visible browser
  console.log(`[solve-captcha] Cloudflare Turnstile requires human interaction for ${agentContext}`);
  try {
    await promptAndWait(
      `🔐 *Cloudflare security check* at ${agentContext}\n\n` +
      `URL: ${pageUrl}\n\n` +
      `Please look at the browser window and complete the Cloudflare verification challenge, then reply *done* here.`,
      CAPTCHA_TIMEOUT_MS,
    );
    console.log('[solve-captcha] Board confirmed Cloudflare Turnstile solved via Telegram');
    // Give the page a moment to redirect after solving
    await waitForCloudflare(page, 10000);
    return true;
  } catch (e) {
    console.warn(`[solve-captcha] Telegram relay timed out or failed: ${e.message}`);
    console.error(
      `[solve-captcha] MANUAL ACTION REQUIRED: Open the browser window at ${pageUrl} and complete the Cloudflare check.`,
    );
    return false;
  }
}

/**
 * Solve a visual/image CAPTCHA with the 3-step fallback chain.
 *
 * @param {object} opts
 * @param {string} opts.imageBase64   Base64-encoded CAPTCHA image (without data URI prefix)
 * @param {string} opts.agentContext  Short description for Telegram message (e.g. "Bitcointalk signup")
 * @returns {Promise<string|null>}    CAPTCHA text to type, or null if solved manually
 */
export async function solveImageCaptcha({ imageBase64, agentContext }) {
  // Step 1: Try 2captcha automated image solving
  if (process.env.CAPTCHA_API_KEY && imageBase64) {
    try {
      console.log(`[solve-captcha] Attempting automated image CAPTCHA solve via 2captcha for ${agentContext}…`);
      const solver = new Solver(process.env.CAPTCHA_API_KEY);
      const result = await solver.imageCaptcha({ body: imageBase64 });
      console.log(`[solve-captcha] 2captcha solved image CAPTCHA: "${result.data}"`);
      return result.data;
    } catch (e) {
      console.warn(`[solve-captcha] 2captcha image solve failed: ${e.message} — falling back to Telegram`);
    }
  } else if (!imageBase64) {
    console.log('[solve-captcha] No image provided for automated solving — using Telegram relay');
  } else {
    console.log('[solve-captcha] CAPTCHA_API_KEY not set — using Telegram relay');
  }

  // Step 2: Telegram relay — board types it in browser
  try {
    await promptAndWait(
      `${agentContext}: a visual CAPTCHA image has appeared in the browser window.\n\n` +
      `Please look at the CAPTCHA image in the browser, type the code into the verification field, then reply "done" here.`,
      CAPTCHA_TIMEOUT_MS,
    );
    console.log('[solve-captcha] Board confirmed CAPTCHA entered via Telegram');
    return null; // caller proceeds — board already typed the answer
  } catch (e) {
    console.warn(`[solve-captcha] Telegram relay timed out or failed: ${e.message}`);
  }

  // Step 3: Manual fallback
  console.error(
    `[solve-captcha] MANUAL ACTION REQUIRED: Open the browser window and type the CAPTCHA code, then re-run the script.`,
  );
  return null;
}
