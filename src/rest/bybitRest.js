const { RestClientV5 } = require('bybit-api');
const config = require('../config/config');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

class BybitClient {
  constructor(apiKey = config.BYBIT_API_KEY, apiSecret = config.BYBIT_SECRET_KEY, proxyUrl = config.PROXY_URL) {
    proxyUrl = proxyUrl || config.PROXY_URL; // Allow proxy URL from constructor or environment variable
    const clientConfig = {
      key: apiKey,
      secret: apiSecret,
      // testnet: true, // Uncomment if using testnet
    };

    // Добавляем прокси если указан
    if (proxyUrl) {
      const agents = this.createProxyAgents(proxyUrl);
      clientConfig.httpAgent = agents.httpAgent;
      clientConfig.httpsAgent = agents.httpsAgent;
    }

    this.client = new RestClientV5(clientConfig);
  }

  /**
   * Создает HTTP и HTTPS агенты для работы через прокси
   * @param {string} proxyUrl - URL прокси (например, 'http://proxy.example.com:8080')
   * @returns {Object} Объект с httpAgent и httpsAgent
   */
  createProxyAgents(proxyUrl) {
    return {
      httpAgent: new HttpProxyAgent(proxyUrl),
      httpsAgent: new HttpsProxyAgent(proxyUrl),
    };
  }

  /**
   * Get candlestick (K-line) data for a symbol.
   * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
   * @param {string} interval - Kline interval, e.g., '1m', '5m', '1h', '1D'
   * @param {number} limit - Number of candles to return (1-1000, default 500)
   * @returns {Promise<Array<Array<string>>>} Array of candles: [[startTime, open, high, low, close, volume, turnover], ...]
   */
  async getCandles(symbol, interval, limit = 200) {
    try {
      const response = await this.client.getKline({
        category: 'linear', // For USDT perpetuals; change to 'spot' or 'inverse' if needed
        symbol,
        interval,
        limit,
      });
      if (response.retCode !== 0) {
        throw new Error(response.retMsg);
      }
      return response.result.list;
    } catch (error) {
      console.error('Error fetching candles:', error);
      throw error;
    }
  }

  /**
   * Get list of trading pairs (symbols) with 24h turnover >= limit (in USDT).
   * @param {number} topCount - Number of top symbols to return
   * @returns {Promise<Array<{symbol: string, turnover24h: string}>>} Filtered list of symbols with turnover
   */
  async getTopTradingVolume(topCount) {
    try {
      const response = await this.client.getTickers({
        category: 'linear', // For USDT perpetuals
      });
      if (response.retCode !== 0) {
        throw new Error(response.retMsg);
      }
      const sorted = response.result.list
        .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h)) // Sort descending by turnover24h
        .slice(0, topCount) // Take top N
        .map(ticker => ({
          symbol: ticker.symbol,
          turnover24h: ticker.turnover24h,
        }));
      return sorted;
    } catch (error) {
      console.error('Error fetching top trading volumes:', error);
      throw error;
    }
  }

  async getPrice(symbol) {
    try {
      const response = await this.client.getTickers({
        category: 'linear', // For USDT perpetuals
        symbol,
      });
      if (response.retCode !== 0) {
        throw new Error(response.retMsg);
      }
      if (!response.result.list || response.result.list.length === 0) {
        throw new Error('No data found for symbol');
      }
      return response.result.list[0].lastprice;
    } catch (error) {
      console.error('Error fetching price:', error);
      throw error;
    }
  }
}

module.exports = BybitClient;