const { findMinima } = require('./find_minima');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();

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

    const peaks = await findMinima(ohlcData, symbol);

    // await dbService.saveFilteredMinimum(symbol, interval, peaks);
    // console.log(peaks, 'FOR MINIMA', symbol);
    return peaks;
}

module.exports = {
    getMinimaPeaksPriceContracts,
};
