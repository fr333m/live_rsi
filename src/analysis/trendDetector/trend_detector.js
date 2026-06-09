/**
 * trendDetector.js
 * Методы определения тренда для крипто-бота
 * Node.js ES6+
 *
 * Входные данные (candles) — массив объектов:
 * [{ open, high, low, close, volume, timestamp }, ...]
 * Отсортированы от старых к новым (candles[0] — самая старая)
 */

// ─────────────────────────────────────────────
// 1. СКОЛЬЗЯЩИЕ СРЕДНИЕ (EMA / SMA)
// ─────────────────────────────────────────────

const calcSMA = (closes, period) => {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    return slice.reduce((sum, v) => sum + v, 0) / period;
};

const calcEMA = (closes, period) => {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
};

/**
 * Сигнал по EMA-кроссоверу
 * @returns {{ trend: 'up'|'down'|'flat', fastEMA, slowEMA }}
 */
const emaCrossover = (candles, fastPeriod = 9, slowPeriod = 21) => {
    const closes = candles.map((c) => c.close);
    const fast = calcEMA(closes, fastPeriod);
    const slowVal = calcEMA(closes, slowPeriod);

    if (fast === null || slowVal === null)
        return { trend: 'flat', fastEMA: null, slowEMA: null };

    const trend = fast > slowVal ? 'up' : fast < slowVal ? 'down' : 'flat';
    return { trend, fastEMA: fast, slowEMA: slowVal };
};

// ─────────────────────────────────────────────
// 2. ADX (Average Directional Index)
// ─────────────────────────────────────────────

/**
 * @returns {{ adx, plusDI, minusDI, trend: 'up'|'down'|'flat', strong: boolean }}
 */
const calcADX = (candles, period = 14) => {
    if (candles.length < period * 2) return null;

    const trueRanges = [];
    const plusDMs = [];
    const minusDMs = [];

    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];

        const tr = Math.max(
            curr.high - curr.low,
            Math.abs(curr.high - candles[i - 1].close),
            Math.abs(curr.low - candles[i - 1].close)
        );

        const upMove = curr.high - candles[i - 1].high;
        const downMove = candles[i - 1].low - curr.low;

        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
        trueRanges.push(tr);
    }

    // Сглаживание Уайлдера
    const smooth = (arr, p) => {
        let val = arr.slice(0, p).reduce((s, v) => s + v, 0);
        const result = [val];
        for (let i = p; i < arr.length; i++) {
            val = val - val / p + arr[i];
            result.push(val);
        }
        return result;
    };

    const sTR = smooth(trueRanges, period);
    const sPDM = smooth(plusDMs, period);
    const sMDM = smooth(minusDMs, period);

    const dxValues = [];
    for (let i = 0; i < sTR.length; i++) {
        if (sTR[i] === 0) continue;
        const pDI = (sPDM[i] / sTR[i]) * 100;
        const mDI = (sMDM[i] / sTR[i]) * 100;
        const dx = (Math.abs(pDI - mDI) / (pDI + mDI)) * 100;
        dxValues.push({ dx, pDI, mDI });
    }

    if (dxValues.length < period) return null;

    const lastN = dxValues.slice(-period);
    const adx = lastN.reduce((s, v) => s + v.dx, 0) / period;
    const { pDI: plusDI, mDI: minusDI } = dxValues[dxValues.length - 1];

    return {
        adx: +adx.toFixed(2),
        plusDI: +plusDI.toFixed(2),
        minusDI: +minusDI.toFixed(2),
        trend: plusDI > minusDI ? 'up' : 'down',
        strong: adx > 25,
    };
};

// ─────────────────────────────────────────────
// 3. СТРУКТУРА РЫНКА (HH/HL, LH/LL)
// ─────────────────────────────────────────────

/**
 * Находит локальные экстремумы (ZigZag-подход)
 * @returns {{ trend: 'up'|'down'|'flat', swings }}
 */
const marketStructure = (candles, lookback = 5) => {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const pivotHighs = [];
    const pivotLows = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
        const windowHighs = highs.slice(i - lookback, i + lookback + 1);
        const windowLows = lows.slice(i - lookback, i + lookback + 1);

        if (highs[i] === Math.max(...windowHighs))
            pivotHighs.push({ i, value: highs[i] });
        if (lows[i] === Math.min(...windowLows))
            pivotLows.push({ i, value: lows[i] });
    }

    if (pivotHighs.length < 2 || pivotLows.length < 2)
        return { trend: 'flat', swings: [] };

    const lastTwoHighs = pivotHighs.slice(-2);
    const lastTwoLows = pivotLows.slice(-2);

    const hhhl =
        lastTwoHighs[1].value > lastTwoHighs[0].value &&
        lastTwoLows[1].value > lastTwoLows[0].value;

    const lhll =
        lastTwoHighs[1].value < lastTwoHighs[0].value &&
        lastTwoLows[1].value < lastTwoLows[0].value;

    return {
        trend: hhhl ? 'up' : lhll ? 'down' : 'flat',
        swings: { pivotHighs: lastTwoHighs, pivotLows: lastTwoLows },
    };
};

