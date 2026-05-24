const { findMinima } = require('./find_minima');
const dbService = require('../../db/dbInstance');
const { clusterMinima } = require('./claster_level');

async function getMinimaPeaksPriceContracts(symbol, interval) {
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

    const peaks = await findMinima(ohlcData, symbol, interval);
    const filteredPeaks = await clusterMinima(peaks, symbol, interval);

    // await dbService.saveFilteredMinimum(symbol, interval, peaks);
    // console.log(peaks, 'FOR MINIMA', symbol);
    return filteredPeaks;
}

module.exports = {
    getMinimaPeaksPriceContracts,
};
