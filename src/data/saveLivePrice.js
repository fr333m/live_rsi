const priceCache = require('../cache/priceCache');
const dbService = require('../db/index');

async function saveLivePrice() {
    const records = priceCache.flush();
    if (!records.length) return;

    await dbService.saveLivePrice(records);
    return true;
}

module.exports = { saveLivePrice };
