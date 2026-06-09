const dbService = require('../db/index');

const COOLDOWN_CONFIG = {
    1: 5 * 60 * 1000,
    3: 10 * 60 * 1000,
    5: 10 * 60 * 1000,
    15: 30 * 60 * 1000,
    30: 30 * 60 * 1000,
    60: 30 * 60 * 1000,
    120: 45 * 60 * 1000,
    240: 60 * 60 * 1000,
    D: 2 * 60 * 60 * 1000,
};

const DEFAULT_COOLDOWN = 60 * 60 * 1000;

async function checkActualSignal(symbol, interval, timestamp, typeSignal, levelTimeStamp) {
    if (!symbol?.trim() || !interval?.trim()) throw new Error('symbol and interval are required');
    if (!typeSignal?.trim()) throw new Error('typeSignal is required');
    if (!levelTimeStamp) throw new Error('levelTimeStamp is required');

    const normalizedTimestamp = Number(timestamp);
    if (isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
        throw new Error('timestamp must be a positive number');
    }

    const cooldownMs = COOLDOWN_CONFIG[interval] ?? DEFAULT_COOLDOWN;

    try {
        const existing = await dbService.checkRowForTypeSignal(
            symbol,
            interval,
            typeSignal,
            'control_send_signal',
            String(levelTimeStamp)
        );

        if (!existing) {
            const saved = await dbService.saveSendSignalControl(
                symbol,
                normalizedTimestamp,
                interval,
                typeSignal,
                levelTimeStamp
            );
            if (saved) {
                console.log(
                    `[Signal Control] ✅ NEW signal: ${symbol} ${interval} | ${typeSignal} (cooldown ${cooldownMs / 60000} min)`
                );
            }
            return saved;
        }

        const timeDiff = normalizedTimestamp - Number(existing.timestamp);

        if (timeDiff < cooldownMs) {
            const minutesLeft = Math.round((cooldownMs - timeDiff) / 60000);
            console.log(
                `[Signal Control] ⛔ BLOCKED: ${symbol} ${interval} | ${typeSignal} — ${minutesLeft} min left`
            );
            return false;
        }

        await dbService.updateSendSignalTimestamp(existing.id, normalizedTimestamp);
        console.log(
            `[Signal Control] ✅ Signal allowed after cooldown: ${symbol} ${interval} | ${typeSignal}`
        );
        return true;
    } catch (error) {
        console.error(`[Signal Control Error] ${symbol} ${interval} ${typeSignal}:`, error);
        throw error;
    }
}

module.exports = { checkActualSignal };
