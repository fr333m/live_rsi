const {findMaxima} = require('./find_local_maxima');
const {formatTimestamp} = require('./transform_timestamp');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();



async function getPeaksPriceContracts(symbol, interval) {
    const limit = 215;
    const ohlcData = await dbService.getCandles(symbol, interval, 'tracking_contracts', limit);
    const ohlcSlice = ohlcData.slice(0, ohlcData.length - 5);

    if (ohlcData.length === 0) {
        return [];
    }



const peaks = await findMaxima(ohlcSlice, symbol);

console.log(peaks, "FOR", symbol);
return peaks;

}

module.exports = {
    getPeaksPriceContracts
}