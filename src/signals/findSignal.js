const { sendSignal } = require('../telegram/sendSignal');
const { checkActualSignal } = require('./checkSignal');
const priceTracker = require('../ws/priceTracker');
const extremumCache = require('../cache/extremumCache');
const rsiCache = require('../cache/rsiCache');
const marketFlowCache = require('../cache/marketFlowCache');
const { combineSignal } = require('../analysis/flow/cvdTracker');
const logger = require('../utils/logger');
const intervals = ['15', '60']; // Интервалы для анализа

async function findSignal(symbol, interval) {
    logger.info(`[findSignal] START ${symbol} ${interval}`);

    const rsiValue = rsiCache.get(symbol, interval);
    const macd15ValueData = rsiCache.get(symbol, '15');
    const rsi60ValueData = rsiCache.get(symbol, '60');
    let rsi15Value = null;
    let rsi60Value = null;
    let adx15Value = null;
    let adx60Value = null;
    if (macd15ValueData) {
        rsi15Value = macd15ValueData.rsi;
        adx15Value = macd15ValueData.adx;
    }
    if (rsi60ValueData) {
        rsi60Value = rsi60ValueData.rsi;
        adx60Value = rsi60ValueData.adx;
    }
    const adxResult = [
        `RSI 15m: ${rsi15Value}`,
        `RSI 60m: ${rsi60Value}`,
        `ADX 15m: ${adx15Value}`,
        `ADX 60m: ${adx60Value}`,
    ].filter((v) => v !== null);

    let adxFilter = null;
    if (interval === '1') {
        adxFilter = rsiCache.get(symbol, '60');
    }

    if (!rsiValue) {
        logger.warn(
            `[findSignal] RSI cache not found for ${symbol} ${interval}`
        );
        return false;
    }

    logger.info(
        `[findSignal] RSI: ${rsiValue.rsi} | VolPercent: ${rsiValue.volPrecent} | adxFilter: ${adxFilter}  `
    );

    try {
        const lastPriceData = priceTracker.getPrice(symbol);

        if (!lastPriceData?.lastPrice) {
            logger.warn(`[findSignal] No last price for ${symbol} ${interval}`);
            return false;
        }

        const volatility = rsiValue.volatility;
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
            const priceDiffPercent =
                Math.abs((extremum.closePrice - lastprice) / lastprice) * 100;

            if (priceDiffPercent > volatility) return false;

            // if (lastprice > extremum.closePrice && type === 'peak')
            //     return false;
            // if (lastprice < extremum.closePrice && type === 'minimum')
            //     return false;

            // При неопределённом тренде (ADX < 25) разрешаем сигналы в обе стороны
            const isUndefinedTrend =
                (adx15Value !== null && adx15Value < 25) ||
                (adx60Value !== null && adx60Value < 25);

            if (!isUndefinedTrend) {
                if (
                    (type === 'peak' &&
                        rsiValue.rsi < 55 &&
                        extremum.rsi < 55) ||
                    (type === 'peak' && rsiValue.rsi > 55 && extremum.rsi < 50)
                ) {
                    return false;
                }
                if (
                    type === 'peak' &&
                    interval === '1' &&
                    rsi15Value !== null &&
                    rsi60Value !== null &&
                    rsi15Value < 55 &&
                    rsi60Value < 55
                ) {
                    return false;
                }

                if (
                    (type === 'minimum' &&
                        rsiValue.rsi > 40 &&
                        extremum.rsi > 40) ||
                    (type === 'minimum' &&
                        rsiValue.rsi < 40 &&
                        extremum.rsi > 45)
                ) {
                    return false;
                }
                if (
                    type === 'minimum' &&
                    interval === '1' &&
                    rsi15Value !== null &&
                    rsi60Value !== null &&
                    rsi15Value > 40 &&
                    rsi60Value > 40
                ) {
                    return false;
                }
            }

            // Подтверждение через стакан + CVD (мягкое: не блокирует, только усиливает)
            const tol = lastprice * (volatility / 100);
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
                adxResult
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
