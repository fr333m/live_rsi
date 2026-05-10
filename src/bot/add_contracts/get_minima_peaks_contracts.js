const {findMinima} = require('./find_minima');
const {formatTimestamp} = require('./transform_timestamp');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();



async function getMinimaPeaksPriceContracts(symbol, interval) {
    const limit = 215;
    const ohlcData = await dbService.getCandles(symbol, interval, 'tracking_contracts', limit);
    const ohlcSlice = ohlcData.slice(0, ohlcData.length - 5);


    if (ohlcData.length === 0) {
        return [];
    }

const peaks = await findMinima(ohlcSlice, symbol);

    

// await dbService.saveFilteredMinimum(symbol, interval, peaks);
console.log(peaks, "FOR MIMIMA", symbol);
return peaks;

}

module.exports = {
    getMinimaPeaksPriceContracts
}