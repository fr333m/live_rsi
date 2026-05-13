const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const priceCache = require('../ws/priceCache');

async function updateOHLC(symbol, interval, currentTimestamp) {
    const ohlcArr = [];
    const ohlcData = await dbService.getLastMinutePrices(
        symbol,
        currentTimestamp
    );

    if (!ohlcData.length) {
        console.log(`No price data for ${symbol} at ${currentTimestamp}`);
        return;
    }

    console.log(ohlcData[ohlcData.length - 1]);

    const open = ohlcData[0].lastprice;
    const close = ohlcData[ohlcData.length - 1].lastprice;
    const high = Math.max(...ohlcData.map((item) => item.lastprice));
    const low = Math.min(...ohlcData.map((item) => item.lastprice));
    const timestamp = ohlcData[ohlcData.length - 1].timestamp;
    ohlcArr.push([timestamp, open, high, low, close]);

    await dbService.saveCandles(symbol, interval, ohlcArr);
}

module.exports = {
    updateOHLC,
};
