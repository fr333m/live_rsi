const dbService = require('../db/index');
const priceCache = require('../cache/priceCache');
const logger = require('../utils/logger');

async function updateOHLC(symbol, interval) {
    try {
        if (
            !interval ||
            !Number.isInteger(Number(interval)) ||
            Number(interval) <= 0
        ) {
            logger.warn(`[OHLC] Некорректный интервал "${interval}" для ${symbol}`);
            return false;
        }

        const intervalMs = Number(interval) * 60 * 1000;

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

        const currentPeriodStart =
            Math.floor(Date.now() / intervalMs) * intervalMs;
        const candleTimestamp = currentPeriodStart - intervalMs;
        const candleEnd = currentPeriodStart;

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

        await dbService.saveCandles(symbol, interval, [
            [candleTimestamp, open, high, low, close],
        ]);

        logger.info(
            `[OHLC] ✅ ${symbol} (${interval}m) | ` +
                `O:${open.toFixed(8)} H:${high.toFixed(8)} L:${low.toFixed(8)} C:${close.toFixed(8)} | ` +
                `${currentCandleData.length} ticks`
        );

        priceCache.clearBefore(symbol, candleEnd);

        return true;
    } catch (error) {
        logger.error(`[OHLC] ❌ Error in updateOHLC(${symbol}, ${interval}):`, error);
        return false;
    }
}

module.exports = { updateOHLC };
