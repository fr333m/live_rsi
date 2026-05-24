const priceCache = require('../ws/priceCache');
const dbService = require('../db/dbInstance');

async function saveLivePrice() {
    const records = priceCache.flush();
    if (!records.length) return;

    await dbService.saveLivePrice(records);

    return true;
}

module.exports = {
    saveLivePrice,
};
