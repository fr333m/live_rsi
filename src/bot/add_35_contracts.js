const { getVolatilityLevel } = require('../signals/rsi/getVolatilityLevel');
const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');
const { getRsi } = require('../signals/rsi/rsi_value');
const {
    runUpdateExtremum_for_5m,
    runUpdateExtremum_for_15m,
    runUpdateExtremum_for_60m,
} = require('../signals/update_extremum_on_cache');

const PostgresDB = require('../db/db');
const BybitClient = require('../rest/bybitRest');
const priceTracker = require('../ws/wsClient');
const rsiCache = require('../ws/cacheRSI');

const dbService = new PostgresDB();
const bybitClient = new BybitClient();

const pLimit = require('p-limit');
const limit = pLimit(3); // ← Уменьшил до 3 (самое важное)

// ==================== НАСТРОЙКИ ====================
const INTERVALS = ['5', '15', '60'];
const DELAY_BETWEEN_INTERVALS = 1500; // 1.5 секунды пауза между интервалами

// Простой retry
const withRetry = async (fn, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (
                err.message?.includes('rate limit') ||
                err.status === 429 ||
                i === retries - 1
            ) {
                throw err;
            }
            console.warn(`Повторная попытка (${i + 1}/${retries})...`);
            await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // exponential backoff
        }
    }
};

const add35Contracts = async (ctx) => {
    try {
        await ctx.reply('🔄 Добавляю 35 контрактов (Rate Limit safe mode)...');

        const contracts = await bybitClient.getTopTradingVolume(35);
        const symbols = contracts.map((c) => c.symbol);

        await ctx.reply(`📥 Найдено ${symbols.length} контрактов.`);

        // ==================== 1. Обновление истории ====================
        for (const interval of INTERVALS) {
            await ctx.reply(`🔄 Обновляю историю для ${interval}m...`);

            const updatePromises = symbols.map((symbol) =>
                limit(() =>
                    withRetry(() => updateHistoryData(symbol, interval)).catch(
                        (e) => {
                            console.warn(
                                `Не удалось обновить ${symbol} (${interval}m):`,
                                e.message
                            );
                            return null;
                        }
                    )
                )
            );

            await Promise.all(updatePromises);
            await ctx.reply(`✅ ${interval}m — история обновлена`);

            // Пауза между интервалами
            if (interval !== INTERVALS[INTERVALS.length - 1]) {
                await new Promise((r) =>
                    setTimeout(r, DELAY_BETWEEN_INTERVALS)
                );
            }
        }

        // ==================== 2. Расчёт RSI + Volatility ====================
        await ctx.reply('📊 Рассчитываю RSI и волатильность...');

        const allResults = [];

        for (const interval of INTERVALS) {
            const dataPromises = contracts.map((contract) =>
                limit(() =>
                    withRetry(async () => {
                        const candles = await dbService.getCandles(
                            contract.symbol,
                            interval,
                            'tracking_contracts',
                            450
                        );

                        const rsiValue = await getRsi(candles);
                        if (rsiValue != null) {
                            rsiCache.set(contract.symbol, interval, rsiValue);
                        }

                        const volatilityData =
                            await getVolatilityLevel(candles);

                        return {
                            symbol: contract.symbol,
                            interval,
                            volatility:
                                volatilityData?.volatilityForSignal || 0,
                        };
                    })
                )
            );

            const results = await Promise.all(dataPromises);
            allResults.push(...results.filter(Boolean));

            await new Promise((r) => setTimeout(r, 1000)); // небольшая пауза
        }

        // ==================== 3. Сохранение ====================
        await dbService.saveTrackingContract(allResults);

        // ==================== 4. Финализация ====================
        await priceTracker.ensureConnected();
        await new Promise((r) => setTimeout(r, 15000));

        await Promise.allSettled([
            runUpdateExtremum_for_5m?.(),
            runUpdateExtremum_for_15m?.(),
            runUpdateExtremum_for_60m?.(),
        ]);

        await ctx.reply(
            `✅ **Готово!**\n\n` +
                `Контрактов: **${contracts.length}**\n` +
                `Таймфреймы: **${INTERVALS.join(', ')}m**\n` +
                `Записей сохранено: **${allResults.length}**`
        );
    } catch (error) {
        console.error('Ошибка в add35Contracts:', error);
        await ctx.reply('❌ Ошибка. Возможно, превышен лимит запросов Bybit.');
    }
};

