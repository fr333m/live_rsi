const { findMinima } = require('./find_minima');
const dbService = require('../../db/dbInstance');
const { clusterMinima } = require('./claster_level');
const logger = require('../../utils/logger');

async function getMinimaPeaksPriceContracts(symbol, interval) {
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

    const peaks = await findMinima(ohlcData, symbol, trimCount);

    logger.debug(
        `[${symbol} ${interval}m] findMinima found ${peaks.length} extrema`,
        peaks.map((p) => ({
            price: p.lowPrice,
            date: p.dateTime,
            index: p.index,
        }))
    );

    const filteredPeaks = await clusterMinima(peaks, symbol, interval);

    logger.debug(
        `[${symbol} ${interval}m] after clusterMinima: ${filteredPeaks.length} extrema`,
        filteredPeaks.map((p) => ({
            price: p.lowPrice,
            date: p.dateTime,
            index: p.index,
        }))
    );

    return filteredPeaks;
}

module.exports = {
    getMinimaPeaksPriceContracts,
};
