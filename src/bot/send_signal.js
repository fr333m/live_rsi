const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const { generateChart } = require('../chart/generateChart');
const logger = require('../utils/logger');

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
    logger.info(
        `[sendSignal] START ${symbol} ${interval} | type=${signalType}`
    );

    try {
        // === Генерация графиков ===
        logger.info(`[sendSignal] Generating main chart ${symbol} ${interval}`);
        const mainChartBuffer = await generateChart(
            symbol,
            interval,
            extraData
        );
        logger.info(`[sendSignal] Main chart generated ${symbol} ${interval}`);

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

        if (interval !== '60' && interval !== '60m') {
            try {
                logger.info(`[sendSignal] Generating H1 chart ${symbol}`);
                const h1ChartBuffer = await generateChart(symbol, '60', extraData);
                charts.push({ type: 'photo', media: h1ChartBuffer });
                logger.info(`[sendSignal] H1 chart generated ${symbol}`);
            } catch (h1err) {
                logger.warn(
                    `[sendSignal] H1 chart skipped — no data: ${symbol} | ${h1err.message}`
                );
            }
        }

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

        logger.info(`[sendSignal] Sending media group to Telegram ${symbol}`);
        const result = await bot.sendMediaGroup(TELEGRAM_CHAT_ID, charts);
        logger.info(
            `[sendSignal] Media group sent ${symbol} | messageId=${result[0]?.message_id}`
        );

        if (result && result.length > 0) {
            await bot.sendMessage(TELEGRAM_CHAT_ID, 'Выберите действие:', {
                reply_markup: keyboard,
                reply_to_message_id: result[0].message_id,
            });
            logger.info(`[sendSignal] Keyboard message sent ${symbol}`);
        }

        logger.info(
            `[sendSignal] SUCCESS ${symbol} ${interval} | messageId=${result[0]?.message_id}`
        );

        return {
            success: true,
            messageId: result[0]?.message_id,
            symbol,
            interval,
            timestamp: new Date().toISOString(),
        };
    } catch (error) {
        logger.error(
            `[sendSignal] ERROR ${symbol} ${interval} | ${error.message}`,
            error
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
