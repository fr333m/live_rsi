const { getMinimaPeaksPriceContracts } = require('../../src/bot/add_contracts/get_minima_peaks_contracts');
const { getPeaksPriceContracts } = require('../../src/bot/add_contracts/get_peaks_price_contract');
const {sendSignal} = require('../../src/bot/send_signal');
const {checkActualSignal} = require('./check_actual_signal');
const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB();



async function findSignal(symbol, interval) {
    try {
        const peaks = (await getPeaksPriceContracts(symbol, interval)) ?? [];
        const minima = (await getMinimaPeaksPriceContracts(symbol, interval)) ?? [];
        const permissibleRange = await dbService.gettracking_contracts(symbol, interval);

        if (!permissibleRange || permissibleRange.length === 0) {
            console.log(`Нет данных о допустимом диапазоне для ${symbol} ${interval}`);
            return null;
        }
        const volatility = permissibleRange[0].volatility;

        const lastpriceData = await dbService.getLastMinutePrices(symbol);
        if (lastpriceData.length === 0) {
            console.log('Нет данных о последней цене для символа:', symbol);
            return null;
        }

        const lastprice = lastpriceData[lastpriceData.length - 1].lastprice;
        console.log('Последняя цена:', lastprice);
        // Проверка пиков (double top) — сигнал на продажу
        for (const peak of peaks) {
            const priceDiffPercent = Math.abs((peak.closePrice - lastprice) / lastprice) * 100;
            if (priceDiffPercent <= volatility) {
                const isActual = await checkActualSignal(symbol, interval, lastpriceData[lastpriceData.length - 1].timestamp, 'double_top', peak.timestamp);
                if (isActual === true) {
                    await sendSignal(symbol, interval, 'Сигнал на продажу (Peak Detected)', peak.dateTime, {extra: 'extra_peaks', peak});
                    return true; // отправлен сигнал, завершаем функцию
                }
            }
        }

        // Проверка минимумов (double bottom) — сигнал на покупку
        for (const minimum of minima) {
            const priceDiffPercent = Math.abs((minimum.closePrice - lastprice) / lastprice) * 100;
            if (priceDiffPercent <= volatility) {
                const isActual = await checkActualSignal(symbol, interval, lastpriceData[lastpriceData.length - 1].timestamp, 'double_bottom', minimum.timestamp);
                if (isActual === true) {
                    await sendSignal(symbol, interval, 'Сигнал на покупку (Minimum Detected)', minimum.dateTime, {extra: 'extra_minima', minimum});
                    return true;
                }
            }
        }

        return false; // сигналов не найдено
    } catch (error) {
        console.error(`Ошибка в findSignal для ${symbol} ${interval}:`, error);
        return null;
    }
}




// async function findSignal(symbol, interval) {
//     let typeSignal;
//     let actualsSignal; 
//     const peaks = await getPeaksPriceContracts(symbol, interval);
//     const minima = await getMinimaPeaksPriceContracts(symbol, interval);
//     const permissibleRange = await dbService.gettracking_contracts(symbol, interval); // 1% от текущей цены

//     const lastpriceData = await dbService.getLivePricesBySymbol(symbol);


//     if (lastpriceData.length === 0) {
//         console.log('Нет данных о последней цене для символа:', symbol);
//         return null;
//     }

//     const lastprice = lastpriceData[lastpriceData.length - 1].lastprice;
//     console.log('Последняя цена:', lastprice);

//     for (const peak of peaks) {
//         typeSignal = 'double_top'

//         const priceDiffPercent = Math.abs((peak.closePrice - lastprice) / lastprice) * 100;
        
//         if (priceDiffPercent <= permissibleRange[0].volatility) {
//             actualsSignal = checkActualSignal(symbol, interval, peak.timestamp, typeSignal);
//             if(actualsSignal === true){
//                 await sendSignal(symbol, interval, 'Сигнал на продажу (Peak Detected)');
//             }    
//         }
//     }

//     for (const minimum of minima) {
//         typeSignal = 'double_bottom';

//         const priceDiffPercent = Math.abs((minimum.closePrice - lastprice) / lastprice) * 100;
        
//         if (priceDiffPercent <= permissibleRange[0].volatility) {
//             actualsSignal = checkActualSignal(symbol, interval, minimum.timestamp, typeSignal);
//             if(actualsSignal === true){
//                 await sendSignal(symbol, interval, 'Сигнал на покупку (Minimum Detected)');
//             }
//         }
//     }

// }

module.exports = {
    findSignal
}