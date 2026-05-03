// price-tracker.js
const WebSocket = require('ws');
const SqliteDB = require('../db/db');
const dbService = new SqliteDB('./candles.db');
const { EventEmitter }  = require('events');

// ===================== НАСТРОЙКИ =====================
class BybitPriceTracker extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.livePrices = new Map();           // symbol → priceInfo
    this.subscribedSymbols = new Set();
    this.reconnectTimeout = null;
    this.isConnecting = false;
  }

  async start() {

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      // Получаем актуальный список контрактов из БД
      const contracts = await dbService.uniqueSymbol('all_contracts_tracking'); // TODO: заменить на реальный запрос к БД

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

    const args = Array.from(this.subscribedSymbols).map(symbol => `tickers.${symbol}`);

    const payload = {
      op: 'subscribe',
      args: args
    };

    this.ws.send(JSON.stringify(payload));
    console.log(`📡 Подписались на ${args.length} тикеров`);
  }

 async handleMessage(rawData) {
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
          lastPrice: ticker.lastPrice !== undefined 
            ? parseFloat(ticker.lastPrice) 
            : prev.lastPrice,

          markPrice: ticker.markPrice !== undefined 
            ? parseFloat(ticker.markPrice) 
            : prev.markPrice,

          indexPrice: ticker.indexPrice !== undefined 
            ? parseFloat(ticker.indexPrice) 
            : prev.indexPrice,

          timestamp: Date.now()
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
          await dbService.saveLivePrice(priceInfo);
           console.log(`📈 ${priceInfo.symbol} - Last: ${priceInfo.lastPrice}, Mark: ${priceInfo.markPrice}, Index: ${priceInfo.indexPrice}, ${priceInfo.timestamp}`);
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
  async _cleanupOldSymbols() {
    const currentSymbols = new Set(await dbService.uniqueSymbol('trackingContracts'));
    
    for (const symbol of this.livePrices.keys()) {
      if (!currentSymbols.has(symbol)) {
        this.livePrices.delete(symbol);
        console.log(`🗑️ Удалены данные для символа ${symbol}`);
      }
    }
  }

  // Если список контрактов в БД изменился — можно переподписаться
  async refreshSubscriptions() {
    try {
      // Обновляем список подписанных символов из БД
      const contracts = await dbService.uniqueSymbol('trackingContracts');
      
      if (!Array.isArray(contracts) || contracts.length === 0) {
        console.warn('❌ Нет контрактов для отслеживания');
        return;
      }

      // Очищаем livePrices от удаленных символов
      await this._cleanupOldSymbols();

      // Обновляем подписки
      this.subscribedSymbols = new Set(contracts);
      console.log(`🔄 Обновлены подписки. Отслеживаем ${contracts.length} символов`);

      // Переподключаемся для применения новых подписок
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
    } catch (err) {
      console.error('❌ Ошибка при обновлении подписок:', err.message);
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
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
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

// Создаём и экспортируем единственный экземпляр (Singleton)
const priceTracker = new BybitPriceTracker();

module.exports = {priceTracker};

