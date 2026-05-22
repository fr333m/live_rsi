const BybitClient = require('../../rest/bybitRest');
const PostgresDB = require('../../db/db');
const dbService = new PostgresDB();
const bybitClient = new BybitClient();

async function updateHistoryData(symbol, interval) {
    const ohlcData = await bybitClient.getCandles(symbol, interval, 400);

    const filteredData = ohlcData.slice(1, ohlcData.length - 1);

    await dbService.saveCandles(symbol, interval, filteredData);

    return;
}

module.exports = {
    updateHistoryData,
};
