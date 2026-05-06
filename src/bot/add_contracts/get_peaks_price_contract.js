const {findMaxima} = require('./find_local_maxima');
const {formatTimestamp} = require('./transform_timestamp');
const SqliteDB = require('../../../src/db/db');
const dbService = new SqliteDB('./candles.db');



async function getPeaksPriceContracts(symbol, interval) {
    const limit = 215;
    const ohlcData = await dbService.getCandles(symbol, interval, 'trackingContracts', limit);
    const ohlcSlice = ohlcData.slice(0, ohlcData.length - 5);

    if (ohlcData.length === 0) {
        return [];
    }



const peaks = await findMaxima(ohlcSlice, symbol);


return peaks;

}

module.exports = {
    getPeaksPriceContracts
}