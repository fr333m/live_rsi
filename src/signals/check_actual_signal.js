const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB();


const SIGNAL_INTERVAL = 1800000; //  30 минут

async function checkActualSignal(symbol, interval, timestamp, typeSignal, levelTimeStamp) {
    
    // const row = await dbService.checkRowForTypeSignal('ETHUSDT', '1', 'double_top', 'control_send_signal', '1778589540000');
    // console.log('Test checkRowForTypeSignal result:', row);
    
    // === Валидация ===
    if (!symbol?.trim() || !interval?.trim()) {
        throw new Error('symbol and interval are required');
    }
    if (!typeSignal?.trim()) {
        throw new Error('typeSignal is required');
    }
    if (!levelTimeStamp) {
        throw new Error('levelTimeStamp is required');
    }

    const normalizedTimestamp = Number(timestamp);
    const normalizedLevelTimeStamp = String(levelTimeStamp);
    // console.log(`Normalized inputs: timestamp=${normalizedTimestamp}, levelTimeStamp=${normalizedLevelTimeStamp}`);
    if (isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
        throw new Error('timestamp must be a positive number (milliseconds)');
    }
   

    

    try {
        // SIGNAL_INTERVAL лучше передавать параметром или брать из конфига

        // Ищем запись именно по этому typeSignal
        const existing = await dbService.checkRowForTypeSignal(
            symbol, 
            interval, 
            typeSignal,        // ← важно: учитываем тип сигнала
            'control_send_signal', 
            String(levelTimeStamp) // ← и уровень сигнала (например, цена для RSI)
        );
        // console.log('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', existing);


        if (!existing) {
            
             // console.log(`checkActualSignal called with: ${symbol} ${interval} ${typeSignal} at ${timestamp} ${levelTimeStamp}`);

            // Первый сигнал данного типа — разрешаем
            await dbService.saveSendSignalControl(
                symbol, 
                normalizedTimestamp, 
                interval, 
                typeSignal,
                levelTimeStamp
            );
            // console.log(`[Signal Control] ✅ NEW signal allowed: ${symbol} ${interval} | ${typeSignal}`);
            return true;
        }

        const timeDiff = normalizedTimestamp - Number(existing.timestamp);

        // console.log('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', timeDiff, SIGNAL_INTERVAL, normalizedTimestamp, existing.timestamp);
        
       
                return;

        if (timeDiff < SIGNAL_INTERVAL) {
            const secondsLeft = Math.round((SIGNAL_INTERVAL - timeDiff) / 1000);
            // console.log(`[Signal Control] ⛔ BLOCKED: ${symbol} ${interval} | ${typeSignal} — cooldown ${secondsLeft}s`);
            return false;
        }

        // Прошло достаточно времени — обновляем запись
        await dbService.removeRowOnSymbol(symbol, 'control_send_signal', existing.id);
        
        await dbService.saveSendSignalControl(
            symbol, 
            normalizedTimestamp, 
            interval, 
            typeSignal,
            levelTimeStamp
        );

        // console.log(`[Signal Control] ✅ Signal allowed after cooldown: ${symbol} ${interval} | ${typeSignal}`);
        return true;

    } catch (error) {
        // console.error(`[Signal Control Error] ${symbol} ${interval} ${typeSignal}:`, error);
        throw error;
    }
}

module.exports = { checkActualSignal };
// async function checkActualSignal(symbol, interval, timestamp, typeSignal, levelTimeStamp) {
//     if(levelTimeStamp === null){
//         return;
//     }

//     // Валидация параметров
//     if (!symbol?.trim() || !interval?.trim()) {
//         throw new Error('symbol and interval are required');
//     }
    
//     if (!typeSignal?.trim()) {
//         throw new Error('typeSignal is required');
//     }

//     const normalizedTimestamp = Number(timestamp);
//     if (isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
//         throw new Error('timestamp must be a positive number (milliseconds)');
//     }

//     const SIGNAL_INTERVAL = 600000; // 10 минут

//     try {
//         // Важно: теперь ключ включает typeSignal
//         const existing = await dbService.checkRowForTypeSignal(symbol, interval, typeSignal, 'control_send_signal', levelTimeStamp);
        
//         if (!existing) {
//             await dbService.saveSendSignalControl(symbol, normalizedTimestamp, interval, typeSignal, levelTimeStamp);
//             console.log(`[Signal Control] ✅ New signal allowed: ${symbol} ${interval} ${typeSignal}`);
//             return true;
//         }

//         const timeDiff = normalizedTimestamp - existing.timestamp;

//         // Если для этого типа сигнала ещё не прошло 5 минут — блокируем
//         if (timeDiff < SIGNAL_INTERVAL) {
//             console.log(`[Signal Control] ⛔ Blocked: ${symbol} ${interval} ${typeSignal} — too early (${Math.round(timeDiff/1000)}s)`);
//             return false;
//         }

//         // Прошло достаточно времени — обновляем таймер
//         await dbService.removeRowOnSymbol(symbol, 'control_send_signal', existing.id);
//         await dbService.saveSendSignalControl(symbol, normalizedTimestamp, interval, typeSignal, levelTimeStamp);

//         console.log(`[Signal Control] ✅ Signal allowed after cooldown: ${symbol} ${interval} ${typeSignal}`);
//         return true;

//     } catch (error) {
//         console.error(`[Signal Control Error] ${symbol} ${interval} ${typeSignal}:`, error);
//         throw error;
//     }
// }

// module.exports = { checkActualSignal };

// async function checkActualSignal(symbol, interval, timestamp, typeSignal) {
//     const timeOffSendSignal = await dbService.checkRow(symbol, interval, 'control_send_signal');

//     if(!timeOffSendSignal) {
//         await dbService.saveSendSignalControl(symbol, timestamp, interval, typeSignal);
//         return true;
//     }

//     if (timestamp - timeOffSendSignal.timestamp >= 300000 && timeOffSendSignal.type_signal === typeSignal) {
//         await dbService.removeRowOnSymbol(symbol, 'control_send_signal', timeOffSendSignal.id);
//         await dbService.saveSendSignalControl(symbol, timestamp, interval, typeSignal); // 5 минут в миллисекундах
//         return true;
//     }
//     return false;
// }

// module.exports = {
//     checkActualSignal
// };

// async function checkActualSignal(symbol, interval, timestamp, typeSignal) {
//     // Валидация параметров
//     if (!symbol?.trim() || !interval?.trim()) {
//         throw new Error('symbol and interval are required');
//     }
    
//     const normalizedTimestamp = Number(timestamp);
//     if (isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
//         throw new Error('timestamp must be a positive number (milliseconds)');
//     }
    
//     const SIGNAL_INTERVAL = 300000; // 5 минут
    
//     try {
//         const existing = await dbService.checkRow(symbol, interval, 'control_send_signal');
        
//         if (!existing) {
//             await dbService.saveSendSignalControl(symbol, normalizedTimestamp, interval, typeSignal);
//             return true;
//         }
        
//         const timeDiff = normalizedTimestamp - existing.timestamp;
//         const isSameType = existing.type_signal === typeSignal;
        
//         // Блокируем повторный сигнал того же типа
//         if (isSameType && timeDiff < SIGNAL_INTERVAL) {
//             return false;
//         }
        
//         // Обновляем контроль (прошло 5 мин ИЛИ другой тип сигнала)
//         await dbService.removeRowOnSymbol(symbol, 'control_send_signal', existing.id);
//         await dbService.saveSendSignalControl(symbol, normalizedTimestamp, interval, typeSignal);
        
//         return true;
//     } catch (error) {
//         throw error;
//     }
// }





