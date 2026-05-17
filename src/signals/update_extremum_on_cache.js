const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB(PostgresDB);
const extremumCache = require('../ws/extremumCache');

const {
    getMinimaPeaksPriceContracts,
} = require('../bot/add_contracts/get_minima_peaks_contracts');
const {
    getPeaksPriceContracts,
} = require('../bot/add_contracts/get_peaks_price_contract');

async function runUpdateExtremum_for_1m() {
    const symbolUnique_1m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '1'
    );

    if (symbolUnique_1m.length > 0) {
        extremumCache.removeAllByInterval('1');

        for (const symbol of symbolUnique_1m) {
            const minima = await getMinimaPeaksPriceContracts(symbol, '1');
            const peaks = await getPeaksPriceContracts(symbol, '1');

            extremumCache.set(symbol, '1', minima, 'min_extremum');
            extremumCache.set(symbol, '1', peaks, 'max_extremum');
            console.log(`Обновленные экстремумы для ${symbol} на 1 минуту:`);
        }
    }

    return true;
}

async function runUpdateExtremum_for_5m() {
    const symbolUnique_5m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '5'
    );

    if (symbolUnique_5m.length > 0) {
        extremumCache.removeAllByInterval('5');
        for (const symbol of symbolUnique_5m) {
            const minima = await getMinimaPeaksPriceContracts(symbol, '5');
            const peaks = await getPeaksPriceContracts(symbol, '5');

            extremumCache.set(symbol, '5', minima, 'min_extremum');
            extremumCache.set(symbol, '5', peaks, 'max_extremum');
            console.log(`Обновленные экстремумы для ${symbol} на 5 минут:`);
        }
    }

    return true;
}

async function runUpdateExtremum_for_15m() {
    const symbolUnique_15m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '15'
    );

    if (symbolUnique_15m.length > 0) {
        extremumCache.removeAllByInterval('15');
        for (const symbol of symbolUnique_15m) {
            const minima = await getMinimaPeaksPriceContracts(symbol, '15');
            const peaks = await getPeaksPriceContracts(symbol, '15');

            extremumCache.set(symbol, '15', minima, 'min_extremum');
            extremumCache.set(symbol, '15', peaks, 'max_extremum');
            console.log(`Обновленные экстремумы для ${symbol} на 15 минут:`);
        }
    }

    return true;
}

module.exports = {
    runUpdateExtremum_for_1m,
    runUpdateExtremum_for_5m,
    runUpdateExtremum_for_15m,
};
