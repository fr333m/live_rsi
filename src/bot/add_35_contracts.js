const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');

const { updateRSIfromCache } = require('../signals/updateRSIcache');
const {
    runUpdateExtremum_for_1m,
    runUpdateExtremum_for_5m,
    runUpdateExtremum_for_15m,
    runUpdateExtremum_for_60m,
} = require('../signals/update_extremum_on_cache');

const BybitClient = require('../rest/bybitRest');
const priceTracker = require('../ws/wsClient');

const bybitClient = new BybitClient();

const pLimit = require('p-limit');
const limit = pLimit(3); // ← Уменьшил до 3 (самое важное)

// ==================== НАСТРОЙКИ ====================
const INTERVALS = ['1', '5', '15', '60'];
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
        await ctx.reply('🔄 Добавляю 30 контрактов (Rate Limit safe mode)...');

        const contracts = await bybitClient.getTopTradingVolume(30);
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

        for (const interval of INTERVALS) {
            await updateRSIfromCache(interval);
        }

        // ==================== 3. Сохранение ====================

        // ==================== 4. Финализация ====================
        await priceTracker.ensureConnected();
        await new Promise((r) => setTimeout(r, 15000));

        await Promise.allSettled([
            runUpdateExtremum_for_1m?.(),
            runUpdateExtremum_for_5m?.(),
            runUpdateExtremum_for_15m?.(),
            runUpdateExtremum_for_60m?.(),
        ]);

        await ctx.reply(
            `✅ **Готово!**\n\n` +
                `Контрактов: **${contracts.length}**\n` +
                `Таймфреймы: **${INTERVALS.join(', ')}m**\n`
        );
    } catch (error) {
        console.error('Ошибка в add35Contracts:', error);
        await ctx.reply('❌ Ошибка. Возможно, превышен лимит запросов Bybit.');
    }
};

module.exports = add35Contracts;
