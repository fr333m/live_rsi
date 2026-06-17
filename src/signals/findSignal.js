const { sendSignal } = require('../telegram/sendSignal');
const { checkActualSignal } = require('./checkSignal');
const priceTracker = require('../ws/priceTracker');
const extremumCache = require('../cache/extremumCache');
const rsiCache = require('../cache/rsiCache');
const marketFlowCache = require('../cache/marketFlowCache');
const { combineSignal } = require('../analysis/flow/cvdTracker');
const { levelPriceDiff } = require('../analysis/rsi/volatilityLevel');
const logger = require('../utils/logger');
async function findSignal(symbol, interval) {
    logger.info(`[findSignal] START ${symbol} ${interval}`);

    const rsiValue = rsiCache.get(symbol, interval);
    const rsi15ValueData = rsiCache.get(symbol, '15');
    const rsi60ValueData = rsiCache.get(symbol, '60');
    let rsi15Value = null;
    let rsi60Value = null;
    let adx15Value = null;
    let adx60Value = null;
    if (rsi15ValueData) {
        rsi15Value = rsi15ValueData.rsi;
        adx15Value = rsi15ValueData.adx;
    }
    if (rsi60ValueData) {
        rsi60Value = rsi60ValueData.rsi;
        adx60Value = rsi60ValueData.adx;
    }
    const adxResult = [];
    if (rsi15Value !== null) adxResult.push(`RSI 15m: ${rsi15Value}`);
    if (rsi60Value !== null) adxResult.push(`RSI 60m: ${rsi60Value}`);
    if (adx15Value !== null) adxResult.push(`ADX 15m: ${adx15Value}`);
    if (adx60Value !== null) adxResult.push(`ADX 60m: ${adx60Value}`);

    if (!rsiValue) {
        logger.warn(
            `[findSignal] RSI cache not found for ${symbol} ${interval}`
        );
        return false;
    }

    logger.info(
        `[findSignal] RSI: ${rsiValue.rsi} | VolPercent: ${rsiValue.volPrecent}`
    );

    try {
        const lastPriceData = priceTracker.getPrice(symbol);

        if (!lastPriceData?.lastPrice) {
            logger.warn(`[findSignal] No last price for ${symbol} ${interval}`);
            return false;
        }

        const volatility = levelPriceDiff(rsiValue.volPrecent, interval);
        const lastprice = lastPriceData.lastPrice;

        const [peaks, minima] = await Promise.all([
            extremumCache.get(symbol, interval, 'max_extremum'),
            extremumCache.get(symbol, interval, 'min_extremum'),
        ]);

        const peaksFiltered = peaks || [];
        const minimaFiltered = minima || [];

        if (peaksFiltered.length === 0 && minimaFiltered.length === 0) {
            logger.info(
                `[findSignal] No extremums found ${symbol} ${interval}`
            );
            return false;
        }

        const processExtremum = async (extremum, type) => {
            const referencePrice =
                type === 'peak' ? extremum.closePrice : extremum.closePrice;
            const priceDiffPercent =
                Math.abs((referencePrice - lastprice) / lastprice) * 100;

            if (priceDiffPercent > volatility) return false;

            // Подтверждение через стакан + CVD (мягкое: не блокирует, только усиливает)
            const tol = lastprice * (rsiValue.volPrecent / 100);
            const flowData = marketFlowCache.get(symbol);
            let flowSignal = null;
            if (flowData) {
                const level = {
                    centroid: extremum.closePrice,
                    dominantType: type === 'peak' ? 'resistance' : 'support',
                    score: 1.0,
                };
                const ob = flowData.book.analyzeLevel(
                    extremum.closePrice,
                    tol,
                    { minPersist: 3 }
                );
                const abs = flowData.cvd.detectAbsorption(
                    extremum.closePrice,
                    tol
                );
                flowSignal = combineSignal(lastprice, level, tol, ob, abs);
                if (flowSignal) {
                    logger.info(
                        `[processExtremum] flow confirmations=${flowSignal.confirmations} strength=${flowSignal.strength.toFixed(2)} ${symbol} ${interval}`
                    );
                }
            }

            const signalType = type === 'peak' ? 'double_top' : 'double_bottom';
            const signalText =
                type === 'peak'
                    ? 'Сигнал на продажу (Peak Detected)'
                    : 'Сигнал на покупку (Minimum Detected)';

            const isActual = await checkActualSignal(
                symbol,
                interval,
                lastPriceData.timestamp,
                signalType,
                extremum.timestamp
            );

            if (!isActual) return false;

            logger.info(`[processExtremum] SIGNAL CONFIRMED ${signalType}`);

            const signalResult = await sendSignal(
                symbol,
                interval,
                signalText,
                extremum.dateTime,
                { extra: type, [type]: extremum },
                rsiValue.rsi,
                rsiValue.volPrecent,
                flowSignal,
                extremum.rsi,
                adxResult,
                extremum.prominance
            );

            if (!signalResult.success) {
                logger.error(
                    `[processExtremum] Signal send failed ${symbol} ${interval}: ${signalResult.error}`
                );
                return false;
            }

            extremumCache.deleteByIndex(
                symbol,
                interval,
                type === 'peak' ? 'max_extremum' : 'min_extremum',
                extremum.index
            );

            logger.info(`🚨 SIGNAL ${signalType} | ${symbol} ${interval}`);
            return true;
        };

        let hasSignal = false;

        for (const peak of peaksFiltered) {
            const result = await processExtremum(peak, 'peak').catch((err) => {
                logger.error(
                    `[findSignal] Peak error ${symbol} ${interval}`,
                    err
                );
                return false;
            });
            if (result) hasSignal = true;
        }

        for (const min of minimaFiltered) {
            const result = await processExtremum(min, 'minimum').catch(
                (err) => {
                    logger.error(
                        `[findSignal] Minimum error ${symbol} ${interval}`,
                        err
                    );
                    return false;
                }
            );
            if (result) hasSignal = true;
        }

        return hasSignal;
    } catch (error) {
        logger.error(
            `[findSignal] CRITICAL ERROR ${symbol} ${interval}`,
            error
        );
        return null;
    }
}

