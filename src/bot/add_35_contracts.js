const { getVolatilityLevel } = require('../signals/rsi/getVolatilityLevel');
const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');
const PostgresDB = require('../db/db');
const BybitClient = require('../rest/bybitRest');
const bybitClient = new BybitClient();

const dbService = new PostgresDB();

const add35Contracts = async (ctx) => {
    const arrObj = [];
    try {
        await ctx.reply('🔄 Добавляю 35 контрактов...');
        const contracts = await bybitClient.getTopTradingVolume(35);

        for (const contract of contracts) {
            await updateHistoryData(contract.symbol, '15');
        }

        for (const contract of contracts) {
            const candles = await dbService.getCandles(
                contract.symbol,
                '15',
                'tracking_contracts',
                400
            );
            const volatility = await getVolatilityLevel(candles);
            arrObj.push({
                symbol: contract.symbol,
                interval: '15',
                volatility: volatility.volatilityForSignal,
            });
        }
        console.log(arrObj, 'arrObj');
        await dbService.saveTrackingContract(arrObj);

        await ctx.reply('✅ Контракты успешно добавлены!');
    } catch (error) {
        console.error('Ошибка в /update_rsi:', error);
        await ctx.reply('❌ Произошла ошибка при обновлении RSI.');
    }
};

module.exports = add35Contracts;
