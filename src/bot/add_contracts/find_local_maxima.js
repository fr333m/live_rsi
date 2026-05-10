const { formatShort } = require('./transform_timestamp');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();
const {getRsi} = require('../../signals/rsi/rsi_value')


async function findMaxima(candles, symbol) {
    console.log(`\n=== findMaxima START | ${symbol} | Свечей: ${candles.length} ===`);

    if (!candles || candles.length < 30) {
        console.log("❌ Мало свечей для анализа максимумов");
        return [];
    }

    const currentPriceData = await dbService.getLastMinutePrices(symbol);
    if (!currentPriceData?.length) {
        console.log("❌ Нет данных о текущей цене");
        return [];
    }

    const currentPrice = currentPriceData[0].lastprice;
    console.log(`Текущая цена: ${currentPrice}`);

    const windowSize = 6;
    const allLocalMaxs = [];

    console.log(`\n=== Поиск локальных максимумов (window = ${windowSize}) ===`);

    for (let i = windowSize; i < candles.length - windowSize; i++) {
        const candle = candles[i];
        const high = candle.high;

        if (high < currentPrice * 0.995) continue;

        // Проверка локального максимума
        let isLocalMax = true;
        for (let j = i - windowSize; j <= i + windowSize; j++) {
            if (j === i) continue;
            if (candles[j].high >= high) {
                isLocalMax = false;
                break;
            }
        }

        if (!isLocalMax) continue;

        // Информация для отладки
        const leftHigh = Math.max(...candles.slice(Math.max(0, i - 20), i).map(c => c.high));
        const rightHigh = Math.max(...candles.slice(i + 1, Math.min(candles.length, i + 20)).map(c => c.high));

        console.log(`   [${i.toString().padStart(3)}] High = ${high.toFixed(6)} | Left20=${leftHigh.toFixed(6)} | Right20=${rightHigh.toFixed(6)} | OK`);

        allLocalMaxs.push({
            ...candle,
            highPrice: high,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i
        });
    }

    console.log(`\nНайдено локальных максимумов: ${allLocalMaxs.length}`);

    if (allLocalMaxs.length === 0) {
        console.log("❌ Не найдено ни одного локального максимума");
        return [];
    }

    // === Финальная фильтрация: возрастающая последовательность ===
    const finalMaxima = [allLocalMaxs[allLocalMaxs.length - 1]]; // самый новый максимум
    
    console.log(`\nФинальная возрастающая фильтрация...`);

    for (let i = allLocalMaxs.length - 2; i >= 0; i--) {
        const curr = allLocalMaxs[i];
        const last = finalMaxima[finalMaxima.length - 1];
        const diffPercent = (curr.highPrice - last.highPrice) / last.highPrice * 100;

        if (curr.highPrice > last.highPrice && diffPercent > 0.08 && (last.index - curr.index) > 4) {
            finalMaxima.push(curr);
            console.log(`   ✅ Добавлен: ${curr.dateTime} (+${diffPercent.toFixed(2)}%)`);
        } else {
            console.log(`   ❌ Пропущен: ${curr.dateTime} (разница ${diffPercent.toFixed(2)}%)`);
        }
    }

    const result = finalMaxima.reverse();
    console.log(`\n=== findMaxima FINISH | Возвращаем ${result.length} максимумов ===\n`);
    
    return result;
}



module.exports = { findMaxima };