const fs = require('fs');
const path = require('path');

// Путь к файлу логов
const logsDir = path.join(__dirname, '../../logs');
const logFile = path.join(logsDir, 'bot.log');

// Создаем директорию логов если её нет
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Уровни логирования
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// ===== ОТКЛЮЧИТЬ ЛОГИРОВАНИЕ =====
// Измени на false чтобы отключить логи
const LOGGING_ENABLED = true;
// ==================================

// Текущий уровень логирования (можно менять через переменную окружения)
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

/**
 * Форматирует сообщение логирования
 * @param {string} level - уровень логирования
 * @param {string} message - сообщение
 * @param {*} data - дополнительные данные
 */
const formatLog = (level, message, data = '') => {
    const timestamp = new Date().toISOString();
    const dataStr =
        data instanceof Error
            ? `\n${data.stack}`
            : data
              ? ` | ${JSON.stringify(data)}`
              : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
};

/**
 * Пишет лог в файл и консоль
 * @param {string} level - уровень логирования
 * @param {string} message - сообщение
 * @param {*} data - дополнительные данные
 */
const writeLog = (level, message, data = '') => {
    const logMessage = formatLog(level, message, data);

    // Вывод в консоль с цветом
    const colorMap = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m', // Green
        WARN: '\x1b[33m', // Yellow
        ERROR: '\x1b[31m', // Red
        RESET: '\x1b[0m', // Reset
    };

    const color = colorMap[level] || '';
    console.log(`${color}${logMessage}${colorMap.RESET}`);

    // Запись в файл
    try {
        fs.appendFileSync(logFile, logMessage + '\n', 'utf-8');
    } catch (err) {
        console.error('Ошибка при записи в лог файл:', err);
    }
};

// Logger объект с методами
const logger = {
    debug: (message, data) => {
        if (!LOGGING_ENABLED) return;
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            writeLog('DEBUG', message, data);
        }
    },

    info: (message, data) => {
        if (!LOGGING_ENABLED) return;
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
            writeLog('INFO', message, data);
        }
    },

    warn: (message, data) => {
        if (!LOGGING_ENABLED) return;
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
            writeLog('WARN', message, data);
        }
    },

    error: (message, data) => {
        if (!LOGGING_ENABLED) return;
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
            writeLog('ERROR', message, data);
        }
    },

    /**
     * Очищает лог файл
     */
    clear: () => {
        if (!LOGGING_ENABLED) return;
        try {
            fs.writeFileSync(logFile, '', 'utf-8');
            console.log('Лог файл очищен');
        } catch (err) {
            console.error('Ошибка при очистке лог файла:', err);
        }
    },

    /**
     * Получает последние N строк логов
     * @param {number} lines - количество строк
     */
    tail: (lines = 50) => {
        if (!LOGGING_ENABLED) return 'Логирование отключено';
        try {
            const content = fs.readFileSync(logFile, 'utf-8');
            const logLines = content.split('\n').filter((l) => l);
            return logLines.slice(-lines).join('\n');
        } catch (err) {
            return `Ошибка при чтении логов: ${err.message}`;
        }
    },
};

module.exports = logger;