module.exports = add35Contracts;

// const { getVolatilityLevel } = require('../signals/rsi/getVolatilityLevel');
// const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');
// const { getRsi } = require('../signals/rsi/rsi_value');
// const {
//     runUpdateExtremum_for_15m,
// } = require('../signals/update_extremum_on_cache');

// const PostgresDB = require('../db/db');
// const BybitClient = require('../rest/bybitRest');
// const priceTracker = require('../ws/wsClient');
// const rsiCache = require('../ws/cacheRSI');

// const dbService = new PostgresDB();
// const bybitClient = new BybitClient();

// // Помощник для ограничения параллельности
// const pLimit = require('p-limit');
// const limit = pLimit(5); // максимум 5 запросов одновременно

// const add35Contracts = async (ctx) => {
//     try {
//         await ctx.reply('🔄 Добавляю 35 контрактов...');

//         const contracts = await bybitClient.getTopTradingVolume(35);
//         const symbols = contracts.map((c) => c.symbol);

//         await ctx.reply(
//             `📥 Найдено ${symbols.length} контрактов. Обновляю историю...`
//         );

//         // === 1. Параллельное обновление истории с лимитом ===
//         const updatePromises = symbols.map((symbol) =>
//             limit(() =>
//                 updateHistoryData(symbol, '15').catch((e) => {
//                     console.warn(
//                         `Не удалось обновить историю для ${symbol}:`,
//                         e.message
//                     );
//                     return null;
//                 })
//             )
//         );

//         await Promise.all(updatePromises);

//         await ctx.reply(
//             '✅ История обновлена. Собираю данные волатильности...'
//         );

//         // === 2. Получение свечей и расчёт волатильности ===
//         const arrObj = [];

//         const dataPromises = contracts.map((contract) =>
//             limit(async () => {
//                 try {
//                     const candles = await dbService.getCandles(
//                         contract.symbol,
//                         '15',
//                         'tracking_contracts',
//                         400
//                     );

//                     const rsiValue = await getRsi(candles);

//                     if (rsiValue) {
//                         rsiCache.set(contract.symbol, '15', rsiValue);
//                     }

//                     const volatility = await getVolatilityLevel(candles);

//                     return {
//                         symbol: contract.symbol,
//                         interval: '15',
//                         volatility: volatility?.volatilityForSignal || 0,
//                     };
//                 } catch (e) {
//                     console.warn(
//                         `Ошибка обработки ${contract.symbol}:`,
//                         e.message
//                     );
//                     return null;
//                 }
//             })
//         );

//         const results = await Promise.all(dataPromises);
//         arrObj.push(...results.filter(Boolean));

//         // === 3. Сохранение ===
//         await dbService.saveTrackingContract(arrObj);

//         // === 4. WebSocket и экстремумы ===
//         await priceTracker.ensureConnected();

//         // Лучше убрать долгий sleep или сделать его очень коротким
//         // await new Promise(r => setTimeout(r, 5000));
//         await new Promise((resolve) => setTimeout(resolve, 10000));

//         await runUpdateExtremum_for_15m();

//         console.log(`💾 Сохранено ${arrObj.length} контрактов`);

//         await ctx.reply(
//             `✅ Успешно добавлено ${arrObj.length} контрактов!\nWebSocket обновлён.`
//         );
//     } catch (error) {
//         console.error('Ошибка в add35Contracts:', error);
//         await ctx.reply('❌ Ошибка при добавлении контрактов.');
//     }
// };

// module.exports = add35Contracts;
