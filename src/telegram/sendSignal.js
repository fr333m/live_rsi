const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const { generateChart } = require('../chart/generateChart');
const logger = require('../utils/logger');

const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// ============================================================
// Какие графики прикладывать для каждого интервала (первый = основной).
// Для '1' — три скриншота: 1m, 5m, 60m.
// Для остальных интервалов сохраняется прежнее поведение (основной + 5m),
// чтобы ничего не сломать. Чтобы поменять — просто добавь запись сюда.
// ============================================================
const CHART_TIMEFRAMES = {
    1: ['1', '5', '15'],
    // примеры на будущее:
    5: ['5', '60'],
    15: ['15', '60'],
};

function getChartTimeframes(interval) {
    const key = String(interval);
    if (CHART_TIMEFRAMES[key]) return CHART_TIMEFRAMES[key];
    // дефолт = прежняя логика: основной ТФ + 5m (если основной не 5m)
    return key === '5' || key === '5m' ? [key] : [key, '5'];
}

function tfLabel(tf) {
    const k = String(tf);
    if (k === 'D') return '1D';
    return `${k}m`;
}

/**
 * Отправляет торговое оповещение с графиками нескольких таймфреймов.
 * Для interval '1' прикладываются графики 1m, 5m и 60m.
 *
 * @param {string} symbol
 * @param {string} interval
 * @param {string} signalType
 * @param {string} dataTime
 * @param {object} extraData          данные для разметки основного графика
 * @param {string|number} rsiValue
 * @param {string|number} volPrecent
 * @param {object|null} flowSignal
 * @param {object|null} extraDataByTf необяз. карта { '60': data60, ... } —
 *        данные разметки для каждого ТФ. Если не задано, к доп. графикам
 *        применяется тот же extraData, что и к основному (как было раньше).
 *        ВНИМАНИЕ: если extraData содержит уровни/маркеры основного ТФ, то
 *        графики других ТФ покажут ЧУЖИЕ маркеры — тогда задавай карту.
 * @returns {Promise<object>}
 */
async function sendSignal(
    symbol,
    interval,
    signalType,
    dataTime,
    extraData,
    rsiValue,
    volPrecent,
    flowSignal = null,
    rsiLevel = null,
    macd15Value = null
) {
    const extraDataByTf = null; // --- IGNORE --- пока не используем, но оставляем возможность
    logger.info(
        `[sendSignal] START ${symbol} ${interval} | type=${signalType}`
    );

    try {
        const mainKey = String(interval);
        const timeframes = getChartTimeframes(interval);

        // === Генерация графиков по всем нужным ТФ ===
        const rendered = []; // [{ tf, buffer }]
        for (const tf of timeframes) {
            const ed =
                extraDataByTf && extraDataByTf[tf] != null
                    ? extraDataByTf[tf]
                    : tf === mainKey
                      ? extraData
                      : null;
            try {
                logger.info(`[sendSignal] Generating chart ${symbol} ${tf}`);
                const buffer = await generateChart(symbol, tf, ed);
                rendered.push({ tf, buffer });
                logger.info(`[sendSignal] Chart generated ${symbol} ${tf}`);
            } catch (err) {
                // основной график обязателен; остальные — best effort
                if (tf === mainKey) throw err;
                logger.warn(
                    `[sendSignal] Chart skipped ${symbol} ${tf} — ${err.message}`
                );
            }
        }

        if (rendered.length === 0) {
            throw new Error('no charts rendered');
        }

        // подпись — только на первом графике (так показывает media group)
        const attachedExtras = rendered
            .map((r) => r.tf)
            .filter((tf) => tf !== mainKey);

        const caption = getMessageText(
            symbol,
            interval,
            signalType,
            dataTime,
            rsiValue,
            volPrecent,
            flowSignal,
            rsiLevel,
            macd15Value,
            attachedExtras
        );

        const charts = rendered.map((r, idx) =>
            idx === 0
                ? {
                      type: 'photo',
                      media: r.buffer,
                      caption,
                      parse_mode: 'Markdown',
                  }
                : { type: 'photo', media: r.buffer }
        );

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

        logger.info(
            `[sendSignal] Sending media group ${symbol} | ${rendered.length} charts (${rendered.map((r) => r.tf).join(', ')})`
        );
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
    volPrecent,
    flowSignal = null,
    rsiLevel = null,
    macd15Value = null,
    extraTfs = []
) {
    let confirmLine = '';
    if (flowSignal) {
        const wall = flowSignal.wallConfirmed ? '✅' : '—';
        const abs = flowSignal.absorptionConfirmed ? '✅' : '—';
        const strength = Number.isFinite(flowSignal.strength)
            ? flowSignal.strength.toFixed(2)
            : '—';
        confirmLine = `\n🛡 Стакан: *${wall}* | Absorption: *${abs}* | Сила: *${strength}*`;
    }

    // динамическая строка про доп. графики (только реально приложенные)
    let chartsLine = '';
    if (extraTfs && extraTfs.length) {
        const labels = extraTfs.map(tfLabel).join(', ');
        chartsLine = `\n\n📈 Также прикреплены графики: *${labels}*.`;
    }

    return `
🚨 *RSI TOP ALERT*

📊 Инструмент: *${symbol}*
⏱️ Таймфрейм: *${interval}*
🔔 Сигнал: *${signalType}*
⏱️ Время: *${dataTime}*
📊 RSI: *${rsiValue}*
📊 RSI Level: *${rsiLevel}*
📊 MACD 15: *${macd15Value}*
Процент волатильности *${volPrecent}*${confirmLine}${chartsLine}`.trim();
}

module.exports = { sendSignal };
