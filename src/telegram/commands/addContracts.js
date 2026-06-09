const logger = require('../../utils/logger');
const { WizardHandler } = require('./common/wizardCore');
const addConfig = require('./common/addContractConfig');

const handler = new WizardHandler(addConfig);

const addContracts = async (ctx) => {
    logger.info(`[addContracts] Команда /add от пользователя ${ctx.from?.id}`);
    try {
        await handler.start(ctx);
    } catch (error) {
        logger.error('[addContracts] Ошибка:', error);
    }
};

const handleAddContractsMessage = async (ctx) => {
    try {
        await handler.handleMessage(ctx);
    } catch (error) {
        logger.error('[handleAddContractsMessage] Ошибка:', error);
    }
};

const handleSymbolCallback = async (ctx) => {
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error('[handleSymbolCallback] Ошибка:', error);
    }
};

const handleIntervalCallback = async (ctx) => {
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error('[handleIntervalCallback] Ошибка:', error);
    }
};

module.exports = {
    addContracts,
    handleAddContractsMessage,
    handleSymbolCallback,
    handleIntervalCallback,
};
