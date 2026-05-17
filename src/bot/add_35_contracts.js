const { getVolatilityLevel } = require('../signals/rsi/getVolatilityLevel');
const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');
const { getRsi } = require('../signals/rsi/rsi_value');
const {
    runUpdateExtremum_for_60m,
    runUpdateExtremum_for_5m,
} = require('../signals/update_extremum_on_cache');

const PostgresDB = require('../db/db');
const BybitClient = require('../rest/bybitRest');
const priceTracker = require('../ws/wsClient');
const rsiCache = require('../ws/cacheRSI');

const dbService = new PostgresDB();
const bybitClient = new BybitClient();

// Помощник для ограничения параллельности
const pLimit = require('p-limit');
const limit = pLimit(5); // максимум 5 запросов одновременно

const add35Contracts = async (ctx) => {
    try {
        await ctx.reply('🔄 Добавляю 35 контрактов...');

        const contracts = await bybitClient.getTopTradingVolume(35);
        const symbols = contracts.map((c) => c.symbol);

        await ctx.reply(
            `📥 Найдено ${symbols.length} контрактов. Обновляю историю...`
        );

        // === 1. Параллельное обновление истории с лимитом ===
        const updatePromises = symbols.map((symbol) =>
            limit(() =>
                updateHistoryData(symbol, '5').catch((e) => {
                    console.warn(
                        `Не удалось обновить историю для ${symbol}:`,
                        e.message
                    );
                    return null;
                })
            )
        );

        await Promise.all(updatePromises);

        await ctx.reply(
            '✅ История обновлена. Собираю данные волатильности...'
        );

        // === 2. Получение свечей и расчёт волатильности ===
        const arrObj = [];

        const dataPromises = contracts.map((contract) =>
            limit(async () => {
                try {
                    const candles = await dbService.getCandles(
                        contract.symbol,
                        '5',
                        'tracking_contracts',
                        400
                    );

                    const rsiValue = await getRsi(candles);

                    if (rsiValue) {
                        rsiCache.set(contract.symbol, '5', rsiValue);
                    }

                    const volatility = await getVolatilityLevel(candles);

                    return {
                        symbol: contract.symbol,
                        interval: '5',
                        volatility: volatility?.volatilityForSignal || 0,
                    };
                } catch (e) {
                    console.warn(
                        `Ошибка обработки ${contract.symbol}:`,
                        e.message
                    );
                    return null;
                }
            })
        );

        const results = await Promise.all(dataPromises);
        arrObj.push(...results.filter(Boolean));

        // === 3. Сохранение ===
        await dbService.saveTrackingContract(arrObj);

        // === 4. WebSocket и экстремумы ===
        await priceTracker.ensureConnected();

        // Лучше убрать долгий sleep или сделать его очень коротким
        // await new Promise(r => setTimeout(r, 5000));
        await new Promise((resolve) => setTimeout(resolve, 10000));

        await runUpdateExtremum_for_5m();

        console.log(`💾 Сохранено ${arrObj.length} контрактов`);

        await ctx.reply(
            `✅ Успешно добавлено ${arrObj.length} контрактов!\nWebSocket обновлён.`
        );
    } catch (error) {
        console.error('Ошибка в add35Contracts:', error);
        await ctx.reply('❌ Ошибка при добавлении контрактов.');
    }
};

module.exports = add35Contracts;
