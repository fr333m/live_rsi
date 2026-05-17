const PostgresDB = require('../../src/db/db');
const dbService = new PostgresDB();

const SIGNAL_INTERVAL = 3600000; // 60 минут (можно сделать параметром)

async function checkActualSignal(
    symbol,
    interval,
    timestamp,
    typeSignal,
    levelTimeStamp
) {
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
    if (isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
        throw new Error('timestamp must be a positive number');
    }

    try {
        const existing = await dbService.checkRowForTypeSignal(
            symbol,
            interval,
            typeSignal,
            'control_send_signal',
            String(levelTimeStamp)
        );

        // Если записи нет — разрешаем сигнал и сохраняем
        if (!existing) {
            await dbService.saveSendSignalControl(
                symbol,
                normalizedTimestamp,
                interval,
                typeSignal,
                levelTimeStamp
            );
            console.log(
                `[Signal Control] ✅ NEW signal: ${symbol} ${interval} | ${typeSignal}`
            );
            return true;
        }

        // Если запись есть — проверяем время
        const timeDiff = normalizedTimestamp - Number(existing.timestamp);

        if (timeDiff < SIGNAL_INTERVAL) {
            const minutesLeft = Math.round(
                (SIGNAL_INTERVAL - timeDiff) / 60000
            );
            console.log(
                `[Signal Control] ⛔ BLOCKED: ${symbol} ${interval} | ${typeSignal} — cooldown ${minutesLeft} min`
            );
            return false;
        }

        // Прошло достаточно времени — обновляем запись
        await dbService.removeRowOnSymbol(
            symbol,
            'control_send_signal',
            existing.id
        );

        await dbService.saveSendSignalControl(
            symbol,
            normalizedTimestamp,
            interval,
            typeSignal,
            levelTimeStamp
        );

        console.log(
            `[Signal Control] ✅ Signal allowed after cooldown: ${symbol} ${interval} | ${typeSignal}`
        );
        return true;
    } catch (error) {
        console.error(
            `[Signal Control Error] ${symbol} ${interval} ${typeSignal}:`,
            error
        );
        throw error; // или return false — зависит от стратегии
    }
}

module.exports = { checkActualSignal };
