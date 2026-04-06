/**
 * Send a message to the board via Telegram.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy node scripts/telegram-notify.mjs "Your message"
 *
 * Or import sendTelegramMessage() from other scripts.
 */

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

/**
 * Send a text message to the configured Telegram chat.
 * @param {string} text  Message text
 * @param {string} [token]  Override bot token
 * @param {string} [chatId]  Override chat id
 * @returns {Promise<object>} Telegram API response body
 */
export async function sendTelegramMessage(text, token = TELEGRAM_BOT_TOKEN, chatId = TELEGRAM_CHAT_ID) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(body)}`);
  return body;
}

// CLI entry point
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const text = process.argv[2];
  if (!text) {
    console.error('Usage: node scripts/telegram-notify.mjs "Your message"');
    process.exit(1);
  }
  sendTelegramMessage(text)
    .then(r => console.log('[telegram-notify] Sent. message_id:', r.result.message_id))
    .catch(err => { console.error('[telegram-notify] Error:', err.message); process.exit(1); });
}
