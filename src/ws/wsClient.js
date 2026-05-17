// price-tracker.js
const WebSocket = require('ws');
const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const { EventEmitter } = require('events');
const priceCache = require('./priceCache');

// ===================== НАСТРОЙКИ =====================
class BybitpriceTracker extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.livePrices = new Map(); // symbol → priceInfo
        this.subscribedSymbols = new Set();
        this.reconnectTimeout = null;
        this.isConnecting = false;
    }

    async start() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            // Получаем актуальный список контрактов из БД
            const contracts = await dbService.uniqueSymbol(
                'all_contracts_tracking'
            ); // TODO: заменить на реальный запрос к БД

            if (!Array.isArray(contracts) || contracts.length === 0) {
                console.warn('❌ Нет контрактов для отслеживания');
                this.isConnecting = false;
                return;
            }

            this.subscribedSymbols = new Set(contracts);
            console.log(
                `🚀 Запуск трекера. Отслеживаем ${contracts.length} символов`
            );

            this.connect();
        } catch (err) {
            console.error('💥 Ошибка при запуске трекера:', err);
            this.isConnecting = false;
        }
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        this.ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

        this.ws.on('open', () => {
            console.log('🔌 Подключились к Bybit WebSocket');
            this.subscribe();
            this.isConnecting = false;
            this.emit('open');
        });

        this.ws.on('message', (rawData) => {
            this.handleMessage(rawData);
        });

        this.ws.on('close', () => {
            console.warn(
                '⚠️ WebSocket закрыт. Переподключаемся через 5 секунд...'
            );
            this.livePrices.clear();
            this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error('❌ WebSocket ошибка:', err.message);
        });
    }

    subscribe() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const args = Array.from(this.subscribedSymbols).map(
            (symbol) => `tickers.${symbol}`
        );

        const payload = {
            op: 'subscribe',
            args: args,
        };

        this.ws.send(JSON.stringify(payload));
        console.log(`📡 Подписались на ${args.length} тикеров`);
    }

    handleMessage(rawData) {
        try {
            const msg = JSON.parse(rawData.toString());

            // Подтверждение подписки
            if (msg.op === 'subscribe' && msg.success) {
                console.log('✅ Подписка успешно подтверждена');
                return;
            }

            // Данные тикера
            if (msg.topic?.startsWith('tickers.')) {
                const symbol = msg.topic.split('.')[1];
                console.log(`📥 Получены данные для ${symbol}`);
                const ticker = msg.data;

                if (!ticker) return;

                // Получаем предыдущие данные
                const prev = this.livePrices.get(symbol) || {};

                const priceInfo = {
                    symbol,
                    lastPrice:
                        ticker.lastPrice !== undefined
                            ? parseFloat(ticker.lastPrice)
                            : prev.lastPrice,

                    markPrice:
                        ticker.markPrice !== undefined
                            ? parseFloat(ticker.markPrice)
                            : prev.markPrice,

                    indexPrice:
                        ticker.indexPrice !== undefined
                            ? parseFloat(ticker.indexPrice)
                            : prev.indexPrice,

                    timestamp: Date.now(),
                };

                const hasChanged =
                    priceInfo.lastPrice !== prev.lastPrice ||
                    priceInfo.markPrice !== prev.markPrice;

                this.livePrices.set(symbol, priceInfo);

                // === ЭМИТТЕРЫ — вот главная фишка! ===
                this.emit('priceUpdate', priceInfo);

                // Дополнительно можно эмитировать событие только для конкретного символа
                this.emit(`price:${symbol}`, priceInfo);

                // Вывод в консоль (можно отключить в продакшене)
                if (hasChanged && !isNaN(priceInfo.lastPrice)) {
                    priceCache.update(symbol, priceInfo);
                    console.log(
                        `📈 ${priceInfo.symbol} - Last: ${priceInfo.lastPrice}, Mark: ${priceInfo.markPrice}, Index: ${priceInfo.indexPrice}, ${priceInfo.timestamp}`
                    );
                    console.log(
                        'Последняя цена для',
                        symbol,
                        ':',
                        priceTracker.getPrice(symbol).lastPrice
                    );
                }
            }
        } catch (err) {
            console.error('❌ Ошибка обработки сообщения WebSocket:', err);
        }
    }

    // ==================== Публичные методы ====================

    getPrice(symbol) {
        return this.livePrices.get(symbol) || null;
    }

    getAllPrices() {
        return Object.fromEntries(this.livePrices);
    }

    hasSymbol(symbol) {
        return this.subscribedSymbols.has(symbol);
    }

    // Очистить livePrices для удаленных символов
    _cleanupOldSymbols(currentSymbols) {
        for (const symbol of this.livePrices.keys()) {
            if (!currentSymbols.has(symbol)) {
                this.livePrices.delete(symbol);
                console.log(`🗑️ Удалены данные для символа ${symbol}`);
            }
        }
    }

    async ensureConnected() {
        if (this.isConnecting) return;

        // Если соединения нет или оно закрыто
        if (
            !this.ws ||
            this.ws.readyState === WebSocket.CLOSED ||
            this.ws.readyState === WebSocket.CLOSING
        ) {
            console.log('🔄 WebSocket неактивен → запускаем start()');
            await this.start();
            await this.waitForOpen(4000);
            return;
        }

        // Если соединение живое — просто обновляем подписку
        console.log('🔄 Соединение живое → обновляем подписку');
        await this.refreshSubscriptions();
    }

    async waitForOpen(timeout = 4000) {
        return new Promise((resolve) => {
            if (this.ws?.readyState === WebSocket.OPEN) return resolve(true);

            const timeoutId = setTimeout(() => resolve(false), timeout);

            this.once('open', () => {
                clearTimeout(timeoutId);
                resolve(true);
            });
        });
    }

    // Если список контрактов в БД изменился — можно переподписаться
    async refreshSubscriptions() {
        try {
            const contracts =
                await dbService.uniqueSymbol('tracking_contracts');

            if (!Array.isArray(contracts) || contracts.length === 0) {
                console.warn('❌ Нет контрактов в tracking_contracts');
                return;
            }

            const currentSymbols = new Set(contracts);

            // Очистка старых данных
            this._cleanupOldSymbols(currentSymbols);

            // Обновляем список
            this.subscribedSymbols = currentSymbols;

            console.log(`🔄 Обновлено подписок: ${contracts.length} символов`);

            // Если соединение открыто — отправляем новую подписку
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.subscribe(); // повторная подписка
            } else {
                this.connect();
            }
        } catch (err) {
            console.error('❌ Ошибка refreshSubscriptions:', err);
        }
    }

    async reload() {
        console.log('🔄 Перезагрузка трекера...');
        this.stop();
        this.livePrices.clear();
        this.subscribedSymbols.clear();
        this.reconnectTimeout = null;
        this.isConnecting = false;
        await this.start();
    }

    stop() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.on('error', () => {}); // Игнорируем ошибки при закрытии
            if (
                this.ws.readyState === WebSocket.OPEN ||
                this.ws.readyState === WebSocket.CONNECTING
            ) {
                try {
                    this.ws.close();
                } catch (err) {
                    console.warn(
                        '⚠️ Ошибка при закрытии WebSocket:',
                        err.message
                    );
                }
            }
            this.ws = null;
        }

        this.removeAllListeners();
        this.isConnecting = false;
        console.log('🛑 Трекер остановлен');
    }
}

// Создаём и экспортируем единственный экземпляр (Singleton)
const priceTracker = new BybitpriceTracker();

module.exports = priceTracker;
