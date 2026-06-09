const WebSocket = require('ws');
const dbService = require('../db/index');
const { EventEmitter } = require('events');
const priceCache = require('../cache/priceCache');
const marketFlowCache = require('../cache/marketFlowCache');

class BybitpriceTracker extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.livePrices = new Map();
        this.subscribedSymbols = new Set();
        this.reconnectTimeout = null;
        this.isConnecting = false;
    }

    async start() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            const contracts = await dbService.uniqueSymbol('tracking_contracts');

            if (!Array.isArray(contracts) || contracts.length === 0) {
                console.warn('❌ Нет контрактов для отслеживания');
                this.isConnecting = false;
                return;
            }

            this.subscribedSymbols = new Set(contracts);
            console.log(`🚀 Запуск трекера. Отслеживаем ${contracts.length} символов`);

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
            console.warn('⚠️ WebSocket закрыт. Переподключаемся через 5 секунд...');
            this.livePrices.clear();
            this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error('❌ WebSocket ошибка:', err.message);
        });
    }

    subscribe() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const symbols = Array.from(this.subscribedSymbols);
        const args = [
            ...symbols.map((s) => `tickers.${s}`),
            ...symbols.map((s) => `orderbook.50.${s}`),
            ...symbols.map((s) => `publicTrade.${s}`),
        ];

        this.ws.send(JSON.stringify({ op: 'subscribe', args }));
        console.log(`📡 Подписались на ${symbols.length} символов (tickers + orderbook + trades)`);
    }

    handleMessage(rawData) {
        try {
            const msg = JSON.parse(rawData.toString());

            if (msg.op === 'subscribe' && msg.success) {
                console.log('✅ Подписка успешно подтверждена');
                return;
            }

            if (msg.topic?.startsWith('orderbook.') || msg.topic?.startsWith('publicTrade.')) {
                marketFlowCache.handleMessage(msg);
                return;
            }

            if (msg.topic?.startsWith('tickers.')) {
                const symbol = msg.topic.split('.')[1];
                const ticker = msg.data;

                if (!ticker) return;

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

                this.emit('priceUpdate', priceInfo);
                this.emit(`price:${symbol}`, priceInfo);

                if (hasChanged && !isNaN(priceInfo.lastPrice)) {
                    priceCache.update(symbol, priceInfo);
                }
            }
        } catch (err) {
            console.error('❌ Ошибка обработки сообщения WebSocket:', err);
        }
    }

    getPrice(symbol) {
        return this.livePrices.get(symbol) || null;
    }

    getAllPrices() {
        return Object.fromEntries(this.livePrices);
    }

    hasSymbol(symbol) {
        return this.subscribedSymbols.has(symbol);
    }

    _cleanupOldSymbols(currentSymbols) {
        for (const symbol of this.livePrices.keys()) {
            if (!currentSymbols.has(symbol)) {
                this.livePrices.delete(symbol);
                marketFlowCache.remove(symbol);
            }
        }
    }

    async ensureConnected() {
        if (this.isConnecting) return;

        if (
            !this.ws ||
            this.ws.readyState === WebSocket.CLOSED ||
            this.ws.readyState === WebSocket.CLOSING
        ) {
            await this.start();
            await this.waitForOpen(4000);
            return;
        }

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

    async refreshSubscriptions() {
        try {
            const contracts = await dbService.uniqueSymbol('tracking_contracts');

            if (!Array.isArray(contracts) || contracts.length === 0) {
                console.warn('❌ Нет контрактов в tracking_contracts');
                return;
            }

            const currentSymbols = new Set(contracts);
            this._cleanupOldSymbols(currentSymbols);
            this.subscribedSymbols = currentSymbols;

            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.subscribe();
            } else {
                this.connect();
            }
        } catch (err) {
            console.error('❌ Ошибка refreshSubscriptions:', err);
        }
    }

    async reload() {
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
            this.ws.on('error', () => {});
            if (
                this.ws.readyState === WebSocket.OPEN ||
                this.ws.readyState === WebSocket.CONNECTING
            ) {
                try {
                    this.ws.close();
                } catch (err) {
                    console.warn('⚠️ Ошибка при закрытии WebSocket:', err.message);
                }
            }
            this.ws = null;
        }

        this.removeAllListeners();
        this.isConnecting = false;
        console.log('🛑 Трекер остановлен');
    }
}

const priceTracker = new BybitpriceTracker();
module.exports = priceTracker;
