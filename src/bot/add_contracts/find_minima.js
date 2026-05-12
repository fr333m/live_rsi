const { formatShort } = require('./transform_timestamp');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();
const {getRsi} = require('../../signals/rsi/rsi_value');

async function findMinima(candles, symbol) {
   // console.log(`\n=== findMinima START | ${symbol} | Свечей: ${candles.length} ===`);

    if (!candles || candles.length < 30) {
        // console.log("❌ Мало свечей");
        return [];
    }

    const currentPriceData = await dbService.getLastMinutePrices(symbol);
    if (!currentPriceData?.length) {
        // console.log("❌ Нет данных о текущей цене");
        return [];
    }

    const currentPrice = currentPriceData[currentPriceData.length - 1].lastprice;
    // console.log(`Текущая цена: ${currentPrice}`);

    const windowSize = 6;
    const allLocalMins = [];

    // console.log(`\n=== Поиск локальных минимумов (window = ${windowSize}) ===`);

    for (let i = windowSize; i < candles.length - windowSize; i++) {
        const candle = candles[i];
        const low = candle.low;

        if (low > currentPrice) continue;

        // Проверка — является ли минимумом в окне
        let isLocalMin = true;
        for (let j = i - windowSize; j <= i + windowSize; j++) {
            if (j !== i && candles[j].low <= low) {
                isLocalMin = false;
                break;
            }
        }

        if (!isLocalMin) continue;

        // Дополнительная информация для отладки
        const leftLow = Math.min(...candles.slice(Math.max(0, i - 20), i).map(c => c.low));
        const rightLow = Math.min(...candles.slice(i + 1, Math.min(candles.length, i + 20)).map(c => c.low));

        // console.log(`   [${i.toString().padStart(3)}] Low = ${low.toFixed(6)} | Left20=${leftLow.toFixed(6)} | Right20=${rightLow.toFixed(6)} | OK`);

        allLocalMins.push({
            ...candle,
            lowPrice: low,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i
        });
    }

    // console.log(`\nНайдено локальных минимумов: ${allLocalMins.length}`);

    if (allLocalMins.length === 0) {
        // console.log("❌ Не найдено ни одного локального минимума");
        return [];
    }

    // === Финальная фильтрация (убывающая последовательность) ===
    const finalMinima = [allLocalMins[allLocalMins.length - 1]]; // самый новый минимум
    
    // console.log(`\nФинальная убывающая фильтрация...`);

    for (let i = allLocalMins.length - 2; i >= 0; i--) {
        const curr = allLocalMins[i];
        const last = finalMinima[finalMinima.length - 1];
        const diffPercent = (last.lowPrice - curr.lowPrice) / last.lowPrice * 100;

        if (curr.lowPrice < last.lowPrice && diffPercent > 0.08 && (last.index - curr.index) > 4) {
            finalMinima.push(curr);
            // console.log(`   ✅ Добавлен: ${curr.dateTime} (-${diffPercent.toFixed(2)}%)`);
        } else {
            // console.log(`   ❌ Пропущен: ${curr.dateTime} (разница ${diffPercent.toFixed(2)}%)`);
        }
    }

    const result = finalMinima.reverse();
    // console.log(`\n=== findMinima FINISH | Возвращаем ${result.length} минимумов ===\n`);
    
    return result;
}


module.exports = {
    findMinima
};