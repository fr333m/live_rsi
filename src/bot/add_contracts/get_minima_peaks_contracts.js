const { findMinima } = require('./find_minima');
const { formatTimestamp } = require('./transform_timestamp');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();

async function getMinimaPeaksPriceContracts(symbol, interval, currentTime) {
    const limit = 300;
    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        limit
    );
    const ohlcSlice = ohlcData.slice(0, ohlcData.length - 10);

    if (ohlcData.length === 0) {
        return [];
    }

    const peaks = await findMinima(ohlcSlice, symbol, currentTime);

    // await dbService.saveFilteredMinimum(symbol, interval, peaks);
    console.log(peaks, 'FOR MINIMA', symbol);
    return peaks;
}

module.exports = {
    getMinimaPeaksPriceContracts,
};
