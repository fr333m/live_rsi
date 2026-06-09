const logger = require('../../../utils/logger');
const {
    getContractsKeyboard,
    getIntervalsKeyboard,
} = require('../../keyboards');
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

module.exports = {
    name: 'clean',
    initialStep: 'interval',
    steps: ['interval', 'symbol'],

    validators: {
        interval: validateInterval,
        symbol: validateSymbol,
    },

    askFunctions: {
        interval: async (ctx) => {
            await ctx.reply('1/2 Укажите таймфрейм:', getIntervalsKeyboard('delete'));
        },

        symbol: async (ctx, interval) => {
            try {
                const contracts = await dbService.getRowsByInterval(
                    interval,
                    'all_contracts_tracking'
                );
                if (contracts.length === 0) {
                    ctx.reply(`Нет контрактов для интервала ${interval}. Попробуйте другой таймфрейм.`);
                    return;
                }
                await ctx.reply(
                    `Таймфрейм: ${interval}\n\n2/2 Выберите фьючерсный контракт:`,
                    getContractsKeyboard(contracts, 'delete')
                );
            } catch (error) {
                logger.error(`[cleanTableConfig.symbol] Ошибка для интервала ${interval}:`, error);
                await ctx.reply('Не удалось получить список контрактов. Попробуйте снова через /clean.');
            }
        },
    },

    finalAction: async (ctx, data) => {
        const tables = [
            'all_contracts_tracking',
            'control_send_signal',
            'tracking_contracts',
        ];

        try {
            await Promise.all(
                tables.map((table) =>
                    dbService.removeRowOnSymbol(data.symbol, table, undefined, data.interval)
                )
            );

            await ctx.reply(
                '✅ Таблица успешно очищена.\n\n' +
                    `Символ: ${data.symbol}\n` +
                    `Таймфрейм: ${data.interval}`
            );
        } catch (error) {
            logger.error(`[cleanTableConfig.finalAction] Ошибка для ${data.symbol}:`, error);
            await ctx.reply('❌ Не удалось выполнить очистку. Попробуйте снова через /clean.');
        }
    },
};
