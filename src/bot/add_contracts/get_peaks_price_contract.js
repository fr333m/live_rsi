const { findMaxima } = require('./find_local_maxima');
const dbService = require('../../db/dbInstance');
const { clusterMaxima } = require('./claster_level');
const logger = require('../../utils/logger');

async function getPeaksPriceContracts(symbol, interval) {
    const limit = 400;
    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        limit
    );

    if (ohlcData.length === 0) {
        return [];
    }
    const trimMap = { 1: 1, 5: 80, 15: 133, 60: 100 };
    const trimCount = trimMap[interval];
    if (trimCount === undefined) {
        throw new Error(`Unsupported interval: ${interval}`);
    }

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

module.exports = {
    getPeaksPriceContracts,
};
