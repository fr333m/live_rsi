const logger = require('../../../utils/logger');
const {
    getContractsKeyboard,
    getIntervalsKeyboard,
} = require('../../keyboards');
const {
    updateHistoryData,
} = require('../../add_contracts/update_ohlc_in_bybit');
const { priceTracker } = require('../../../ws/wsClient');
const PostgresDB = require('../../../db/db');

const dbService = new PostgresDB();

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
    const interval = text.toLowerCase();
    if (!INTERVAL_REGEX.test(interval)) {
        return {
            isValid: false,
            error: 'Некорректный таймфрейм. Используйте формат 5, 15, 60, 240.',
        };
    }
    return { isValid: true, value: interval };
};

const validateQuantity = (text) => {
    const normalized = text.replace(',', '.');
    const quantity = Number(normalized);

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
            logger.info(
                '[addContractConfig.askFunctions.symbol] Запрос списка контрактов'
            );
            try {
                const BybitClient = require('../../../rest/bybitRest');
                const bybitClient = new BybitClient();
                logger.debug(
                    '[addContractConfig.askFunctions.symbol] Получение топ 35 контрактов по объему'
                );
                const contracts = await bybitClient.getTopTradingVolume(35);
                logger.info(
                    `[addContractConfig.askFunctions.symbol] Получено ${contracts.length} контрактов`
                );

                await ctx.reply(
                    'Добавление контракта\n\n1/3 Выберите фьючерсный контракт:',
                    getContractsKeyboard(contracts, 'add')
                );
            } catch (error) {
                logger.error(
                    '[addContractConfig.askFunctions.symbol] Ошибка при получении контрактов:',
                    error
                );
                await ctx.reply(
                    'Не удалось получить список контрактов. Попробуйте /add.'
                );
            }
        },

        interval: async (ctx, symbol) => {
            logger.info(
                `[addContractConfig.askFunctions.interval] Запрос интервала для символа: ${symbol}`
            );
            await ctx.reply(
                `Контракт: ${symbol}\n\n2/3 Укажите таймфрейм:`,
                getIntervalsKeyboard('add')
            );
        },

        quantity: async (ctx, symbol) => {
            logger.info(
                `[addContractConfig.askFunctions.quantity] Запрос количества для символа: ${symbol}`
            );
            // Получаем текущее состояние, чтобы показать интервал
            const { getUserState } = require('./wizzardCore');
            const userId = ctx.from?.id;
            const state = userId ? getUserState(userId) : null;
            const interval = state?.data?.interval || '';
            logger.debug(
                `[addContractConfig.askFunctions.quantity] userId=${userId}, interval=${interval}`
            );

            await ctx.reply(
                `Контракт: ${symbol}\n` +
                    `Таймфрейм: ${interval}\n\n` +
                    '3/3 Укажите количество контрактов (от 0.001 до 5):'
            );
        },
    },

    finalAction: async (ctx, data) => {
        logger.info(
            `[addContractConfig.finalAction] Финальное сохранение контракта: symbol=${data.symbol}, interval=${data.interval}, quantity=${data.quantity}`
        );
        try {
            logger.debug(
                `[addContractConfig.finalAction] Обновление исторических данных для ${data.symbol} (${data.interval})`
            );
            await updateHistoryData(data.symbol, data.interval);

            logger.debug(
                `[addContractConfig.finalAction] Сохранение контракта в БД`
            );
            await dbService.saveTrackingContract([
                {
                    symbol: data.symbol,
                    interval: data.interval,
                    volatility: data.quantity,
                },
            ]);

            if ({ priceTracker }.ws && priceTracker.ws.readyState === 1) {
                logger.debug(
                    `[addContractConfig.finalAction] Перезагрузка ценового трекера`
                );
                await priceTracker.reload();
            } else {
                logger.warn(
                    `[addContractConfig.finalAction] WebSocket прайс-трекера недоступен`
                );
            }

            logger.info(
                `[addContractConfig.finalAction] Контракт успешно сохранен: ${data.symbol} (${data.interval})`
            );
            await ctx.reply(
                '✅ Контракт успешно сохранен.\n\n' +
                    `Символ: ${data.symbol}\n` +
                    `Таймфрейм: ${data.interval}\n` +
                    `Количество: ${data.quantity}`
            );
        } catch (error) {
            logger.error(
                `[addContractConfig.finalAction] Ошибка при сохранении контракта: ${data.symbol}`,
                error
            );
            await ctx.reply(
                '❌ Не удалось сохранить контракт. Попробуйте снова через /add.'
            );
        }
    },
};
