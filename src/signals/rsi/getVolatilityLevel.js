//=======================================

/**
 * Период ATR для каждого ТФ.
 * Принцип: ~14-20 классических Wilder периодов как база,
 * на мелких ТФ чуть больше для сглаживания шума.
 */
const ATR_PERIOD_BY_INTERVAL = {
    1: 15, //было 30 для теста поменял на 15
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
    1: [0.3, 0.7, 1.2, 1.8, 2.5],
    // ВНИМАНИЕ: low(1.0) > mid(0.9) — немонотонно, вероятно опечатка. Проверь.
    3: [0.3, 1, 0.9, 1.8, 3.2],
    5: [0.3, 1, 1.5, 2.0, 3.2],
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

    // Серия ATR с привязкой к свечам: [{ atr, candleIndex }]
    const atrSeries = calculateAtrSeries(candles, period);
    if (!atrSeries || atrSeries.length < HISTORY_WINDOW_FOR_MEDIAN) {
        return createUnknownResult(intKey, period);
    }

    // ATR% серия с КОРРЕКТНОЙ привязкой: каждый ATR делим на close ИМЕННО
    // его свечи. candleIndex — единственный источник выравнивания.
    // (calculateAtrSeries уже отбраковал битые свечи, поэтому close валиден.)
    const atrPctSeries = atrSeries.map(
        ({ atr, candleIndex }) => (atr / candles[candleIndex].close) * 100
    );

    // Опорная точка — предпоследняя закрытая свеча: последняя может быть live
    // и дёргаться. Берём и ATR, и цену с ОДНОЙ свечи — без рассинхрона.
    const refPos =
        atrSeries.length >= 2 ? atrSeries.length - 2 : atrSeries.length - 1;
    const refPoint = atrSeries[refPos];
    const refClose = candles[refPoint.candleIndex].close;

    const currentAtr = refPoint.atr;
    const volatilityPercent = (currentAtr / refClose) * 100;

    // Медиана «нормали»: последние N значений ATR%, заканчивая опорной точкой
    // (live-хвост в медиану не попадает).
    const medianWindow = atrPctSeries.slice(
        Math.max(0, refPos + 1 - HISTORY_WINDOW_FOR_MEDIAN),
        refPos + 1
    );
    const medianAtrPct = getMedian(medianWindow);
    const relativeRatio =
        medianAtrPct > 0 ? volatilityPercent / medianAtrPct : 1;

    // Классификация по относительному порогу
    const levelInfo = classifyByRelative(relativeRatio);

    // Тренд волатильности (по ATR%, до опорной точки включительно)
    const trend = calculateVolatilityTrend(atrPctSeries, refPos);

    // Множитель для сигналов
    const multipliers =
        SIGNAL_MULTIPLIERS[intKey] || SIGNAL_MULTIPLIERS[DEFAULT_INTERVAL];
    const volatilityForSignal = multipliers[levelInfo.index];

    return {
        level: levelInfo.level,
        description: levelInfo.description,
        volatilityPercent: round(volatilityPercent, 3),
        atr: round(currentAtr, 8),
        currentPrice: round(refClose, 8),
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
 * Возвращает [{ atr, candleIndex }] начиная с первого полного периода.
 * candleIndex — индекс свечи в исходном массиве, к которой относится это ATR.
 * Использует Wilder's smoothing.
 *
 * Выравнивание (фиксируется здесь и только здесь):
 *  - trValues[k] относится к candles[k + 1];
 *  - первый ATR = SMA(trValues[0..period-1]) => самый свежий TR в окне
 *    trValues[period-1] относится к candles[period]  => candleIndex = period;
 *  - дальше на шаге i используется trValues[i] (candles[i + 1]) => candleIndex = i + 1.
 */
function calculateAtrSeries(candles, period) {
    const trValues = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];

        if (!isValidCandle(curr) || !Number.isFinite(prev?.close)) {
            // Битая свеча — прерываем расчёт, т.к. Wilder рекурсивный
            // и дырки искажают результат.
            return null;
        }

        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - prev.close),
            Math.abs(curr.low - prev.close)
        );
        trValues.push(tr); // trValues[k] -> candles[k + 1]
    }

    if (trValues.length < period) return null;

    const series = [];

    // Первое значение — SMA первых N TR, привязано к свече period.
    let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    series.push({ atr, candleIndex: period });

    // Дальше — Wilder smoothing, привязка к свече i + 1.
    for (let i = period; i < trValues.length; i++) {
        atr = (atr * (period - 1) + trValues[i]) / period;
        series.push({ atr, candleIndex: i + 1 });
    }

    return series;
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
 * Тренд волатильности по серии ATR% (не по сырому ATR — иначе растущая цена
 * сама по себе даёт «expanding»).
 * Сравниваем последние 5 значений со СОСЕДНИМИ предыдущими 15 (окна не
 * пересекаются), заканчивая на endPos включительно.
 *   'expanding'   — волатильность растёт (часто = тренд / пробои)
 *   'contracting' — сжимается (часто = накопление перед движением)
 *   'stable'      — без изменений
 */
function calculateVolatilityTrend(series, endPos = series.length - 1) {
    const RECENT = 5;
    const BASE = 15;

    const recentEnd = endPos + 1;
    const recentStart = recentEnd - RECENT;
    const baseEnd = recentStart;
    const baseStart = baseEnd - BASE;

    if (baseStart < 0) return 'stable';

    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const recentAvg = avg(series.slice(recentStart, recentEnd));
    const baselineAvg = avg(series.slice(baseStart, baseEnd));

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
        candle.low > 0 &&
        candle.close > 0 // нужно для нормировки ATR% — гарантируем валидность close
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
