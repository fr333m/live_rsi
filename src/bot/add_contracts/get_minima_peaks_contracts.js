const BybitClient = require('../../rest/bybitRest');
const {findMinima} = require('./find_minima');
const {formatTimestamp} = require('./transform_timestamp');


const bybitClient = new BybitClient();

async function getMinimaPeaksPriceContracts(symbol, interval) {
    const limit = 210;
    const ohlcData = await bybitClient.getCandles(symbol, interval, limit);

    if (ohlcData.length === 0) {
        return [];
    }

const peaks = await findMinima(ohlcData);
    
console.log(symbol, interval, peaks);

return peaks;

}

module.exports = {
    getMinimaPeaksPriceContracts
}