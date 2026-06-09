const { BybitOrderBook } = require('../analysis/flow/orderBook');
const { CvdTracker } = require('../analysis/flow/cvdTracker');

class MarketFlowCache {
    constructor() {
        this._cache = new Map(); // symbol -> { book: BybitOrderBook, cvd: CvdTracker }
    }

    ensure(symbol) {
        if (!this._cache.has(symbol)) {
            this._cache.set(symbol, {
                book: new BybitOrderBook(symbol),
                cvd: new CvdTracker(symbol, { windowMs: 30000 }),
            });
        }
        return this._cache.get(symbol);
    }

    get(symbol) {
        return this._cache.get(symbol) || null;
    }

    remove(symbol) {
        this._cache.delete(symbol);
    }

    // Роутинг WS-сообщения к нужному экземпляру по топику
    handleMessage(msg) {
        if (!msg || !msg.topic) return;
        const topic = msg.topic;

        if (topic.startsWith('orderbook.')) {
            // orderbook.50.BTCUSDT -> parts[2]
            const symbol = topic.split('.')[2];
            if (symbol) this.ensure(symbol).book.handleMessage(msg);
        } else if (topic.startsWith('publicTrade.')) {
            // publicTrade.BTCUSDT -> parts[1]
            const symbol = topic.split('.')[1];
            if (symbol) this.ensure(symbol).cvd.handleMessage(msg);
        }
    }

    clear() {
        this._cache.clear();
    }
}

module.exports = new MarketFlowCache();
