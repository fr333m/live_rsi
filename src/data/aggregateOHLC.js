const dbService = require('../db/index');
const logger = require('../utils/logger');

const INTERVAL_MINUTES = {
    3: 3, 5: 5, 15: 15, 30: 30, 60: 60, 120: 120, 240: 240, '1D': 1440,
};

async function aggregateLastCandle(symbol, targetInterval) {
    const minutes = INTERVAL_MINUTES[targetInterval];
    if (!minutes) {
        logger.error(`[aggregateCandles] Неизвестный таймфрейм: ${targetInterval}`);
        throw new Error(`Неизвестный таймфрейм: ${targetInterval}`);
    }

    logger.info(
        `[aggregateCandles] symbol=${symbol} | targetInterval=${targetInterval}`
    );

    let minuteCandles;
    try {
        minuteCandles = await dbService.getCandles(
            symbol,
            '1',
            'tracking_contracts',
            minutes * 2
        );
    } catch (err) {
        logger.error(
            `[aggregateCandles] Ошибка получения минутных свечей | symbol=${symbol} | ${err.message}`
        );
        throw err;
    }

    if (!minuteCandles || minuteCandles.length === 0) {
        logger.warn(
            `[aggregateCandles] Нет минутных свечей | symbol=${symbol} | targetInterval=${targetInterval}`
        );
        return;
    }

    minuteCandles.sort((a, b) => a.timestamp - b.timestamp);

    const groups = new Map();
    for (const candle of minuteCandles) {
        const periodStart =
            Math.floor(candle.timestamp / (minutes * 60 * 1000)) *
            (minutes * 60 * 1000);
        if (!groups.has(periodStart)) groups.set(periodStart, []);
        groups.get(periodStart).push(candle);
    }

    const now = Date.now();
    const currentPeriodStart =
        Math.floor(now / (minutes * 60 * 1000)) * (minutes * 60 * 1000);

    const aggregated = [];
    for (const [periodStart, candles] of groups) {
        if (periodStart >= currentPeriodStart) continue;

        const open = candles[0].open;
        const close = candles[candles.length - 1].close;
        const high = candles.reduce((m, c) => Math.max(m, c.high), -Infinity);
        const low = candles.reduce((m, c) => Math.min(m, c.low), Infinity);

        aggregated.push([
            periodStart,
            parseFloat(open),
            parseFloat(high),
            parseFloat(low),
            parseFloat(close),
        ]);
    }

    if (aggregated.length === 0) {
        logger.warn(
            `[aggregateCandles] Нет завершённых периодов | symbol=${symbol} | targetInterval=${targetInterval}`
        );
        return;
    }

    try {
        await dbService.saveCandles(symbol, targetInterval, aggregated);
        logger.info(
            `[aggregateCandles] Сохранено ${aggregated.length} свечей | symbol=${symbol} | targetInterval=${targetInterval}`
        );
    } catch (err) {
        logger.error(
            `[aggregateCandles] Ошибка сохранения | symbol=${symbol} | ${err.message}`
        );
        throw err;
    }
}

module.exports = { aggregateLastCandle };
