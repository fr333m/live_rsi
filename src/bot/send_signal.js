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
/**
 * Отправляет сигнал с двумя графиками: текущий таймфрейм + 60-минутный
 */
async function sendSignal(
    symbol,
    interval,
    signalType,
    dataTime,
    extraData,
    rsiValue,
    volPrecent
) {
    try {
        // === Генерация двух графиков ===
        const mainChartBuffer = await generateChart(
            symbol,
            interval,
            extraData
        );

        let charts = [
            {
                type: 'photo',
                media: mainChartBuffer,
                caption: getMessageText(
                    symbol,
                    interval,
                    signalType,
                    dataTime,
                    rsiValue,
                    volPrecent
                ),
                parse_mode: 'Markdown',
            },
        ];

        // Добавляем второй график (60m), если текущий интервал отличается
        if (interval !== '60' && interval !== '60m') {
            const h1ChartBuffer = await generateChart(symbol, '60', extraData);

            charts.push({
                type: 'photo',
                media: h1ChartBuffer,
            });
        }

        // Кнопки
        const keyboard = {
            inline_keyboard: [
                [
                    {
                        text: `📈 Торговать ${symbol}`,
                        url: `https://www.bybit.com/trade/usdt/${symbol}`,
                    },
                ],
            ],
        };

        // Отправляем как медиагруппу (альбом)
        const result = await bot.sendMediaGroup(TELEGRAM_CHAT_ID, charts);

        // Отправляем клавиатуру отдельным сообщением (прикрепляем к альбому)
        if (result && result.length > 0) {
            await bot.sendMessage(TELEGRAM_CHAT_ID, 'Выберите действие:', {
                reply_markup: keyboard,
                reply_to_message_id: result[0].message_id,
            });
        }

        console.log(
            `✅ Оповещение отправлено для ${symbol} (${interval} + 60m)`
        );

        return {
            success: true,
            messageId: result[0]?.message_id,
            symbol,
            interval,
            timestamp: new Date().toISOString(),
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
            timestamp: new Date().toISOString(),
        };
    }
}

// Вспомогательная функция для текста сообщения
function getMessageText(
    symbol,
    interval,
    signalType,
    dataTime,
    rsiValue,
    volPrecent
) {
    return `
🚨 *RSI TOP ALERT*

📊 Инструмент: *${symbol}*
⏱️ Таймфрейм: *${interval}*
🔔 Сигнал: *${signalType}*
⏱️ Время: *${dataTime}*
📊 RSI: *${rsiValue}*
Процент волатильности *${volPrecent}*

📈 Также прикреплён график на 60-минутном таймфрейме.

*Анализ показывает потенциальное движение вверх.*`.trim();
}

module.exports = { sendSignal };