module.exports = { findSignal };

// if (interval === '1') {
//     const isUndefinedTrend =
//         (rsi60Value !== null && (rsi60Value >= 60 || rsi60Value <= 40)) ||
//         (adx60Value !== null && adx60Value <= 25);
//     if (!isUndefinedTrend) {
//         logger.info(
//             `[processExtremum] Skipping signal due to undefined trend ${symbol} ${interval}`
//         );
//         return false;
//     }
// }

//  if (interval === '1') {
//                 const isUndefinedTrend =
//                     (type === 'peak' &&
//                         rsiValue.rsi >= 50 &&
//                         extremum.rsi >= 50) ||
//                     (type === 'minimum' &&
//                         rsiValue.rsi <= 40 &&
//                         extremum.rsi <= 40);

//                 if (isUndefinedTrend) {
//                     const adxWeak =
//                         (adx15Value !== null && adx15Value < 25) ||
//                         (adx60Value !== null && adx60Value < 25);
//                     if (!adxWeak) return false;
//                 }

//                 if (!isUndefinedTrend) {
//                     if (
//                         rsi15Value !== null &&
//                         rsi60Value !== null &&
//                         type === 'peak' &&
//                         rsi15Value < 55 &&
//                         rsi60Value < 55
//                     ) {
//                         return false;
//                     }
//                     if (
//                         rsi15Value !== null &&
//                         rsi60Value !== null &&
//                         type === 'minimum' &&
//                         rsi15Value > 40 &&
//                         rsi60Value > 40
//                     ) {
//                         return false;
//                     }
//                 }
//             }
