const {
    getMinimaPeaksPriceContracts,
} = require('../../src/bot/add_contracts/get_minima_peaks_contracts');
const {
    getPeaksPriceContracts,
} = require('../../src/bot/add_contracts/get_peaks_price_contract');
const { sendSignal } = require('../../src/bot/send_signal');
const { checkActualSignal } = require('./check_actual_signal');
const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB();

async function findSignal(symbol, interval, currentTime) {
    try {
        // Волна 1: Загружаем критичные данные (последние цены + пермиссибл рейндж)
        const [lastpriceData, permissibleRange] = await Promise.all([
            dbService.getLastMinutePrices(symbol, currentTime),
            dbService.gettracking_contracts(symbol, interval),
        ]);

        if (!permissibleRange || permissibleRange.length === 0) {
            console.log(
                `Нет данных о допустимом диапазоне для ${symbol} ${interval}`
            );
            return null;
        }
        if (lastpriceData.length === 0) {
            console.log('Нет данных о последней цене для символа:', symbol);
            return null;
        }

        const volatility = permissibleRange[0].volatility;
        const lastprice = lastpriceData[lastpriceData.length - 1].lastprice;
        console.log('Последняя цена:', lastprice);

        // Волна 2: Загружаем пики и минимумы (после получения нужной инфы)
        const [peaks, minima] = await Promise.all([
            getPeaksPriceContracts(symbol, interval, currentTime),
            getMinimaPeaksPriceContracts(symbol, interval, currentTime),
        ]);

        const peaksFiltered = peaks ?? [];
        const minimaFiltered = minima ?? [];

        console.log('Последняя цена:', lastprice);

        // PEAKS
        const peakPromises = peaksFiltered.map(async (peak) => {
            const priceDiffPercent =
                Math.abs((peak.closePrice - lastprice) / lastprice) * 100;

            if (priceDiffPercent > volatility) {
                return false;
            }

            const isActual = await checkActualSignal(
                symbol,
                interval,
                lastpriceData[lastpriceData.length - 1].timestamp,
                'double_top',
                peak.timestamp
            );

            if (isActual === true) {
                await sendSignal(
                    symbol,
                    interval,
                    'Сигнал на продажу (Peak Detected)',
                    peak.dateTime,
                    {
                        extra: 'peak',
                        peak,
                    }
                );

                return true;
            }

            return false;
        });

        // MINIMA
        const minimaPromises = minimaFiltered.map(async (peak) => {
            const priceDiffPercent =
                Math.abs((peak.closePrice - lastprice) / lastprice) * 100;

            if (priceDiffPercent > volatility) {
                return false;
            }

            const isActual = await checkActualSignal(
                symbol,
                interval,
                lastpriceData[lastpriceData.length - 1].timestamp,
                'double_bottom',
                peak.timestamp
            );

            if (isActual === true) {
                await sendSignal(
                    symbol,
                    interval,
                    'Сигнал на покупку (Minimum Detected)',
                    peak.dateTime,
                    {
                        extra: 'minimum',
                        peak,
                    }
                );

                return true;
            }

            return false;
        });

        // Выполняем одновременно
        const [peakResults, minimaResults] = await Promise.all([
            Promise.all(peakPromises),
            Promise.all(minimaPromises),
        ]);

        if (peakResults.includes(true) || minimaResults.includes(true)) {
            return true;
        }

        return false; // сигналов не найдено
    } catch (error) {
        console.error(`Ошибка в findSignal для ${symbol} ${interval}:`, error);
        return null;
    }
}

module.exports = {
    findSignal,
};
