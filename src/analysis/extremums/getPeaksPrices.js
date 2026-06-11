const { findMaxima } = require('./findMaxima');
const dbService = require('../../db/index');
const { clusterMaxima } = require('./clusterLevel');
const logger = require('../../utils/logger');

const CANDLE_LIMIT = { 1: 200, 5: 400, 15: 700, 60: 700 }; // Количество свечей для анализа экстремумов в зависимости от интервала
const TRIM_MAP = {
    1: 1,
    5: (CANDLE_LIMIT[5] * 1) / 5, // 80
    15: (CANDLE_LIMIT[15] * 5) / 15, // 133
    60: (CANDLE_LIMIT[60] * 15) / 60, // 100
};

async function getPeaksPriceContracts(symbol, interval) {
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

    const peaks = await findMaxima(ohlcData, symbol, trimCount);

    logger.debug(
        `[${symbol} ${interval}m] findMaxima found ${peaks.length} extrema`,
        peaks.map((p) => ({
            price: p.highPrice,
            date: p.dateTime,
            index: p.index,
        }))
    );

    const filteredPeaks = await clusterMaxima(peaks, symbol, interval);

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
