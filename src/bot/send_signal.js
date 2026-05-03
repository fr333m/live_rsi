const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
 // Убедись что путь правильный

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

/**
 * Отправляет торговое оповещение RSI Top с графиком и кнопками действий
 * @param {string} symbol - Наименование торгового инструмента (например: BTCUSDT, ETHUSDT)
 * @param {string} interval - Таймфрейм (например: 1h, 4h, 1d)
 * @returns {Promise<object>} - Объект с результатом отправки сообщения
 */
 async function sendSignal(symbol, interval, signalType) {
    try {

        // Формируем текст сообщения с информацией об оповещении
        const messageText = `
🚨 *RSI TOP ALERT*

📊 Инструмент: *${symbol}*
⏱️ Таймфрейм: *${interval}*
🔔 Сигнал: *${signalType}*

*Анализ показывает потенциальное движение вверх по этому инструменту.*
        `.trim();

        // Формируем клавиатуру с кнопками действий
        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: `📈 ${symbol}`,
                        url: `https://www.bybit.com/trade/usdt/${symbol}`
                    }
                ]
            ]
        };

        // Отправляем сообщение с кнопками
        const result = await bot.sendMessage(
            TELEGRAM_CHAT_ID,
            messageText,
            {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            }
        );

        console.log(`✅ Оповещение успешно отправлено для ${symbol} (${interval})`);
        return {
            success: true,
            messageId: result.message_id,
            symbol,
            interval,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error(`❌ Ошибка при отправке оповещения для ${symbol}:`, error.message);
        return {
            success: false,
            error: error.message,
            symbol,
            interval,
            timestamp: new Date().toISOString()
        };
    }
}


module.exports = { sendSignal };