const PostgresDB = require('../db/db');
const dbService = new PostgresDB();

async function updateOHLC(symbol, interval) {
    const ohlcArr = [];
    const ohlcData = await dbService.getLastMinutePrices(symbol);

    console.log(ohlcData[ohlcData.length - 1]);

    const open = ohlcData[ohlcData.length - 1].lastprice;
    const close = ohlcData[0].lastprice;
    const high = Math.max(...ohlcData.map(item => item.lastprice));
    const low = Math.min(...ohlcData.map(item => item.lastprice));
    const timestamp = ohlcData[ohlcData.length - 1].timestamp;
    ohlcArr.push([timestamp, open, high, low, close]);
    
    await dbService.saveCandles(symbol, interval, ohlcArr);
}

module.exports = {
    updateOHLC
}