const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const { generateChart } = require('../chart/generateChart');
 // Убедись что путь правильный

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });


/**
 * Отправляет торговое оповещение RSI Top с графиком и кнопками действий
 * @param {string} symbol
 * @param {string} interval
 * @param {string} signalType
 * @param {string} dataTime
 * @returns {Promise<object>}
 */
async function sendSignal(symbol, interval, signalType, dataTime, extraData) {

    try {

        // Генерация графика
        const imageBuffer = await generateChart(
            symbol,
            interval,
            extraData
        );

        // Текст сообщения
        const messageText = `
🚨 *RSI TOP ALERT*

📊 Инструмент: *${symbol}*
⏱️ Таймфрейм: *${interval}*
🔔 Сигнал: *${signalType}*
⏱️ Время: *${dataTime}*

*Анализ показывает потенциальное движение вверх по этому инструменту.*
        `.trim();

        // Кнопки
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

        // Отправка изображения с подписью
        const result = await bot.sendPhoto(
            TELEGRAM_CHAT_ID,
            imageBuffer,
            {
                caption: messageText,

                parse_mode: 'Markdown',

                reply_markup: keyboard
            }
        );

        console.log(
            `✅ Оповещение успешно отправлено для ${symbol} (${interval})`
        );

        return {
            success: true,
            messageId: result.message_id,
            symbol,
            interval,
            timestamp: new Date().toISOString()
        };

    } catch (error) {

        console.error(
            `❌ Ошибка при отправке оповещения для ${symbol}:`,
            error.message
        );

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