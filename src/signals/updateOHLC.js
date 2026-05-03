const SqliteDB = require('../db/db');
const dbService = new SqliteDB('./candles.db');

async function updateOHLC(symbol, interval) {
    const ohlcArr = [];
    const ohlcData = await dbService.getLastMinutePrices(symbol);

    console.log(ohlcData[ohlcData.length - 1]);

    const open = ohlcData[ohlcData.length - 1].lastPrice;
    const close = ohlcData[0].lastPrice;
    const high = Math.max(...ohlcData.map(item => item.lastPrice));
    const low = Math.min(...ohlcData.map(item => item.lastPrice));
    const timestamp = ohlcData[ohlcData.length - 1].timestamp;
    ohlcArr.push([timestamp, open, high, low, close]);
    
    await dbService.saveCandles(symbol, interval, ohlcArr);
}

module.exports = {
    updateOHLC
}