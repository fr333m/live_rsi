/**
 * Volatility Level Detector с адаптивным volatilityForSignal
 */
/**
 * Период ATR для каждого ТФ.
 * Принцип: ~14-20 классических Wilder периодов как база,
 * на мелких ТФ чуть больше для сглаживания шума.
 */
const ATR_PERIOD_BY_INTERVAL = {
    1: 30,
    3: 25,
    5: 20,
    15: 20,
    30: 18,
    60: 16,
    240: 14,
    D: 14,
};

/**
 * Сколько свечей истории ATR% использовать для медианы (относительные пороги).
 * Чем больше — тем стабильнее «нормаль», но медленнее адаптация.
 */
const HISTORY_WINDOW_FOR_MEDIAN = 100;

/**
 * Относительные пороги: во сколько раз текущая волатильность
 * отличается от своей медианы за последние N свечей.
 * Универсально для любого инструмента и ТФ.
 */
const RELATIVE_THRESHOLDS = {
    veryLow: 0.5, // < 0.5x медианы
    low: 0.8, // < 0.8x
    mid: 1.3, // < 1.3x
    high: 2.0, // < 2.0x
    // выше — очень высокий
};

/**
 * Множители для volatilityForSignal по ТФ.
 * Индексы: [veryLow, low, mid, high, veryHigh]
 */
const SIGNAL_MULTIPLIERS = {
    1: [0.2, 0.5, 0.9, 1.8, 3.2],
    3: [0.25, 0.48, 0.9, 1.8, 3.2],
    5: [0.3, 0.45, 0.9, 1.8, 3.2],
    15: [0.3, 0.55, 1.1, 2.1, 3.5],
    30: [0.35, 0.7, 1.3, 2.4, 3.8],
    60: [0.4, 0.85, 1.6, 2.8, 4.5],
    240: [0.4, 0.85, 1.6, 2.8, 4.5],
    D: [0.5, 1.1, 2.0, 3.5, 6.0],
};

const DEFAULT_INTERVAL = '15';

const LEVEL_LABELS = {
    veryLow: {
        level: 'очень низкий',
        description: 'Очень спокойный рынок',
        index: 0,
    },
    low: { level: 'низкий', description: 'Спокойный рынок', index: 1 },
    mid: {
        level: 'средний',
        description: 'Нормальная волатильность',
        index: 2,
    },
    high: {
        level: 'высокий',
        description: 'Повышенная волатильность',
        index: 3,
    },
    veryHigh: {
        level: 'очень высокий',
        description: 'Экстремальная волатильность',
        index: 4,
    },
};

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ
// ============================================================

function getVolatilityLevel(candles, interval = DEFAULT_INTERVAL) {
    const intKey = String(interval);
    const period =
        ATR_PERIOD_BY_INTERVAL[intKey] ||
        ATR_PERIOD_BY_INTERVAL[DEFAULT_INTERVAL];

    // Валидация входа
    if (
        !Array.isArray(candles) ||
        candles.length < period + HISTORY_WINDOW_FOR_MEDIAN
    ) {
        return createUnknownResult(intKey, period);
    }

    // Считаем массив всех ATR значений (нужен для тренда и медианы)
    const atrSeries = calculateAtrSeries(candles, period);
    if (!atrSeries || atrSeries.length < HISTORY_WINDOW_FOR_MEDIAN) {
        return createUnknownResult(intKey, period);
    }

    // Используем close ПРЕДПОСЛЕДНЕЙ закрытой свечи для стабильности сигналов
    // (последняя может быть live и дёргаться)
    const referenceCandle =
        candles[candles.length - 2] || candles[candles.length - 1];
    const currentPrice = referenceCandle.close;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        return createUnknownResult(intKey, period);
    }

    const currentAtr = atrSeries[atrSeries.length - 1];
    const volatilityPercent = (currentAtr / currentPrice) * 100;

    // Серия ATR в процентах для расчёта медианы
    const atrPctSeries = atrSeries
        .map((atr, i) => {
            const candle = candles[i + 1]; // atrSeries сдвинут на 1 относительно candles
            return candle?.close > 0 ? (atr / candle.close) * 100 : 0;
        })
        .filter((v) => v > 0);

    const medianAtrPct = getMedian(
        atrPctSeries.slice(-HISTORY_WINDOW_FOR_MEDIAN)
    );
    const relativeRatio =
        medianAtrPct > 0 ? volatilityPercent / medianAtrPct : 1;

    // Классификация по относительному порогу
    const levelInfo = classifyByRelative(relativeRatio);

    // Тренд волатильности (расширяется/сжимается)
    const trend = calculateVolatilityTrend(atrSeries);

    // Множитель для сигналов
    const multipliers =
        SIGNAL_MULTIPLIERS[intKey] || SIGNAL_MULTIPLIERS[DEFAULT_INTERVAL];
    const volatilityForSignal = multipliers[levelInfo.index];

    return {
        level: levelInfo.level,
        description: levelInfo.description,
        volatilityPercent: round(volatilityPercent, 3),
        atr: round(currentAtr, 8),
        currentPrice: round(currentPrice, 8),
        medianVolatilityPercent: round(medianAtrPct, 3),
        relativeRatio: round(relativeRatio, 2),
        trend, // 'expanding' | 'contracting' | 'stable'
        rawValue: volatilityPercent,
        volatilityForSignal,
        periodUsed: period,
        interval: intKey,
    };
}

