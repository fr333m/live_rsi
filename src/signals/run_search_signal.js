const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB(PostgresDB);
const { findSignal } = require('./find_signal');

async function runSearchSignal_for_1m(currentTime) {
    const symbolUnique_1m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '1'
    );

    if (symbolUnique_1m.length > 0) {
        for (const symbol of symbolUnique_1m) {
            findSignal(symbol, '1', currentTime);
        }
    }
}

async function runSearchSignal_for_5m(currentTime) {
    const symbolUnique_5m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '5'
    );

    if (symbolUnique_5m.length > 0) {
        for (const symbol of symbolUnique_5m) {
            findSignal(symbol, '5', currentTime);
        }
    }
}

module.exports = {
    runSearchSignal_for_1m,
    runSearchSignal_for_5m,
};
