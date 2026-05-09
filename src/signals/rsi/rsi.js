const { getRsi } = require('./rsi_value');
const {sendSignal} = require('../../../src/bot/send_signal');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();
const {checkActualSignal} = require('../check_actual_signal');

async function calculationRSI(interval) {
  let dateTime = '-'
  let typeSignal = 'RSI';

    const uniqueSymbols = await dbService.uniqueSymbol('all_contracts_tracking', interval);

    for (const symbol of uniqueSymbols) {
        console.log('calculationRSI() started.');
        const ohlc =  await dbService.getCandles(symbol, interval, 'tracking_contracts');
        const currentTimestamp = ohlc[ohlc.length - 1].timestamp;
  
    console.log(`calculationRSI() received ${uniqueSymbols.length} symbols for RSI analysis.`);

    const rsiValue = await getRsi(ohlc);
    console.log(rsiValue);

   
    if (rsiValue === null) {
      console.log(`Symbol: ${symbol}, RSI: Not enough data, interval: ${interval}`);
      continue;
    }

    const actualSignal = await checkActualSignal(symbol, interval, currentTimestamp, typeSignal);

    if(actualSignal === false){
      continue;
    }


    if (rsiValue > 65) {
      const signalType = `RSI ${rsiValue}`
      try {
        await sendSignal(symbol, interval, signalType, dateTime);
      } catch (err) {
        console.error(`Failed to send signal for ${symbol}:`, err.message);
      }
    }

    if (rsiValue < 35) {
      const signalType = `RSI ${rsiValue}`
      try {
        await sendSignal(symbol, interval, signalType, dateTime);
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
