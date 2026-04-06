/**
 * Send a prompt to the board via Telegram and poll for a reply (up to 5 minutes).
 * Prints the reply text to stdout when received.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy \
 *     node scripts/telegram-wait-reply.mjs "Please reply with your OTP"
 *
 * Or import waitForTelegramReply() from other scripts.
 */

import { sendTelegramMessage } from './telegram-notify.mjs';

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

/**
 * Poll Telegram getUpdates for a new message in the chat, starting after
 * the given offset, until one arrives or the timeout is reached.
 *
 * @param {string} token       Bot token
 * @param {string} chatId      Expected chat_id (string or number)
 * @param {number} afterUpdateId  Only accept updates with update_id > this value
 * @param {number} timeoutMs   Max wait in milliseconds (default 5 min)
 * @param {number} pollMs      Poll interval in milliseconds (default 4 s)
 * @returns {Promise<string>}  The text of the first matching reply
 */
export async function waitForTelegramReply(
  token = TELEGRAM_BOT_TOKEN,
  chatId = TELEGRAM_CHAT_ID,
  afterUpdateId = 0,
  timeoutMs = 5 * 60 * 1000,
  pollMs = 4000,
) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');

  const deadline = Date.now() + timeoutMs;
  let offset = afterUpdateId + 1;

  while (Date.now() < deadline) {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=3`,
    );
    const body = await res.json();
    if (!body.ok) throw new Error(`Telegram getUpdates failed: ${JSON.stringify(body)}`);

    for (const update of body.result) {
      offset = update.update_id + 1;
      const msg = update.message;
      if (
        msg &&
        String(msg.chat.id) === String(chatId) &&
        msg.text
      ) {
        return msg.text.trim();
      }
    }

    // Short sleep between polls
    await new Promise(r => setTimeout(r, pollMs));
  }

  throw new Error(`Timed out waiting for Telegram reply after ${timeoutMs / 1000}s`);
}

/**
 * Get the current highest update_id so we only listen for NEW replies after
 * the prompt is sent.
 */
export async function getLatestUpdateId(token = TELEGRAM_BOT_TOKEN) {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?offset=-1`,
  );
  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram getUpdates failed: ${JSON.stringify(body)}`);
  if (body.result.length === 0) return 0;
  return body.result[body.result.length - 1].update_id;
}

/**
 * High-level helper: send a prompt and wait for a reply.
 * @param {string} prompt  Message to send before waiting
 * @returns {Promise<string>}  Reply text
 */
export async function promptAndWait(prompt) {
  const lastId = await getLatestUpdateId();
  await sendTelegramMessage(prompt);
  console.log('[telegram-wait-reply] Prompt sent, waiting for reply…');
  return waitForTelegramReply(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, lastId);
}

// CLI entry point
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const prompt = process.argv[2];
  if (!prompt) {
    console.error('Usage: node scripts/telegram-wait-reply.mjs "Enter the OTP:"');
    process.exit(1);
  }
  promptAndWait(prompt)
    .then(reply => {
      console.log('[telegram-wait-reply] Reply:', reply);
    })
    .catch(err => {
      console.error('[telegram-wait-reply] Error:', err.message);
      process.exit(1);
    });
}
