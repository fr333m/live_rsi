const BybitClient = require('../rest/bybitRest');
const dbService = require('../db/index');

const bybitClient = new BybitClient();

const CANDLE_LIMIT = { 1: 400, 5: 400, 15: 700, 60: 700 };

async function updateHistoryData(symbol, interval) {
    const ohlcData = await bybitClient.getCandles(
        symbol,
        interval,
        CANDLE_LIMIT[interval]
    );
    const filteredData = ohlcData.slice(1, ohlcData.length - 1);
    await dbService.saveCandles(symbol, interval, filteredData);
}

module.exports = { updateHistoryData };
