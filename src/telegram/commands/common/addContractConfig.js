const logger = require('../../../utils/logger');
const {
    getContractsKeyboard,
    getIntervalsKeyboard,
} = require('../../keyboards');
const { updateHistoryData } = require('../../../data/syncHistoryData');
const priceTracker = require('../../../ws/priceTracker');
const dbService = require('../../../db/index');

const SYMBOL_REGEX = /^[A-Z0-9]{2,}USDT$/;
const INTERVAL_REGEX = /^(\d+|1|5|15|30|60|240)(m|h|d|w)?$/i;

const validateSymbol = (text) => {
    const symbol = text.toUpperCase();
    if (!SYMBOL_REGEX.test(symbol)) {
        return {
            isValid: false,
            error: 'Некорректный контракт. Используйте формат BTCUSDT или ETHUSDT.',
        };
    }
    return { isValid: true, value: symbol };
};

const validateInterval = (text) => {
    if (!INTERVAL_REGEX.test(text.toLowerCase())) {
        return {
            isValid: false,
            error: 'Некорректный таймфрейм. Используйте формат 5, 15, 60, 240.',
        };
    }
    return { isValid: true, value: text.toLowerCase() };
};

const validateQuantity = (text) => {
    const quantity = Number(text.replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity < 0.001 || quantity > 5) {
        return {
            isValid: false,
            error: 'Некорректное значение. Укажите число от 0.001 до 5 (например: 1.5 или 0.5).',
        };
    }
    return { isValid: true, value: quantity };
};

module.exports = {
    name: 'add',
    initialStep: 'symbol',
    steps: ['symbol', 'interval', 'quantity'],

    validators: {
        symbol: validateSymbol,
        interval: validateInterval,
        quantity: validateQuantity,
    },

    askFunctions: {
        symbol: async (ctx) => {
            try {
                const BybitClient = require('../../../rest/bybitRest');
                const bybitClient = new BybitClient();
                const contracts = await bybitClient.getTopTradingVolume(35);
                await ctx.reply(
                    'Добавление контракта\n\n1/3 Выберите фьючерсный контракт:',
                    getContractsKeyboard(contracts, 'add')
                );
            } catch (error) {
                logger.error('[addContractConfig.symbol] Ошибка получения контрактов:', error);
                await ctx.reply('Не удалось получить список контрактов. Попробуйте /add.');
            }
        },

        interval: async (ctx, symbol) => {
            await ctx.reply(
                `Контракт: ${symbol}\n\n2/3 Укажите таймфрейм:`,
                getIntervalsKeyboard('add')
            );
        },

        quantity: async (ctx, symbol) => {
            const { getUserState } = require('./wizardCore');
            const state = ctx.from?.id ? getUserState(ctx.from.id) : null;
            const interval = state?.data?.interval || '';
            await ctx.reply(
                `Контракт: ${symbol}\nТаймфрейм: ${interval}\n\n3/3 Укажите количество контрактов (от 0.001 до 5):`
            );
        },
    },

    finalAction: async (ctx, data) => {
        try {
            await updateHistoryData(data.symbol, data.interval);

            await dbService.saveTrackingContract([
                {
                    symbol: data.symbol,
                    interval: data.interval,
                    volatility: data.quantity,
                },
            ]);

            if (priceTracker.ws && priceTracker.ws.readyState === 1) {
                await priceTracker.reload();
            }

            await ctx.reply(
                '✅ Контракт успешно сохранен.\n\n' +
                    `Символ: ${data.symbol}\n` +
                    `Таймфрейм: ${data.interval}\n` +
                    `Количество: ${data.quantity}`
            );
        } catch (error) {
            logger.error(`[addContractConfig.finalAction] Ошибка: ${data.symbol}`, error);
            await ctx.reply('❌ Не удалось сохранить контракт. Попробуйте снова через /add.');
        }
    },
};
