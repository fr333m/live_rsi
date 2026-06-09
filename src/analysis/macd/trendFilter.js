// ============================================================
// trendFilter.js
// Фильтр направления по старшему ТФ (напр. 60m) для входов на 1m/5m.
//
// Решение (одно из):
//   'long_only'  — тренд вверх  -> на младшем ТФ только лонги от поддержки
//   'short_only' — тренд вниз   -> только шорты от сопротивления
//   'both'       — рейндж/боковик -> отскоки от обеих границ разрешены
//   'none'       — переходная зона / критерии расходятся -> не торговать
//
// Сначала отвечаем на вопрос ТРЕНД или РЕЙНДЖ — через Efficiency Ratio
// (чистый ход ÷ суммарный путь за окно): ~1 = чистый тренд, ~0 = пила.
// В рейндже сразу 'both', не пытаясь назначить сторону (иначе фильтр будет
// дёргаться на каждом колебании около нуля).
//
// Если режим трендовый — направление берём из ДВУХ медленных критериев:
//   1) MACD-линия относительно НУЛЯ (а не пересечение с сигнальной)
//   2) структура рынка по фракталам: HH+HL = вверх, LH+LL = вниз
//
// Правила сведения (только в трендовом режиме):
//   - оба за одно направление          -> long_only / short_only (confirmed)
//   - один направлен, другой нейтрален  -> то же направление (lean)
//   - оба нейтральны                    -> направление по наклону (by_slope)
//   - направлены ПРОТИВ друг друга       -> none (conflict — переходная зона)
//
// ВАЖНО: подавай ЗАКРЫТЫЕ часовые свечи. На недозакрытой свече MACD и
// структура репейнтят, и решение будет плясать весь час. Пересчитывай на
// закрытии каждой часовой свечи и держи фиксированным следующий час.
// ============================================================

const { getMacd } = require('./macd');
const logger = require('../../utils/logger');

const SWING_BARS = 2; // фрактал по 2 бара с каждой стороны

// ----------------------------------------------------------------
// Структура рынка: последние два свинг-хая и две свинг-лоу.
// ----------------------------------------------------------------
function findSwings(candles) {
    const highs = [],
        lows = [];
    for (let i = SWING_BARS; i < candles.length - SWING_BARS; i++) {
        const h = candles[i].high,
            l = candles[i].low;
        let isHigh = true,
            isLow = true;
        for (let j = 1; j <= SWING_BARS; j++) {
            if (candles[i - j].high >= h || candles[i + j].high >= h)
                isHigh = false;
            if (candles[i - j].low <= l || candles[i + j].low <= l)
                isLow = false;
        }
        if (isHigh) highs.push({ i, price: h });
        if (isLow) lows.push({ i, price: l });
    }
    return { highs, lows };
}

function structureVote(candles, tol = 0.15) {
    const { highs, lows } = findSwings(candles);
    if (highs.length < 2 || lows.length < 2) {
        return { vote: 0, reason: 'no_structure' };
    }
    const h2 = highs[highs.length - 1],
        h1 = highs[highs.length - 2];
    const l2 = lows[lows.length - 1],
        l1 = lows[lows.length - 2];

    // допуск относительно высоты текущего свинга — равные хаи/лоу = "флэт",
    // а не ложный нисходящий тренд
    const scale = Math.max(h2.price - l2.price, 1e-9);
    const dh = (h2.price - h1.price) / scale;
    const dl = (l2.price - l1.price) / scale;
    const hDir = dh > tol ? 1 : dh < -tol ? -1 : 0;
    const lDir = dl > tol ? 1 : dl < -tol ? -1 : 0;

    if (hDir > 0 && lDir > 0) return { vote: 1, reason: 'HH_HL', dh, dl };
    if (hDir < 0 && lDir < 0) return { vote: -1, reason: 'LH_LL', dh, dl };
    return { vote: 0, reason: 'mixed', dh, dl };
}

// ----------------------------------------------------------------
// Режим по MACD: положение MACD-линии относительно нуля с мёртвой зоной,
// чтобы у самого нуля не дёргалось.
// ----------------------------------------------------------------
function macdVote(candles, deadzone = 0.15) {
    const r = getMacd(candles);
    const last = r.latest.macd;
    if (!r.macd || last == null)
        return { vote: 0, reason: 'macd_insufficient', value: null };

    const finite = r.macd.filter(Number.isFinite);
    const scale = finite.length
        ? finite.reduce((a, b) => a + Math.abs(b), 0) / finite.length
        : 0;
    const band = scale * deadzone;

    if (last > band) return { vote: 1, reason: 'macd_above_zero', value: last };
    if (last < -band)
        return { vote: -1, reason: 'macd_below_zero', value: last };
    return { vote: 0, reason: 'macd_near_zero', value: last };
}

