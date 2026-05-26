const dbService = require('../db/dbInstance');
const priceCache = require('../ws/priceCache'); // пока не используется
const logger = require('../utils/logger');

/**
 * Формирует минутную OHLC-свечу из данных priceCache
 * @param {string} symbol
 * @param {string} interval - приходит как '1', '5', '15' и т.д.
 * @param {number} currentTimestamp
 *
 *
 */

async function updateOHLC(symbol, interval) {
    try {
        if (
            !interval ||
            !Number.isInteger(Number(interval)) ||
            Number(interval) <= 0
        ) {
            logger.warn(
                `[OHLC] Некорректный интервал "${interval}" для ${symbol}`
            );
            return false;
        }

        const intervalMs = Number(interval) * 60 * 1000;

        logger.debug(`[OHLC] Starting update for ${symbol} (${interval}m)`);

        const ohlcData = priceCache.getBySymbol(symbol);

        if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length === 0) {
            logger.debug(`[OHLC] Нет данных в кэше для ${symbol}`);
            return false;
        }

        const validData = ohlcData
            .filter(
                (item) =>
                    item &&
                    typeof item.lastPrice === 'number' &&
                    Number.isFinite(item.lastPrice) &&
                    typeof item.timestamp === 'number'
            )
            .sort((a, b) => a.timestamp - b.timestamp);

        if (validData.length === 0) {
            logger.warn(`[OHLC] Нет валидных цен для ${symbol}`);
            return false;
        }

        // Определяем границы завершённой минуты по системному времени,
        // а не по первому тику в кэше — иначе stale-данные сдвигают период
        const currentPeriodStart =
            Math.floor(Date.now() / intervalMs) * intervalMs;
        const candleTimestamp = currentPeriodStart - intervalMs;
        const candleEnd = currentPeriodStart;

        // Берём только тики завершённой минуты
        const currentCandleData = validData.filter(
            (item) =>
                item.timestamp >= candleTimestamp && item.timestamp < candleEnd
        );

        if (currentCandleData.length === 0) {
            logger.warn(
                `[OHLC] Нет тиков для текущей свечи | symbol=${symbol} | interval=${interval}`
            );
            return false;
        }

        const open = currentCandleData[0].lastPrice;
        const close = currentCandleData[currentCandleData.length - 1].lastPrice;

        let high = -Infinity;
        let low = Infinity;
        for (const item of currentCandleData) {
            if (item.lastPrice > high) high = item.lastPrice;
            if (item.lastPrice < low) low = item.lastPrice;
        }

        const ohlcArr = [[candleTimestamp, open, high, low, close]];

        await dbService.saveCandles(symbol, interval, ohlcArr);

        logger.info(
            `[OHLC] ✅ ${symbol} (${interval}m) | ` +
                `O:${open.toFixed(8)} H:${high.toFixed(8)} L:${low.toFixed(8)} C:${close.toFixed(8)} | ` +
                `${currentCandleData.length} ticks | Candle TS: ${new Date(candleTimestamp).toISOString()}`
        );

        // Удаляем тики только завершённой минуты — тики следующей остаются
        priceCache.clearBefore(symbol, candleEnd);

        return true;
    } catch (error) {
        logger.error(
            `[OHLC] ❌ Error in updateOHLC(${symbol}, ${interval}):`,
            error
        );
        return false;
    }
}

module.exports = { updateOHLC };
