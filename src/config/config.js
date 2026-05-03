// config.js
require('dotenv').config();

class Config {
  constructor() {
    this.BYBIT_API_KEY = process.env.BYBIT_API_KEY
    this.BYBIT_SECRET_KEY = process.env.BYBIT_SECRET_KEY
    this.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    this.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
    this.TELEGRAM_API_URL = process.env.TELEGRAM_API_URL
    this.BASE_URL = process.env.BASE_URL
    this.DB_PATH = process.env.DB_PATH
    this.PROXY_URL = process.env.PROXY_URL
  }
}

module.exports = new Config();