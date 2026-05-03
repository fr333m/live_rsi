const BybitClient = require('../../api/bybit_api');
const config = require('../../config/config');


const bybitClient = new BybitClient(config.BYBIT_API_KEY, config.BYBIT_SECRET_KEY);

async function getTopVolumeContracts() {
    const contracts = await bybitClient.getTopTradingVolume(25);
    console.log(contracts);
    return contracts;
}

module.exports = {
    getTopVolumeContracts
}