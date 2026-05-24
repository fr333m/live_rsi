const dbService = require('../db/dbInstance');

// ==================== CONFIG ====================
const COOLDOWN_CONFIG = {
    1: 10 * 60 * 1000, // 10 минут
    3: 10 * 60 * 1000,
    5: 10 * 60 * 1000, // 10 минут
    15: 30 * 60 * 1000, // 30 минут
    30: 30 * 60 * 1000,
    60: 30 * 60 * 1000, // 30 минут
    120: 45 * 60 * 1000, // 45 минут (пример)
    240: 60 * 60 * 1000, // 1 час
    D: 2 * 60 * 60 * 1000, // 2 часа для дневного
    // добавляй по необходимости
};

const DEFAULT_COOLDOWN = 60 * 60 * 1000; // 60 минут по умолчанию
// ===============================================

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

    // === Получаем cooldown для текущего таймфрейма ===
    const cooldownMs = COOLDOWN_CONFIG[interval] ?? DEFAULT_COOLDOWN;

    try {
        const existing = await dbService.checkRowForTypeSignal(
            symbol,
            interval,
            typeSignal,
            'control_send_signal',
            String(levelTimeStamp)
        );

        // Если записи нет — разрешаем сигнал
        if (!existing) {
            await dbService.saveSendSignalControl(
                symbol,
                normalizedTimestamp,
                interval,
                typeSignal,
                levelTimeStamp
            );
            console.log(
                `[Signal Control] ✅ NEW signal: ${symbol} ${interval} | ${typeSignal} (cooldown ${cooldownMs / 60000} min)`
            );
            return true;
        }

        // Если запись есть — проверяем cooldown
        const timeDiff = normalizedTimestamp - Number(existing.timestamp);

        if (timeDiff < cooldownMs) {
            const minutesLeft = Math.round((cooldownMs - timeDiff) / 60000);
            console.log(
                `[Signal Control] ⛔ BLOCKED: ${symbol} ${interval} | ${typeSignal} — ${minutesLeft} min left`
            );
            return false;
        }

        // Прошло достаточно времени — обновляем
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
        throw error;
    }
}

module.exports = { checkActualSignal };