// ----------------------------------------------------------------
// Efficiency Ratio (Kaufman): |чистый ход| / суммарный путь за окно.
// ~1 = движение одним куском (тренд); ~0 = ходили туда-сюда (рейндж).
// ----------------------------------------------------------------
function efficiencyRatio(candles, lookback) {
    const n = candles.length;
    const L = Math.min(lookback, n - 1);
    if (L < 1) return 0;
    const closes = candles.map((c) => c.close);
    const net = Math.abs(closes[n - 1] - closes[n - 1 - L]);
    let path = 0;
    for (let i = n - L; i < n; i++) path += Math.abs(closes[i] - closes[i - 1]);
    return path > 0 ? net / path : 0;
}

// ----------------------------------------------------------------
// Основная функция.
// ----------------------------------------------------------------
function getTrendFilter(hourlyCandles, opts = {}) {
    const {
        macdDeadzone = 0.15,
        structTol = 0.15,
        minCandles = 40,
        erLookback = 24,
        rangeThreshold = 0.3,
    } = opts;

    logger.debug('[TrendFilter] getTrendFilter called', {
        candles: hourlyCandles?.length,
        erLookback,
        rangeThreshold,
    });

    if (!Array.isArray(hourlyCandles) || hourlyCandles.length < minCandles) {
        logger.warn('[TrendFilter] Insufficient data', {
            got: hourlyCandles?.length,
            need: minCandles,
        });
        return result('none', 'insufficient_data', {});
    }
    const valid = hourlyCandles.every(
        (c) =>
            c &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low) &&
            Number.isFinite(c.close)
    );
    if (!valid) {
        logger.warn('[TrendFilter] Bad candles — non-finite values detected');
        return result('none', 'bad_candles', {});
    }

    const er = efficiencyRatio(hourlyCandles, erLookback);
    const m = macdVote(hourlyCandles, macdDeadzone);
    const s = structureVote(hourlyCandles, structTol);

    logger.debug('[TrendFilter] Votes', {
        er: er.toFixed(3),
        macd: m,
        structure: s,
    });

    // 1) РЕЖИМ: рейндж -> обе стороны разрешены, направление не назначаем
    if (er < rangeThreshold) {
        logger.info('[TrendFilter] Range mode', {
            er: er.toFixed(3),
            threshold: rangeThreshold,
        });
        return result('both', 'range', { er, macd: m, structure: s });
    }

    // 2) ТРЕНД: направлены против друг друга -> переходная зона
    if (m.vote * s.vote < 0) {
        logger.info('[TrendFilter] Conflict — macd and structure disagree', {
            macdVote: m.vote,
            structVote: s.vote,
        });
        return result('none', 'conflict', { er, macd: m, structure: s });
    }

    const score = m.vote + s.vote;
    let decision, reason;
    if (score > 0) {
        decision = 'long_only';
        reason = score === 2 ? 'uptrend_confirmed' : 'uptrend_lean';
    } else if (score < 0) {
        decision = 'short_only';
        reason = score === -2 ? 'downtrend_confirmed' : 'downtrend_lean';
    } else {
        // тренд есть (ER высокий), но индикаторы нейтральны -> сторона по наклону
        const closes = hourlyCandles.map((c) => c.close);
        const n = closes.length;
        const net = closes[n - 1] - closes[n - 1 - Math.min(erLookback, n - 1)];
        decision = net >= 0 ? 'long_only' : 'short_only';
        reason = 'trend_by_slope';
    }

    logger.info('[TrendFilter] Decision', {
        decision,
        reason,
        er: er.toFixed(3),
        score,
    });

    return result(decision, reason, { er, macd: m, structure: s, score });
}

// ----------------------------------------------------------------
// Стыковка с младшим ТФ: пропускаем ли сигнал данной стороны.
//   side: 'long' | 'short'
// ----------------------------------------------------------------
function isAllowed(decision, side) {
    if (decision === 'both') return true;
    if (decision === 'long_only') return side === 'long';
    if (decision === 'short_only') return side === 'short';
    return false; // 'none'
}

// Отскок от поддержки = long, от сопротивления = short.
function allowedForLevel(decision, level) {
    const side = level.dominantType === 'resistance' ? 'short' : 'long';
    return isAllowed(decision, side);
}

function result(decision, reason, detail) {
    return { decision, reason, detail };
}

module.exports = { getTrendFilter, isAllowed, allowedForLevel };

/* ── Проводка ───────────────────────────────────────────────────────────
const { getTrendFilter, allowedForLevel } = require('./trendFilter');

// на закрытии каждой ЧАСОВОЙ свечи:
let hourlyBias = getTrendFilter(closedHourlyCandles); // фиксируем на час

// на минутном сигнале (level из buildLevels):
if (hourlyBias.decision === 'none') return;            // переходная зона — пропуск
if (!allowedForLevel(hourlyBias.decision, level)) return; // против тренда — пропуск
// иначе сигнал проходит дальше в конфлюэнцию (стена/absorption/...)
──────────────────────────────────────────────────────────────────────── */
