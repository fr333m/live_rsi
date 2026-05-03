const { getRsi } = require('./rsi_value');
const {sendSignal} = require('../../../src/bot/send_signal');
const SqliteDB = require('../../../src/db/db');
const dbService = new SqliteDB('./candles.db');

async function calculationRSI(interval) {

    const uniqueSymbols = await dbService.uniqueSymbol('all_contracts_tracking', interval);

    for (const symbol of uniqueSymbols) {
        console.log('calculationRSI() started.');
        const ohlc =  await dbService.getCandles(symbol, interval, 'trackingContracts');
        console.log(ohlc);
  
    console.log(`calculationRSI() received ${uniqueSymbols.length} symbols for RSI analysis.`);

    const rsiValue = await getRsi(ohlc);
    console.log(rsiValue);

   
    if (rsiValue === null) {
      console.log(`Symbol: ${symbol}, RSI: Not enough data, interval: ${interval}`);
      continue;
    }

    if (rsiValue > 65) {
      const signalType = `RSI ${rsiValue}`
      try {
        await sendSignal(symbol, interval, signalType);
      } catch (err) {
        console.error(`Failed to send signal for ${symbol}:`, err.message);
      }
    }

    if (rsiValue < 35) {
      const signalType = `RSI ${rsiValue}`
      try {
        await sendSignal(symbol, interval, signalType);
      } catch (err) {
        console.error(`Failed to send signal for ${symbol}:`, err.message);
      }
    }
    console.log(`Symbol: ${symbol}, RSI: ${rsiValue}, interval: ${interval}`);
    };
  
  console.log('calculationRSI() finished.');
}

module.exports = {
    calculationRSI
};
