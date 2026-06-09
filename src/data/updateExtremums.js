const dbService = require('../db/index');
const extremumCache = require('../cache/extremumCache');
const { getMinimaPeaksPriceContracts } = require('../analysis/extremums/getMinimaPeaks');
const { getPeaksPriceContracts } = require('../analysis/extremums/getPeaksPrices');
const { INTERVALS } = require('../config/constants');

async function runUpdateExtremumForInterval(interval) {
    const symbols = await dbService.uniqueSymbol('tracking_contracts', interval);

    if (symbols.length === 0) return true;

    extremumCache.removeAllByInterval(interval);

    for (const symbol of symbols) {
        const minima = await getMinimaPeaksPriceContracts(symbol, interval);
        const peaks = await getPeaksPriceContracts(symbol, interval);

        extremumCache.set(symbol, interval, minima, 'min_extremum');
        extremumCache.set(symbol, interval, peaks, 'max_extremum');
    }

    return true;
}

async function runUpdateExtremum_for_1m() {
    return runUpdateExtremumForInterval('1');
}

async function runUpdateExtremum_for_5m() {
    return runUpdateExtremumForInterval('5');
}

async function runUpdateExtremum_for_15m() {
    return runUpdateExtremumForInterval('15');
}

async function runUpdateExtremum_for_60m() {
    return runUpdateExtremumForInterval('60');
}

module.exports = {
    runUpdateExtremumForInterval,
    runUpdateExtremum_for_1m,
    runUpdateExtremum_for_5m,
    runUpdateExtremum_for_15m,
    runUpdateExtremum_for_60m,
};
