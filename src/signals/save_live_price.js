const priceCache = require('../ws/priceCache');
const PostgresDB = require('../db/db');
const dbService = new PostgresDB();

async function saveLivePrice() {
    const records = await priceCache.flush();
    if (!records.length) return;

    await dbService.saveLivePrice(records);
}

module.exports = {
    saveLivePrice,
};
