const PostgresDB = require('../db/db');
const { priceTracker } = require('../ws/wsClient');
const BybitClient = require('../rest/bybitRest');
const bybitClient = new BybitClient();
const { getContractsKeyboard, getIntervalsKeyboard } = require('./keyboards');
const { updateHistoryData } = require('./add_contracts/update_ohlc_in_bybit');

const dbService = new PostgresDB();
const userStates = new Map();

const SYMBOL_REGEX = /^[A-Z0-9]{2,}USDT$/;
const INTERVAL_REGEX = /^(\d+|1|5|15|30)(m|h|d|w)?$/i;
const SIDE_MAP = {
    BAY: 'BUY',
    BUY: 'BUY',
    SELL: 'SELL',
};

// Преобразование интервала в формат Bybit (добавляем 'm' если нужно)
const normalizeInterval = (interval) => {
    interval = interval.toLowerCase();
    if (
        interval === '1' ||
        interval === '5' ||
        interval === '15' ||
        interval === '30'
    ) {
        return `${interval}`;
    }
    return interval;
};

const getUserId = (ctx) => ctx.from?.id;
const getMessageText = (ctx) => ctx.message?.text?.trim() || '';

const resetUserState = (userId) => {
    userStates.delete(userId);
};

const askSymbol = async (ctx) => {
    try {
        const contracts = await bybitClient.getTopTradingVolume(35);
        await ctx.reply(
            'Добавление контракта\n\n' + '1/3 Выберите фьючерсный контракт:',
            getContractsKeyboard(contracts)
        );
    } catch (error) {
        console.error('Ошибка при получении контрактов:', error);
        await ctx.reply(
            'Не удалось получить список контрактов. Попробуйте снова через /add.'
        );
    }
};

const askInterval = async (ctx, symbol) => {
    await ctx.reply(
        `Контракт: ${symbol}\n\n` + '2/3 Укажите таймфрейм:',
        getIntervalsKeyboard()
    );
};

const askPrice = async (ctx, userId) => {
    const state = userStates.get(userId);
    if (!state) {
        await ctx.reply('Сессия истекла. Начните снова с /add.');
        return;
    }

    const symbol = state.data.symbol;
    const interval = state.data.interval;

    await ctx.reply(
        `Контракт: ${symbol}\n` +
            `Таймфрейм: ${interval}\n\n` +
            '3/3 Укажите количество контрактов (от 0.001 до 5):'
    );
};

const validateSymbol = (text) => {
    const symbol = text.toUpperCase();

    if (!SYMBOL_REGEX.test(symbol)) {
        return {
            isValid: false,
            error: 'Некорректный контракт. Используйте формат BTCUSDT или ETHUSDT.',
        };
    }

    return {
        isValid: true,
        value: symbol,
    };
};

const validateInterval = (text) => {
    const interval = text.toLowerCase();

    if (!INTERVAL_REGEX.test(interval)) {
        return {
            isValid: false,
            error: 'Некорректный таймфрейм. Используйте формат 5m, 15m, 1h, 4h.',
        };
    }

    return {
        isValid: true,
        value: interval,
    };
};

const validatePrice = (text) => {
    const normalizedText = text.replace(',', '.');
    const price = Number(normalizedText);

    if (!Number.isFinite(price) || price < 0.001 || price > 5) {
        return {
            isValid: false,
            error: 'Некорректное значение. Укажите число от 0.001 до 5 (пример: 1.5 или 0.5).',
        };
    }

    return {
        isValid: true,
        value: price,
    };
};

// Обработчик выбора контракта через callback
const handleSymbolCallback = async (ctx) => {
    const userId = getUserId(ctx);
    const data = ctx.callbackQuery.data;
    const symbol = data.replace('symbol_', '');

    if (!userId) {
        await ctx.reply('Не удалось определить пользователя.');
        return;
    }

    const state = userStates.get(userId);
    if (!state) {
        await ctx.reply('Сессия истекла. Начните снова с /add.');
        return;
    }

    state.data.symbol = symbol;
    state.step = 'interval';
    userStates.set(userId, state);

    await ctx.answerCbQuery(); // Закрыть уведомление
    await askInterval(ctx, symbol);
};

// Обработчик выбора интервала через callback
const handleIntervalCallback = async (ctx) => {
    const userId = getUserId(ctx);
    const data = ctx.callbackQuery.data;
    const interval = normalizeInterval(data.replace('interval_', ''));

    if (!userId) {
        await ctx.reply('Не удалось определить пользователя.');
        return;
    }

    const state = userStates.get(userId);
    if (!state) {
        await ctx.reply('Сессия истекла. Начните снова с /add.');
        return;
    }

    state.data.interval = interval;
    state.step = 'quantity';
    userStates.set(userId, state);

    await ctx.answerCbQuery();
    await askPrice(ctx, userId);
};

const addContracts = async (ctx) => {
    const userId = getUserId(ctx);

    if (!userId) {
        await ctx.reply('Не удалось определить пользователя.');
        return;
    }

    userStates.set(userId, {
        step: 'symbol',
        data: {},
    });

    await askSymbol(ctx);
};

const handleAddContractsMessage = async (ctx) => {
    const userId = getUserId(ctx);
    const text = getMessageText(ctx);

    if (!userId || !text || text.startsWith('/')) {
        return;
    }

    const state = userStates.get(userId);

    if (!state) {
        return;
    }

    try {
        if (state.step === 'symbol') {
            const result = validateSymbol(text);

            if (!result.isValid) {
                await ctx.reply(result.error);
                await askSymbol(ctx);
                return;
            }

            state.data.symbol = result.value;
            state.step = 'interval';
            userStates.set(userId, state);
            await askInterval(ctx, state.data.symbol);
            return;
        }

        if (state.step === 'interval') {
            const normalizedInterval = normalizeInterval(text);
            const result = validateInterval(normalizedInterval);

            if (!result.isValid) {
                await ctx.reply(result.error);
                await askInterval(ctx, state.data.symbol);
                return;
            }

            state.data.interval = normalizedInterval;
            state.step = 'quantity';
            userStates.set(userId, state);
            await askPrice(ctx, userId);
            return;
        }

        if (state.step === 'quantity') {
            const result = validatePrice(text);

            if (!result.isValid) {
                await ctx.reply(result.error);
                await askPrice(ctx, userId);
                return;
            }

            const symbol = state.data.symbol;
            const interval = state.data.interval;
            const price = result.value;
            console.log(
                `Сохранение контракта: ${symbol}, ${interval}, ${price}`
            );

            try {
                await updateHistoryData(symbol, interval);
                await dbService.saveTrackingContract([
                    { symbol, interval, volatility: price },
                ]);

                if (priceTracker.ws && priceTracker.ws.readyState === 1) {
                    await priceTracker.reload();
                }

                await ctx.reply(
                    'Контракт успешно сохранен.\n\n' +
                        `Символ: ${symbol}\n` +
                        `Таймфрейм: ${interval}\n` +
                        `Волатильность: ${price}\n`
                );

                resetUserState(userId);
            } catch (error) {
                console.error('Ошибка при сохранении контракта:', error);
                resetUserState(userId);
                await ctx.reply(
                    'Не удалось сохранить контракт. Попробуйте снова через /add.'
                );
            }
        }
    } catch (error) {
        console.error('Ошибка в addContracts:', error);
        resetUserState(userId);
        await ctx.reply(
            'Не удалось сохранить контракт. Попробуйте снова через /add.'
        );
    }
};

module.exports = {
    addContracts,
    handleAddContractsMessage,
    handleSymbolCallback,
    handleIntervalCallback,
};
