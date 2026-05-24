const { findMaxima } = require('./find_local_maxima');
const dbService = require('../../db/dbInstance');
const { clusterMaxima } = require('./claster_level');

async function getPeaksPriceContracts(symbol, interval) {
    const limit = 300;
    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        limit
    );
    // const ohlcSlice = ohlcData.slice(0, ohlcData.length - 10);

    // if (ohlcData.length === 0) {
    //     return [];
    // }

    const peaks = await findMaxima(ohlcData, symbol, interval);
    const filteredPeaks = await clusterMaxima(peaks, symbol, interval);

    // console.log(peaks, 'FOR', symbol);
    return filteredPeaks;
}

module.exports = {
    getPeaksPriceContracts,
};
