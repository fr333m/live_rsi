const { findMinima } = require('./findMinima');
const dbService = require('../../db/index');
const { clusterMinima } = require('./clusterLevel');
const rsiCache = require('../../cache/rsiCache');
const logger = require('../../utils/logger');

// Чтобы добавить новый TF — достаточно добавить его в оба объекта ниже.
// TRIM_MAP рассчитывается автоматически: каждый TF ищет там, где закончил предыдущий.
const INTERVALS = [1, 5, 15, 60];

const CANDLE_LIMIT = { 1: 200, 5: 400, 15: 700, 60: 700 };

const TRIM_MAP = Object.fromEntries(
    INTERVALS.map((tf, i) => {
        if (i === 0) return [tf, 1];
        const prevTf = INTERVALS[i - 1];
        return [tf, Math.floor((CANDLE_LIMIT[prevTf] * prevTf) / tf)];
    })
);

async function getMinimaPeaksPriceContracts(symbol, interval) {
    const volPrecentData = rsiCache.get(symbol, interval);
    const volPrecent = volPrecentData.volPrecent;
    if (interval === '1' && volPrecent <= 0.15) {
        return [];
    }
    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        CANDLE_LIMIT[interval]
    );

    if (ohlcData.length === 0) return [];

    const trimCount = TRIM_MAP[interval];

    if (trimCount === undefined)
        throw new Error(`Unsupported interval: ${interval}`);

    const atr = rsiCache.get(symbol, interval)?.atr || 0;

    const peaks = await findMinima(ohlcData, symbol, trimCount, atr, interval);

    logger.debug(
        `[${symbol} ${interval}m] findMinima found ${peaks.length} extrema`,
        peaks.map((p) => ({
            price: p.lowPrice,
            date: p.dateTime,
            index: p.index,
            rsi: p.rsi,
            prominance: p.prominance,
        }))
    );

    const filteredPeaks = clusterMinima(peaks);

    logger.debug(
        `[${symbol} ${interval}m] after clusterMinima: ${filteredPeaks.length} extrema`,
        filteredPeaks.map((p) => ({
            price: p.lowPrice,
            date: p.dateTime,
            index: p.index,
            rsi: p.rsi,
            prominance: p.prominance,
        }))
    );

    return peaks;
}

module.exports = { getMinimaPeaksPriceContracts };
