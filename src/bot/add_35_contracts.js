const { getVolatilityLevel } = require('../signals/rsi/getVolatilityLevel');
const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');
const {
    runUpdateExtremum_for_15m,
} = require('../signals/update_extremum_on_cache');
const PostgresDB = require('../db/db');
const BybitClient = require('../rest/bybitRest');
const bybitClient = new BybitClient();
const priceTracker = require('../ws/wsClient');

const dbService = new PostgresDB();

const add35Contracts = async (ctx) => {
    try {
        await ctx.reply('🔄 Добавляю 35 контрактов...');
        const contracts = await bybitClient.getTopTradingVolume(35);
        const symbols = contracts.map((c) => c.symbol);

        await ctx.reply(
            `📥 Найдено ${symbols.length} контрактов. Обновляю историю...`
        );

        // Обновляем историю
        for (const symbol of symbols) {
            await updateHistoryData(symbol, '15').catch((e) =>
                console.warn(`Не удалось обновить историю для ${symbol}`)
            );
        }

        // Подготавливаем данные для сохранения
        const arrObj = [];
        for (const contract of contracts) {
            const candles = await dbService
                .getCandles(contract.symbol, '15', 'tracking_contracts', 400)
                .catch(() => []);

            const volatility = await getVolatilityLevel(candles);

            arrObj.push({
                symbol: contract.symbol,
                interval: '15',
                volatility: volatility?.volatilityForSignal || 0,
            });
        }

        await dbService.saveTrackingContract(arrObj);
        await priceTracker.ensureConnected();
        await new Promise((resolve) => setTimeout(resolve, 60000));

        await runUpdateExtremum_for_15m();

        console.log(
            `💾 Сохранено ${arrObj.length} контрактов в tracking_contracts`
        );

        // === Самое важное ===

        await ctx.reply(
            `✅ Успешно добавлено ${arrObj.length} контрактов!\nWebSocket обновлён.`
        );
    } catch (error) {
        console.error('Ошибка в add35Contracts:', error);
        await ctx.reply('❌ Ошибка при добавлении контрактов.');
    }
};

module.exports = add35Contracts;
