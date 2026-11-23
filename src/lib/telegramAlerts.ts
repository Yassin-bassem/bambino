import { supabase } from '@/integrations/supabase/client';

interface StockAlertParams {
  code: string;
  name: string;
  stock_quantity: number;
}

const sentAlertsCache = new Set<string>();

/**
 * Sends a Telegram notification if a product stock quantity reaches 10 (low stock) or 0 (out of stock).
 * Deduplicates notifications sent in the same session.
 */
export const sendStockAlertTelegram = async ({ code, name, stock_quantity }: StockAlertParams) => {
  // Only trigger for threshold 10 (or low stock) and 0
  if (stock_quantity > 10) {
    return;
  }

  // Deduplicate using code + stock_quantity key
  const cacheKey = `${code}_${stock_quantity}`;
  if (sentAlertsCache.has(cacheKey)) {
    return;
  }

  try {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['telegram_bot_token', 'telegram_chat_id']);

    const botToken = settings?.find(s => s.key === 'telegram_bot_token')?.value || import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const rawChatId = settings?.find(s => s.key === 'telegram_chat_id')?.value || import.meta.env.VITE_TELEGRAM_CHAT_ID;

    const chatIds = typeof rawChatId === 'string'
      ? rawChatId.split(/[\s,;]+/).map(id => id.trim()).filter(Boolean)
      : rawChatId ? [String(rawChatId).trim()] : [];

    if (!botToken || chatIds.length === 0) {
      console.warn('Telegram alerts: Bot Token or Chat ID missing.');
      return;
    }

    const escapeMarkdown = (text: any): string => {
      if (text === null || text === undefined) return '';
      return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    };

    let message = '';
    if (stock_quantity <= 0) {
      message = `🔴 *تنبيه نفاد المخزون*\n\nالمنتج *${escapeMarkdown(code)}* \\- ${escapeMarkdown(name)} *انتهى من المخزون* \\(الكمية: 0\\)`;
    } else if (stock_quantity <= 10) {
      message = `⚠️ *تنبيه وصول حد التنبيه*\n\nالمنتج *${escapeMarkdown(code)}* \\- ${escapeMarkdown(name)} *وصل إلى حد التنبيه* \\(المتبقي: ${stock_quantity} قطعة\\)`;
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    let anySuccess = false;

    await Promise.allSettled(
      chatIds.map(async (chatId) => {
        try {
          const res = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'MarkdownV2',
            }),
          });

          if (res.ok) {
            anySuccess = true;
          } else {
            // Fallback to plain text if MarkdownV2 had formatting error
            const plainText = message.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, '$1');
            const fallbackRes = await fetch(telegramUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: plainText,
              }),
            });
            if (fallbackRes.ok) anySuccess = true;
          }
        } catch (targetErr) {
          console.error(`Failed to send stock alert to chat ${chatId}:`, targetErr);
        }
      })
    );

    if (anySuccess) {
      sentAlertsCache.add(cacheKey);
    }
  } catch (err) {
    console.error('Failed to send Telegram stock alert:', err);
  }
};

