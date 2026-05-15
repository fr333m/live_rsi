const logger = require('../../utils/logger');
const { WizardHandler } = require('./common/wizzardCore');
const addConfig = require('./common/addContractConfig');

const handler = new WizardHandler(addConfig);

const addContracts = async (ctx) => {
    logger.info(
        `[addContracts] Команда /add получена от пользователя ${ctx.from?.id}`
    );
    try {
        await handler.start(ctx);
    } catch (error) {
        logger.error('[addContracts] Ошибка при запуске handler:', error);
    }
};

const handleAddContractsMessage = async (ctx) => {
    logger.debug(
        `[handleAddContractsMessage] Обработка текстового сообщения от пользователя ${ctx.from?.id}`
    );
    try {
        await handler.handleMessage(ctx);
    } catch (error) {
        logger.error(
            '[handleAddContractsMessage] Ошибка при обработке сообщения:',
            error
        );
    }
};

const handleSymbolCallback = async (ctx) => {
    logger.debug(
        `[handleSymbolCallback] Callback по символу: ${ctx.callbackQuery?.data}`
    );
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error(
            '[handleSymbolCallback] Ошибка при обработке callback:',
            error
        );
    }
};

const handleIntervalCallback = async (ctx) => {
    logger.debug(
        `[handleIntervalCallback] Callback по интервалу: ${ctx.callbackQuery?.data}`
    );
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error(
            '[handleIntervalCallback] Ошибка при обработке callback:',
            error
        );
    }
};

module.exports = {
    addContracts,
    handleAddContractsMessage,
    handleSymbolCallback,
    handleIntervalCallback,
};