// ============================================================
// РАСЧЁТ ATR (Wilder)
// ============================================================

/**
 * Возвращает массив всех значений ATR начиная с первого полного периода.
 * Использует Wilder's smoothing.
 */
function calculateAtrSeries(candles, period) {
    const trValues = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        if (!isValidCandle(curr) || !Number.isFinite(prev?.close)) {
            // Битая свеча — прерываем расчёт, т.к. Wilder рекурсивный
            // и дырки искажают результат
            return null;
        }

        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
        trValues.push(tr);
    }

    if (trValues.length < period) return null;

    const atrSeries = [];
    // Первое значение — SMA первых N TR
    let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    atrSeries.push(atr);

    // Дальше — Wilder smoothing
    for (let i = period; i < trValues.length; i++) {
        atr = (atr * (period - 1) + trValues[i]) / period;
        atrSeries.push(atr);
    }

    return atrSeries;
}

// ============================================================
// КЛАССИФИКАЦИЯ И ТРЕНД
// ============================================================

function classifyByRelative(ratio) {
    if (ratio < RELATIVE_THRESHOLDS.veryLow) return LEVEL_LABELS.veryLow;
    if (ratio < RELATIVE_THRESHOLDS.low) return LEVEL_LABELS.low;
    if (ratio < RELATIVE_THRESHOLDS.mid) return LEVEL_LABELS.mid;
    if (ratio < RELATIVE_THRESHOLDS.high) return LEVEL_LABELS.high;
    return LEVEL_LABELS.veryHigh;
}

/**
 * Тренд волатильности: сравниваем последние 5 значений ATR со средним за 20.
 * 'expanding'   — волатильность растёт (часто = тренд / пробои)
 * 'contracting' — сжимается (часто = накопление перед движением)
 * 'stable'      — без изменений
 */
function calculateVolatilityTrend(atrSeries) {
    if (atrSeries.length < 20) return 'stable';

    const recent = atrSeries.slice(-5);
    const baseline = atrSeries.slice(-20);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const baselineAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length;

    if (baselineAvg === 0) return 'stable';

    const ratio = recentAvg / baselineAvg;
    if (ratio > 1.15) return 'expanding';
    if (ratio < 0.85) return 'contracting';
    return 'stable';
}

// ============================================================
// УТИЛИТЫ
// ============================================================

function isValidCandle(candle) {
    return (
        candle &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high > 0 &&
        candle.low > 0
    );
}

function getMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(num, decimals) {
    if (!Number.isFinite(num)) return null;
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

function createUnknownResult(interval = null, period = null) {
    return {
        level: 'неизвестно',
        description: 'Недостаточно данных',
        volatilityPercent: null,
        atr: null,
        currentPrice: null,
        medianVolatilityPercent: null,
        relativeRatio: null,
        trend: 'stable',
        rawValue: null,
        volatilityForSignal: null,
        periodUsed: period,
        interval,
    };
}

module.exports = { getVolatilityLevel };
