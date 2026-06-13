const { findMaxima } = require('./findMaxima');
const dbService = require('../../db/index');
const { clusterMaxima } = require('./clusterLevel');
const logger = require('../../utils/logger');
const rsiCache = require('../../cache/rsiCache');

const INTERVALS = [1, 5, 15, 60];

const CANDLE_LIMIT = { 1: 200, 5: 400, 15: 700, 60: 700 };

const TRIM_MAP = Object.fromEntries(
    INTERVALS.map((tf, i) => {
        if (i === 0) return [tf, 1];
        const prevTf = INTERVALS[i - 1];
        return [tf, Math.floor((CANDLE_LIMIT[prevTf] * prevTf) / tf)];
    })
);

async function getPeaksPriceContracts(symbol, interval) {
    const atr = rsiCache.get(symbol, interval)?.atr || 0;

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

    const peaks = await findMaxima(ohlcData, symbol, trimCount, atr, interval);

    logger.debug(
        `[${symbol} ${interval}m] findMaxima found ${peaks.length} extrema`,
        peaks.map((p) => ({
            price: p.highPrice,
            date: p.dateTime,
            index: p.index,
        }))
    );

    const filteredPeaks = await clusterMaxima(peaks);

    logger.debug(
        `[${symbol} ${interval}m] after clusterMaxima: ${filteredPeaks.length} extrema`,
        filteredPeaks.map((p) => ({
            price: p.highPrice,
            date: p.dateTime,
            index: p.index,
        }))
    );

    return filteredPeaks;
}

module.exports = { getPeaksPriceContracts };
