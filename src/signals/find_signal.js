const { getMinimaPeaksPriceContracts } = require('../../src/bot/add_contracts/get_minima_peaks_contracts');
const { getPeaksPriceContracts } = require('../../src/bot/add_contracts/get_peaks_price_contract');
const SqliteDB = require('../../src/db/db');
const dbService = new SqliteDB('./candles.db');
const {sendSignal} = require('../../src/bot/send_signal');


async function findSignal(symbol, interval) {
    const peaks = await getPeaksPriceContracts(symbol, interval);
    const minima = await getMinimaPeaksPriceContracts(symbol, interval);
    const permissibleRange = await dbService.getTrackingContracts(symbol, interval); // 1% от текущей цены

    const lastPriceData = await dbService.getLivePricesBySymbol(symbol);


    if (lastPriceData.length === 0) {
        console.log('Нет данных о последней цене для символа:', symbol);
        return null;
    }

    const lastPrice = lastPriceData[lastPriceData.length - 1].lastPrice;
    console.log('Последняя цена:', lastPrice);

    for (const peak of peaks) {
        console.log('Проверка пика:', peak);
        const priceDiffPercent = Math.abs((peak.closePrice - lastPrice) / lastPrice) * 100;
        console.log(priceDiffPercent)
        if (priceDiffPercent <= permissibleRange[0].volatility) {
            await sendSignal(symbol, interval, 'Сигнал на продажу (Peak Detected)');
        }
    }

    for (const minimum of minima) {
        console.log('Проверка минимума:', minimum);
        const priceDiffPercent = Math.abs((minimum.closePrice - lastPrice) / lastPrice) * 100;
        console.log(priceDiffPercent)
        if (priceDiffPercent <= permissibleRange[0].volatility) {
            await sendSignal(symbol, interval, 'Сигнал на покупку (Minimum Detected)');
        }
    }

}

module.exports = {
    findSignal
}