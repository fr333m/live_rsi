const dbService = require('../db/index');
const { detectReversalCandle } = require('../analysis/hammer/search_hammer');

async function runSearchHummerForInterval(interval) {
    const symbols = await dbService.uniqueSymbol(
        'tracking_contracts',
        interval
    );
    for (const symbol of symbols) {
        await detectReversalCandle(symbol, interval);
    }
}

module.exports = { runSearchHummerForInterval };
