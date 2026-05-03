const BybitClient = require('../../rest/bybitRest');
const SqliteDB = require('../../db/db');
const dbService = new SqliteDB('./candles.db');
const bybitClient = new BybitClient();

async function updateHistoryData(symbol, interval) {
    const ohlcData = await bybitClient.getCandles(symbol, interval, 200);
    await dbService.saveCandles(symbol, interval, ohlcData);
    return;
}

module.exports = {
    updateHistoryData
};