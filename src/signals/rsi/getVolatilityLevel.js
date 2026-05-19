/**
 * Volatility Level Detector с адаптивным volatilityForSignal
 */
function getVolatilityLevel(candles, interval = '15') {
    if (!candles || !Array.isArray(candles) || candles.length < 30) {
        return createUnknownResult();
    }

    // Адаптивный период ATR
    const periodMap = {
        1: 30,
        3: 40,
        5: 50,
        15: 50,
        30: 42,
        60: 35,
        240: 25,
        D: 20,
    };
    const period = periodMap[interval] || 50;

    if (candles.length < period + 10) {
        return createUnknownResult();
    }

    // === Расчёт Wilder ATR ===
    const trValues = [];
    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        if (!curr?.high || !curr?.low || !prev?.close) continue;

        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
        trValues.push(tr);
    }

    if (trValues.length < period) {
        return createUnknownResult();
    }

    let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < trValues.length; i++) {
        atr = (atr * (period - 1) + trValues[i]) / period;
    }

    const currentPrice = candles[candles.length - 1].close;
    const volatilityPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

    // === Определение уровня (базовые пороги) ===
    let level, description, volatilityForSignal;

    if (volatilityPercent < 0.5) {
        level = 'очень низкий';
        description = 'Очень спокойный рынок';
    } else if (volatilityPercent < 0.85) {
        level = 'низкий';
        description = 'Спокойный рынок';
    } else if (volatilityPercent < 1.4) {
        level = 'средний';
        description = 'Нормальная волатильность';
    } else if (volatilityPercent < 2.3) {
        level = 'высокий';
        description = 'Повышенная волатильность';
    } else {
        level = 'очень высокий';
        description = 'Экстремальная волатильность';
    }

    // === АДАПТИВНЫЙ volatilityForSignal ===
    volatilityForSignal = getAdaptiveVolatilitySignal(
        interval,
        volatilityPercent
    );

    return {
        level,
        volatilityPercent: parseFloat(volatilityPercent.toFixed(3)),
        atr: parseFloat(atr.toFixed(8)),
        currentPrice: parseFloat(currentPrice.toFixed(8)),
        description,
        rawValue: volatilityPercent,
        volatilityForSignal,
        periodUsed: period,
        interval,
    };
}

/**
 * Адаптивный коэффициент volatilityForSignal в зависимости от интервала
 */
function getAdaptiveVolatilitySignal(interval, volatilityPercent) {
    const int = String(interval);

    // Базовые значения для разных таймфреймов
    if (['1'].includes(int)) {
        // Короткие интервалы — более чувствительные
        if (volatilityPercent < 0.5) return 0.2;
        if (volatilityPercent < 0.85) return 0.5;
        if (volatilityPercent < 1.4) return 0.9;
        if (volatilityPercent < 2.3) return 1.8;
        return 3.2;
    } else if (['5'].includes(int)) {
        // Короткие интервалы — более чувствительные
        if (volatilityPercent < 0.5) return 0.3;
        if (volatilityPercent < 0.85) return 0.45;
        if (volatilityPercent < 1.4) return 0.9;
        if (volatilityPercent < 2.3) return 1.8;
        return 3.2;
    } else if (int === '15') {
        if (volatilityPercent < 0.5) return 0.3;
        if (volatilityPercent < 0.85) return 0.55;
        if (volatilityPercent < 1.4) return 1.1;
        if (volatilityPercent < 2.3) return 2.1;
        return 3.5;
    } else if (int === '30') {
        if (volatilityPercent < 0.5) return 0.35;
        if (volatilityPercent < 0.85) return 0.7;
        if (volatilityPercent < 1.4) return 1.3;
        if (volatilityPercent < 2.3) return 2.4;
        return 3.8;
    } else if (['60', '240'].includes(int)) {
        // Средние и длинные ТФ
        if (volatilityPercent < 0.5) return 0.4;
        if (volatilityPercent < 0.85) return 0.85;
        if (volatilityPercent < 1.4) return 1.6;
        if (volatilityPercent < 2.3) return 2.8;
        return 4.5;
    } else {
        // Daily и выше
        if (volatilityPercent < 0.5) return 0.5;
        if (volatilityPercent < 0.85) return 1.1;
        if (volatilityPercent < 1.4) return 2.0;
        if (volatilityPercent < 2.3) return 3.5;
        return 6.0;
    }
}

function createUnknownResult() {
    return {
        level: 'unknown',
        volatilityPercent: 0,
        description: 'Недостаточно данных',
        volatilityForSignal: 0,
        atr: 0,
        currentPrice: 0,
        rawValue: 0,
    };
}

module.exports = { getVolatilityLevel };
