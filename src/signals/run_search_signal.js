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
            await findSignal(symbol, '1', currentTime);
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
            await findSignal(symbol, '5', currentTime);
        }
    }
}

async function runSearchSignal_for_15m(currentTime) {
    const symbolUnique_15m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '15'
    );

    if (symbolUnique_15m.length > 0) {
        for (const symbol of symbolUnique_15m) {
            await findSignal(symbol, '15', currentTime);
        }
    }
}

async function runSearchSignal_for_60m(currentTime) {
    const symbolUnique_60m = await dbService.uniqueSymbol(
        'tracking_contracts',
        '60'
    );

    if (symbolUnique_60m.length > 0) {
        for (const symbol of symbolUnique_60m) {
            await findSignal(symbol, '60', currentTime);
        }
    }
}

module.exports = {
    runSearchSignal_for_1m,
    runSearchSignal_for_5m,
    runSearchSignal_for_15m,
    runSearchSignal_for_60m,
};
