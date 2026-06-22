// candlePatterns.js
// Определение разворотных свечных формаций по последней закрывшейся свече:
//   hammer / hanging_man            — длинная НИЖНЯЯ тень
//   inverted_hammer / shooting_star — длинная ВЕРХНЯЯ тень
// Какая именно из пары — решает контекст RSI (перепроданность vs перекупленность).

const dbService = require('../../db/index'); // подставь свой путь
const rsiCache = require('../../cache/rsiCache'); // подставь свой путь
const { sendSignal } = require('../../telegram/sendSignal');

// --- источник данных ---
const SOURCE_TABLE = 'tracking_contracts';
const CANDLE_LIMIT = 5; // только последняя закрытая свеча

// --- форма свечи ---
const LONG_WICK_RATIO = 2; // длинная тень >= 2 тел
const SHORT_WICK_RATIO = 0.3; // противоположная тень <= 30% от длинной
const MIN_BODY_FRACTION = 0.05; // тело >= 5% диапазона (иначе это доджи, не молот)

// --- пороги RSI ---
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;

async function detectReversalCandle(symbol, interval) {
    const tag = `[hammer][${symbol}][${interval}]`;

    // 1. RSI как фильтр контекста.
    const cacheEntry = rsiCache.get(symbol, interval);
    const rsiValue = cacheEntry?.rsi;
    if (rsiValue == null) {
        console.log(`${tag} RSI не найден в кеше, пропуск`);
        return [];
    }

    console.log(`${tag} RSI = ${rsiValue}`);

    // Развороты ищем только в экстремумах. В нейтральной зоне выходим.
    // (ИСХОДНОЕ условие `> 35 || < 65` истинно всегда — здесь исправлено на && )
    if (rsiValue >= RSI_OVERSOLD && rsiValue <= RSI_OVERBOUGHT) {
        console.log(
            `${tag} RSI в нейтральной зоне [${RSI_OVERSOLD}–${RSI_OVERBOUGHT}], пропуск`
        );
        return [];
    }

    // 2. Последняя закрывшаяся свеча.
    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        SOURCE_TABLE,
        CANDLE_LIMIT
    );
    const candle = ohlcData[ohlcData.length - 1];
    if (!candle) {
        console.log(`${tag} свеча не получена из БД, пропуск`);
        return [];
    }

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    const range = high - low;
    if (!Number.isFinite(range) || range <= 0) {
        console.log(
            `${tag} некорректный диапазон свечи (range=${range}), пропуск`
        );
        return [];
    }

    const body = Math.abs(close - open);
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;

    console.log(
        `${tag} свеча: O=${open} H=${high} L=${low} C=${close} | body=${body.toFixed(6)} upper=${upperWick.toFixed(6)} lower=${lowerWick.toFixed(6)}`
    );

    // Отсев доджи: слишком маленькое тело — не молот.
    if (body < range * MIN_BODY_FRACTION) {
        console.log(
            `${tag} доджи (body/range=${(body / range).toFixed(3)} < ${MIN_BODY_FRACTION}), пропуск`
        );
        return [];
    }

    const bullishContext = rsiValue < RSI_OVERSOLD; // низ тренда
    const bearishContext = rsiValue > RSI_OVERBOUGHT; // верх тренда

    // Молот / повешенный: длинная нижняя тень, короткая верхняя.
    const longLower =
        lowerWick >= body * LONG_WICK_RATIO &&
        upperWick <= lowerWick * SHORT_WICK_RATIO;

    // Перевёрнутый молот / падающая звезда: длинная верхняя, короткая нижняя.
    const longUpper =
        upperWick >= body * LONG_WICK_RATIO &&
        lowerWick <= upperWick * SHORT_WICK_RATIO;

    console.log(
        `${tag} longLower=${longLower} longUpper=${longUpper} bullish=${bullishContext} bearish=${bearishContext}`
    );

    let pattern = null;
    if (longLower && bullishContext) pattern = 'hammer';
    else if (longLower && bearishContext) pattern = 'hanging_man';
    else if (longUpper && bearishContext) pattern = 'shooting_star';
    else if (longUpper && bullishContext) pattern = 'inverted_hammer';

    if (!pattern) {
        console.log(`${tag} паттерн не обнаружен`);
        return [];
    }

    console.log(`${tag} паттерн найден: ${pattern}`);

    const extraData = [];

    await sendSignal(
        symbol,
        interval,
        pattern,
        null,
        extraData,
        rsiValue,
        cacheEntry.volPrecent
    );

    return [
        {
            symbol,
            interval,
            pattern,
            direction: bullishContext ? 'bullish' : 'bearish',
            rsi: rsiValue,
            timestamp: candle.timestamp,
            open,
            high,
            low,
            close,
            body,
            upperWick,
            lowerWick,
        },
    ];
}

module.exports = { detectReversalCandle };
