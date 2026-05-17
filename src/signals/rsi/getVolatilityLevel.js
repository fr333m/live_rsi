/**
 * Volatility Level Detector
 * Определяет уровень волатильности монеты
 */

function getVolatilityLevel(candles, period = 50) {
    if (!candles || candles.length < period + 10) {
        return {
            level: 'unknown',
            volatilityPercent: 0,
            description: 'Недостаточно данных',
        };
    }

    // === Расчёт ATR ===
    let atrSum = 0;
    const atrValues = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );

        atrValues.push(tr);
    }

    // Берём средний ATR за последние `period` свечей
    const recentATR = atrValues.slice(-period);
    const atr = recentATR.reduce((a, b) => a + b, 0) / recentATR.length;

    // Текущая цена
    const currentPrice = candles[candles.length - 1].close;

    // Волатильность в процентах (ATR %)
    const volatilityPercent = (atr / currentPrice) * 100;

    // === Определение уровня ===
    let level;
    let description;
    let volatilityForSignal;

    if (volatilityPercent < 0.5) {
        level = 'очень низкий';
        description = 'Очень спокойный рынок';
        volatilityForSignal = 0.3;
    } else if (volatilityPercent < 0.8) {
        level = 'низкий';
        description = 'Спокойный рынок';
        volatilityForSignal = 0.5;
    } else if (volatilityPercent < 1.2) {
        level = 'средний';
        description = 'Нормальная волатильность';
        volatilityForSignal = 1.0;
    } else if (volatilityPercent < 2.0) {
        level = 'высокий';
        description = 'Повышенная волатильность';
        volatilityForSignal = 2.0;
    } else {
        level = 'очень высокий';
        description = 'Экстремальная волатильность';
        volatilityForSignal = 3.5;
    }

    return {
        level, // "низкий" | "средний" | "высокий" | "очень высокий"
        volatilityPercent: parseFloat(volatilityPercent.toFixed(3)),
        atr: parseFloat(atr.toFixed(8)),
        currentPrice: parseFloat(currentPrice.toFixed(8)),
        description,
        rawValue: volatilityPercent,
        volatilityForSignal,
    };
}

// ====================== ЭКСПОРТ ======================
module.exports = {
    getVolatilityLevel,
};
