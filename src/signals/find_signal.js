const { sendSignal } = require('../../src/bot/send_signal');
const { checkActualSignal } = require('./check_actual_signal');
const dbService = require('../db/dbInstance');
const priceTracker = require('../ws/wsClient');
const extremumCache = require('../ws/extremumCache');
const rsiCache = require('../ws/cacheRSI');
const logger = require('../utils/logger');

async function findSignal(symbol, interval) {
    logger.info(`[findSignal] START ${symbol} ${interval}`);

    const rsiValue = rsiCache.get(symbol, interval);

    if (!rsiValue) {
        logger.warn(
            `[findSignal] RSI cache not found for ${symbol} ${interval}`
        );
        return;
    }

    logger.info(
        `[findSignal] RSI: ${rsiValue.rsi} | VolPercent: ${rsiValue.volPrecent}`
    );

    // ==================== Фильтр по объёму ====================

    if ((rsiValue.volPrecent < 0.5 && interval === '1') || interval === '5') {
        logger.info(
            `[findSignal] SKIP by volume filter ${symbol} ${interval} | vol=${rsiValue.volPrecent}`
        );
        return;
    }

    try {
        // ==================== 1. Загрузка данных ====================
        logger.info(`[findSignal] Loading tracking data ${symbol} ${interval}`);

        const trackingData = rsiCache.get(symbol, interval);

        if (!trackingData || trackingData.length === 0) {
            logger.warn(
                `[findSignal] No tracking data for ${symbol} ${interval}`
            );
            return null;
        }

        const lastPriceData = priceTracker.getPrice(symbol);

        if (!lastPriceData?.lastPrice) {
            logger.warn(`[findSignal] No last price for ${symbol} ${interval}`);
            return null;
        }

        const volatility = trackingData.volatility;
        const lastprice = lastPriceData.lastPrice;

        logger.info(
            `[findSignal] ${symbol} ${interval} | Price=${lastprice} | Volatility=${volatility}%`
        );

        // ==================== 2. Получение экстремумов ====================
        logger.info(`[findSignal] Loading extremums ${symbol} ${interval}`);

        const [peaks, minima] = await Promise.all([
            extremumCache.get(symbol, interval, 'max_extremum'),
            extremumCache.get(symbol, interval, 'min_extremum'),
        ]);

        const peaksFiltered = peaks || [];
        const minimaFiltered = minima || [];

        logger.info(
            `[findSignal] Peaks=${peaksFiltered.length} | Minimums=${minimaFiltered.length}`
        );

        if (peaksFiltered.length === 0 && minimaFiltered.length === 0) {
            logger.info(
                `[findSignal] No extremums found ${symbol} ${interval}`
            );
            return false;
        }

        // ==================== 3. Обработка сигналов ====================

        const processExtremum = async (extremum, type) => {
            logger.info(
                `[processExtremum] Start ${type} | ${symbol} ${interval} | extremumPrice=${extremum.closePrice}`
            );

            const priceDiffPercent =
                Math.abs((extremum.closePrice - lastprice) / lastprice) * 100;

            logger.info(
                `[processExtremum] Price diff ${priceDiffPercent.toFixed(
                    4
                )}% | allowed=${volatility}%`
            );

            if (priceDiffPercent > volatility) {
                logger.info(`[processExtremum] SKIP by volatility filter`);
                return false;
            }

            if (lastprice > extremum.closePrice && type === 'peak') {
                logger.info(
                    `[processExtremum] SKIP peak because current price above extremum`
                );
                return false;
            }

            if (lastprice < extremum.closePrice && type === 'minimum') {
                logger.info(
                    `[processExtremum] SKIP minimum because current price below extremum`
                );
                return false;
            }

            const signalType = type === 'peak' ? 'double_top' : 'double_bottom';

            const signalText =
                type === 'peak'
                    ? 'Сигнал на продажу (Peak Detected)'
                    : 'Сигнал на покупку (Minimum Detected)';

            logger.info(
                `[processExtremum] Checking actual signal ${signalType}`
            );

            const isActual = await checkActualSignal(
                symbol,
                interval,
                lastPriceData.timestamp,
                signalType,
                extremum.timestamp
            );

            logger.info(
                `[processExtremum] checkActualSignal result=${isActual}`
            );

            if (isActual === true) {
                logger.info(`[processExtremum] SIGNAL CONFIRMED ${signalType}`);

                await sendSignal(
                    symbol,
                    interval,
                    signalText,
                    extremum.dateTime,
                    {
                        extra: type,
                        [type]: extremum,
                    },
                    rsiValue.rsi,
                    trackingData.volPrecent
                );

                logger.info(
                    `[processExtremum] Signal sent ${symbol} ${interval}`
                );

                // Удаляем использованный экстремум
                extremumCache.deleteByIndex(
                    symbol,
                    interval,
                    type === 'peak' ? 'max_extremum' : 'min_extremum',
                    extremum.index
                );

                logger.info(
                    `[processExtremum] Extremum deleted index=${extremum.index}`
                );

                logger.info(`🚨 SIGNAL ${signalType} | ${symbol} ${interval}`);

                return true;
            }

            logger.info(`[processExtremum] Signal is not actual`);

            return false;
        };

        let hasSignal = false;

        // ==================== Обработка пиков ====================
        logger.info(`[findSignal] Processing peaks ${symbol} ${interval}`);

        for (const peak of peaksFiltered) {
            const result = await processExtremum(peak, 'peak').catch((err) => {
                logger.error(
                    `[findSignal] Peak processing error ${symbol} ${interval}`,
                    err
                );
                return false;
            });

            if (result) {
                hasSignal = true;

                logger.info(
                    `[findSignal] Peak signal detected ${symbol} ${interval}`
                );
            }
        }

        // ==================== Обработка минимумов ====================
        logger.info(`[findSignal] Processing minimums ${symbol} ${interval}`);

        for (const min of minimaFiltered) {
            const result = await processExtremum(min, 'minimum').catch(
                (err) => {
                    logger.error(
                        `[findSignal] Minimum processing error ${symbol} ${interval}`,
                        err
                    );
                    return false;
                }
            );

            if (result) {
                hasSignal = true;

                logger.info(
                    `[findSignal] Minimum signal detected ${symbol} ${interval}`
                );
            }
        }

        logger.info(
            `[findSignal] FINISH ${symbol} ${interval} | hasSignal=${hasSignal}`
        );

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
