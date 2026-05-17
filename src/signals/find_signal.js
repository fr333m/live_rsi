const { sendSignal } = require('../../src/bot/send_signal');
const { checkActualSignal } = require('./check_actual_signal');
const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB();
const priceTracker = require('../ws/wsClient');
const extremumCache = require('../ws/extremumCache');

async function findSignal(symbol, interval) {
    try {
        // ==================== 1. Загрузка данных ====================
        const [trackingData] = await Promise.all([
            dbService.gettracking_contracts(symbol, interval),
        ]);

        if (!trackingData || trackingData.length === 0) {
            console.log(`❌ Нет tracking_contracts для ${symbol} ${interval}`);
            return null;
        }

        const lastPriceData = priceTracker.getPrice(symbol);
        if (!lastPriceData?.lastPrice) {
            console.log(`❌ Нет последних цен для ${symbol}`);
            return null;
        }

        const volatility = trackingData[0].volatility ?? 2.0; // дефолтное значение
        const lastprice = lastPriceData.lastPrice;

        console.log(
            `📊 ${symbol} ${interval} | Price: ${lastprice} | Vol: ${volatility}%`
        );

        // ==================== 2. Получение экстремумов ====================
        const [peaks, minima] = await Promise.all([
            extremumCache.get(symbol, interval, 'max_extremum'),
            extremumCache.get(symbol, interval, 'min_extremum'),
        ]);

        const peaksFiltered = peaks || [];
        const minimaFiltered = minima || [];

        if (peaksFiltered.length === 0 && minimaFiltered.length === 0) {
            // console.log(`Нет экстремумов для ${symbol} ${interval}`);
            return false;
        }

        // ==================== 3. Обработка сигналов ====================

        const processExtremum = async (extremum, type) => {
            const priceDiffPercent =
                Math.abs((extremum.closePrice - lastprice) / lastprice) * 100;

            if (priceDiffPercent > volatility) return false;
            if (lastprice > extremum.closePrice && type === 'peak')
                return false;
            if (lastprice < extremum.closePrice && type === 'minimum')
                return false;

            const signalType = type === 'peak' ? 'double_top' : 'double_bottom';
            const signalText =
                type === 'peak'
                    ? 'Сигнал на продажу (Peak Detected)'
                    : 'Сигнал на покупку (Minimum Detected)';

            const isActual = await checkActualSignal(
                symbol,
                interval,
                lastPriceData.timestamp,
                signalType,
                extremum.timestamp
            );

            if (isActual === true) {
                await sendSignal(
                    symbol,
                    interval,
                    signalText,
                    extremum.dateTime,
                    {
                        extra: type,
                        [type]: extremum, // peak или minimum
                    }
                );

                // Удаляем использованный экстремум
                extremumCache.deleteByIndex(
                    symbol,
                    interval,
                    type === 'peak' ? 'max_extremum' : 'min_extremum',
                    extremum.index
                );

                console.log(`🚨 СИГНАЛ: ${signalText} | ${symbol} ${interval}`);
                return true;
            }

            return false;
        };

        // ==================== 4. Параллельная обработка ====================
        const peakPromises = peaksFiltered.map((peak) =>
            processExtremum(peak, 'peak').catch((err) => {
                console.error(`Ошибка обработки пика ${symbol}:`, err);
                return false;
            })
        );

        const minimaPromises = minimaFiltered.map((min) =>
            processExtremum(min, 'minimum').catch((err) => {
                console.error(`Ошибка обработки минимума ${symbol}:`, err);
                return false;
            })
        );

        const [peakResults, minimaResults] = await Promise.all([
            Promise.all(peakPromises),
            Promise.all(minimaPromises),
        ]);

        const hasSignal =
            peakResults.includes(true) || minimaResults.includes(true);

        return hasSignal;
    } catch (error) {
        console.error(
            `❌ Критическая ошибка в findSignal ${symbol} ${interval}:`,
            error
        );
        return null;
    }
}

module.exports = { findSignal };
