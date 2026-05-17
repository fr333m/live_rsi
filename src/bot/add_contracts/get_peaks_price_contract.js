const { findMaxima } = require('./find_local_maxima');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();

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

    const peaks = await findMaxima(ohlcData, symbol);

    // console.log(peaks, 'FOR', symbol);
    return peaks;
}

module.exports = {
    getPeaksPriceContracts,
};
