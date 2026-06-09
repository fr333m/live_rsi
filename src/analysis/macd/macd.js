// ============================================================
// macd.js
const logger = require('../../utils/logger');
// MACD (Moving Average Convergence Divergence).
//
//   MACD-линия   = EMA(fast) - EMA(slow)            (по умолч. 12, 26)
//   Сигнальная   = EMA(signal) от MACD-линии        (по умолч. 9)
//   Гистограмма  = MACD-линия - Сигнальная
//
// Возвращает ПОЛНЫЕ серии (выровнены по индексам свечей, с null там, где
// значение ещё не определено) + сводку по последней свече с пересечением.
//
// Выравнивание (важно — здесь обычно ошибаются):
//   - EMA(period) определена с индекса (period - 1): первое значение = SMA
//     первых period значений, дальше рекурсия EMA.
//   - MACD-линия определена с индекса (slow - 1)            [= 25 при slow=26]
//   - Сигнальная = EMA(signal) ОТ MACD-линии, поэтому стартует ещё на
//     (signal - 1) позже: с индекса (slow - 1) + (signal - 1) [= 33]
//
// Замечание о сходимости (как и у RSI): EMA рекурсивна, поэтому значения
// слегка зависят от объёма поданной истории и не будут бит-в-бит совпадать
// с TradingView (там другой посев EMA). Чем больше свечей подаёшь, тем
// ближе. Для устойчивых значений давай хотя бы ~slow*3 + signal свечей.
// ============================================================

/**
 * EMA-серия той же длины, что values. Ведущие позиции — null.
 * Корректно обрабатывает ведущие null во входе (для сигнальной линии,
 * которая считается от MACD-линии с её собственным "хвостом" из null).
 */

function emaSeries(values, period) {
    const n = values.length;
    const out = new Array(n).fill(null);
    if (period < 1) return out;

    // первый валидный индекс (у MACD-линии впереди идут null)
    let start = 0;
    while (start < n && !Number.isFinite(values[start])) start++;
    if (start + period > n) return out; // данных не хватает на посев

    // посев: SMA первых period валидных значений
    let sum = 0;
    for (let i = start; i < start + period; i++) sum += values[i];
    let prev = sum / period;
    const seedIdx = start + period - 1;
    out[seedIdx] = prev;

    const k = 2 / (period + 1);
    for (let i = seedIdx + 1; i < n; i++) {
        if (!Number.isFinite(values[i])) {
            out[i] = null;
            continue;
        }
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/**
 * @param candles массив свечей с полем .close (как в getRsi), либо массив чисел
 * @param opts    { fast=12, slow=26, signal=9 }
 * @returns {
 *   macd:      number[]|null   // выровнено по свечам, null до (slow-1)
 *   signal:    number[]|null   // null до (slow-1)+(signal-1)
 *   histogram: number[]|null
 *   latest: {
 *     macd, signal, histogram,           // значения на последней свече
 *     trend: 'bullish'|'bearish'|null,   // macd выше/ниже сигнальной
 *     cross: 'bullish'|'bearish'|null,   // пересечение ПРОИЗОШЛО на последней свече
 *     crossAgo: number|null              // сколько свечей назад последнее пересечение
 *   }
 * }
 */
function getMacd(candles, opts = {}) {
    const { fast = 12, slow = 26, signal = 9 } = opts;

    logger.debug('[MACD] getMacd called', {
        candles: candles?.length,
        fast,
        slow,
        signal,
    });

    if (!Array.isArray(candles) || candles.length === 0) {
        logger.warn('[MACD] Empty or invalid candles array');
        return emptyResult();
    }

    const closes = candles.map((c) => (typeof c === 'number' ? c : c?.close));
    if (closes.some((v) => !Number.isFinite(v))) {
        logger.warn('[MACD] Non-finite values in closes');
        return emptyResult();
    }

    const minLen = slow + signal - 1;
    if (closes.length < minLen) {
        logger.warn('[MACD] Not enough candles', {
            got: closes.length,
            need: minLen,
        });
        return emptyResult();
    }

    const fastEma = emaSeries(closes, fast);
    const slowEma = emaSeries(closes, slow);

    const macd = closes.map((_, i) =>
        Number.isFinite(fastEma[i]) && Number.isFinite(slowEma[i])
            ? fastEma[i] - slowEma[i]
            : null
    );

    const signalLine = emaSeries(macd, signal);

    const histogram = closes.map((_, i) =>
        Number.isFinite(macd[i]) && Number.isFinite(signalLine[i])
            ? macd[i] - signalLine[i]
            : null
    );

    const result = {
        macd,
        signal: signalLine,
        histogram,
        latest: summarize(macd, signalLine, histogram),
    };

    logger.debug('[MACD] Result', {
        macd: result.latest.macd?.toFixed(6),
        signal: result.latest.signal?.toFixed(6),
        histogram: result.latest.histogram?.toFixed(6),
        trend: result.latest.trend,
        cross: result.latest.cross,
        crossAgo: result.latest.crossAgo,
    });

    return result;
}

/**
 * Последнее пересечение MACD и сигнальной по смене знака гистограммы.
 * Возвращает { type, index } или null.
 *   bullish — гистограмма перешла из <=0 в >0 (MACD пересёк сигнальную вверх)
 *   bearish — наоборот
 */
function lastCross(histogram) {
    let prevIdx = -1;
    let last = null;
    for (let i = 0; i < histogram.length; i++) {
        if (!Number.isFinite(histogram[i])) continue;
        if (prevIdx === -1) {
            prevIdx = i;
            continue;
        }
        const a = histogram[prevIdx],
            b = histogram[i];
        if (a <= 0 && b > 0) {
            prevIdx = i;
            last = { type: 'bullish', index: i };
        } else if (a >= 0 && b < 0) {
            prevIdx = i;
            last = { type: 'bearish', index: i };
        } else prevIdx = i;
    }
    return last;
}

function summarize(macd, signalLine, histogram) {
    const last = histogram.length - 1;
    const m = macd[last],
        s = signalLine[last],
        h = histogram[last];

    if (!Number.isFinite(m) || !Number.isFinite(s)) {
        return {
            macd: null,
            signal: null,
            histogram: null,
            trend: null,
            cross: null,
            crossAgo: null,
        };
    }

    const cross = lastCross(histogram);
    return {
        macd: m,
        signal: s,
        histogram: h,
        trend: m >= s ? 'bullish' : 'bearish',
        cross: cross && cross.index === last ? cross.type : null, // пересечение именно сейчас
        crossAgo: cross ? last - cross.index : null,
    };
}

function emptyResult() {
    return {
        macd: null,
        signal: null,
        histogram: null,
        latest: {
            macd: null,
            signal: null,
            histogram: null,
            trend: null,
            cross: null,
            crossAgo: null,
        },
    };
}

module.exports = { getMacd, emaSeries, lastCross };