// ─────────────────────────────────────────────
// 4. ЛИНЕЙНАЯ РЕГРЕССИЯ (slope)
// ─────────────────────────────────────────────

/**
 * @returns {{ slope, slopePercent, trend: 'up'|'down'|'flat' }}
 */
const linearRegressionTrend = (
    candles,
    period = 20,
    threshold = 0.02
) => {
    const closes = candles.slice(-period).map((c) => c.close);
    const n = closes.length;
    if (n < 2) return null;

    const xMean = (n - 1) / 2;
    const yMean = closes.reduce((s, v) => s + v, 0) / n;

    let num = 0,
        den = 0;
    for (let i = 0; i < n; i++) {
        num += (i - xMean) * (closes[i] - yMean);
        den += (i - xMean) ** 2;
    }

    const slope = den === 0 ? 0 : num / den;
    const slopePercent = (slope / yMean) * 100; // нормализованный наклон в %

    return {
        slope: +slope.toFixed(6),
        slopePercent: +slopePercent.toFixed(4),
        trend:
            slopePercent > threshold
                ? 'up'
                : slopePercent < -threshold
                  ? 'down'
                  : 'flat',
    };
};

// ─────────────────────────────────────────────
// 5. SUPERTREND
// ─────────────────────────────────────────────

/**
 * @returns {{ trend: 'up'|'down', supertrend, lastClose }}
 */
const calcSupertrend = (candles, period = 10, multiplier = 3) => {
    if (candles.length < period + 1) return null;

    const atrValues = [];
    for (let i = 1; i < candles.length; i++) {
        const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
        atrValues.push(tr);
    }

    // ATR сглаживание (RMA / Wilder)
    let atr = atrValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
    const atrs = [atr];
    for (let i = period; i < atrValues.length; i++) {
        atr = (atr * (period - 1) + atrValues[i]) / period;
        atrs.push(atr);
    }

    // Supertrend расчёт
    let trend = 1; // 1 = up, -1 = down
    let prevUpper = 0,
        prevLower = 0;
    let supertrend = 0;

    for (let i = 0; i < atrs.length; i++) {
        const idx = i + period; // соответствующая свеча
        const hl2 = (candles[idx].high + candles[idx].low) / 2;
        const upper = hl2 + multiplier * atrs[i];
        const lower = hl2 - multiplier * atrs[i];

        const finalUpper =
            upper < prevUpper || candles[idx - 1]?.close > prevUpper
                ? upper
                : prevUpper;
        const finalLower =
            lower > prevLower || candles[idx - 1]?.close < prevLower
                ? lower
                : prevLower;

        if (candles[idx].close > finalUpper) trend = 1;
        else if (candles[idx].close < finalLower) trend = -1;

        supertrend = trend === 1 ? finalLower : finalUpper;
        prevUpper = finalUpper;
        prevLower = finalLower;
    }

    return {
        trend: trend === 1 ? 'up' : 'down',
        supertrend: +supertrend.toFixed(4),
        lastClose: candles[candles.length - 1].close,
    };
};

// ─────────────────────────────────────────────
// 6. КОМБИНИРОВАННЫЙ ФИЛЬТР ТРЕНДА
// ─────────────────────────────────────────────

/**
 * Агрегирует все методы и выдаёт итоговый сигнал
 * @returns {{ signal: 'up'|'down'|'flat', confidence: number, details }}
 */
const combinedTrendFilter = (candles) => {
    const ema = emaCrossover(candles, 9, 21);
    const adx = calcADX(candles, 14);
    const structure = marketStructure(candles, 5);
    const regression = linearRegressionTrend(candles, 20);
    const supertrend = calcSupertrend(candles, 10, 3);

    const votes = { up: 0, down: 0, flat: 0 };

    // Вес каждого метода
    const add = (trend, weight = 1) => {
        if (trend) votes[trend] += weight;
    };

    add(ema.trend, 1);
    add(adx?.trend, adx?.strong ? 2 : 1); // ADX с весом 2 если тренд сильный
    add(structure.trend, 1);
    add(regression?.trend, 1);
    add(supertrend?.trend, 1.5); // Supertrend — надёжный, чуть больший вес

    const total = votes.up + votes.down + votes.flat;
    const signal =
        votes.up >= votes.down && votes.up >= votes.flat
            ? 'up'
            : votes.down >= votes.up && votes.down >= votes.flat
              ? 'down'
              : 'flat';

    const confidence = +((votes[signal] / total) * 100).toFixed(1);

    return {
        signal,
        confidence, // % согласованности методов
        details: { ema, adx, structure, regression, supertrend },
    };
};

module.exports = {
    calcSMA,
    calcEMA,
    emaCrossover,
    calcADX,
    marketStructure,
    linearRegressionTrend,
    calcSupertrend,
    combinedTrendFilter,
};
