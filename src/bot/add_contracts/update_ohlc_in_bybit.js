const BybitClient = require('../../rest/bybitRest');
const PostgresDB = require('../../db/db');
const dbService = new PostgresDB();
const bybitClient = new BybitClient();

async function updateHistoryData(symbol, interval) {
    const ohlcData = await bybitClient.getCandles(symbol, interval, 400);
    await dbService.saveCandles(symbol, interval, ohlcData);
    return;
}

module.exports = {
    updateHistoryData
};