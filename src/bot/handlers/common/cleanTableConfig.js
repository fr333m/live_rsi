const logger = require('../../../utils/logger');
const {
    getContractsKeyboard,
    getIntervalsKeyboard,
} = require('../../keyboards');
const PostgresDB = require('../../../db/db');

const dbService = new PostgresDB();

const SYMBOL_REGEX = /^[A-Z0-9]{2,}USDT$/;
const INTERVAL_REGEX = /^(\d+|1|5|15|30)(m|h|d|w)?$/i;

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
            error: 'Некорректный таймфрейм. Используйте формат 5m, 15m, 1h, 4h.',
        };
    }
    return { isValid: true, value: interval };
};

module.exports = {
    name: 'clean',
    initialStep: 'interval', // Важно: у clean первый шаг — интервал
    steps: ['interval', 'symbol'],

    validators: {
        interval: validateInterval,
        symbol: validateSymbol,
    },

    askFunctions: {
        interval: async (ctx) => {
            logger.info(
                '[cleanTableConfig.askFunctions.interval] Запрос интервала для удаления'
            );
            await ctx.reply(
                '1/2 Укажите таймфрейм:',
                getIntervalsKeyboard('delete')
            ); // Передаем тип клавиатуры для очистки
        },

        symbol: async (ctx, interval) => {
            logger.info(
                `[cleanTableConfig.askFunctions.symbol] Запрос контрактов для интервала: ${interval}`
            );
            try {
                logger.debug(
                    `[cleanTableConfig.askFunctions.symbol] Получение контрактов из БД для интервала ${interval}`
                );
                const contracts = await dbService.getRowsByInterval(
                    interval,
                    'all_contracts_tracking'
                );
                if (contracts.length === 0) {
                    ctx.reply(
                        `Нет контрактов для интервала ${interval}. Попробуйте другой таймфрейм.`
                    );
                    return;
                }
                logger.info(
                    `[cleanTableConfig.askFunctions.symbol] Получено ${contracts.length} контрактов для интервала ${interval}`
                );

                await ctx.reply(
                    `Таймфрейм: ${interval}\n\n2/2 Выберите фьючерсный контракт:`,
                    getContractsKeyboard(contracts, 'delete') // Передаем тип клавиатуры для очистки
                );
            } catch (error) {
                logger.error(
                    `[cleanTableConfig.askFunctions.symbol] Ошибка при получении контрактов для интервала ${interval}:`,
                    error
                );
                await ctx.reply(
                    'Не удалось получить список контрактов. Попробуйте снова через /clean.'
                );
            }
        },
    },

    finalAction: async (ctx, data) => {
        logger.info(
            `[cleanTableConfig.finalAction] Начало очистки таблиц: symbol=${data.symbol}, interval=${data.interval}`
        );
        const id = undefined; // В данном случае id не нужен, так как удаляем по символу и интервалу
        const tablesNames = [
            'all_contracts_tracking',
            'control_send_signal',
            'tracking_contracts',
        ];

        try {
            logger.debug(
                `[cleanTableConfig.finalAction] Удаление ${data.symbol} из ${tablesNames.length} таблиц`
            );
            const deletePromises = tablesNames.map((table) => {
                logger.debug(
                    `[cleanTableConfig.finalAction] Очистка таблицы: ${table}`
                );
                return dbService.removeRowOnSymbol(
                    data.symbol,
                    table,
                    id,
                    data.interval
                );
            });

            await Promise.all(deletePromises);
            logger.info(
                `[cleanTableConfig.finalAction] Все таблицы успешно очищены для ${data.symbol} (${data.interval})`
            );

            await ctx.reply(
                '✅ Таблица успешно очищена.\n\n' +
                    `Символ: ${data.symbol}\n` +
                    `Таймфрейм: ${data.interval}`
            );
        } catch (error) {
            logger.error(
                `[cleanTableConfig.finalAction] Ошибка при очистке таблиц для ${data.symbol}:`,
                error
            );
            await ctx.reply(
                '❌ Не удалось выполнить очистку. Попробуйте снова через /clean.'
            );
        }
    },
};
