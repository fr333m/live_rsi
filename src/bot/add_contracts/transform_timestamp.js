// Функция 1: Базовый формат (дата и время)
function formatTimestamp(timestamp) {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('ru-RU');
}

// Функция 2: Кастомный формат (дата)
    function formatDateOnly(timestamp) {
        const date = new Date(timestamp);
    return date.toLocaleDateString('ru-RU');
}

// Функция 3: Полный формат с временем
function formatFullDateTime(timestamp) {
    const date = new Date(timestamp);
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Stockholm' // Ваш часовой пояс
    };
    return date.toLocaleString('ru-RU', options);
}

// Функция 4: Краткий формат (DD.MM.YYYY HH:mm)
function formatShort(timestamp) {
    const date = new Date(parseInt(timestamp));
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Функция 5: ISO формат
function formatISO(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString();
}

// Примеры использования:
const timestamp = 1776945600000;

console.log('Базовый формат:', formatTimestamp(timestamp));
// Базовый формат: 28.04.2026 00:00:00

console.log('Только дата:', formatDateOnly(timestamp));
// Только дата: 28.04.2026

console.log('Полный формат:', formatFullDateTime(timestamp));
// Полный формат: 28 апреля 2026 г., 00:00:00

console.log('Краткий формат:', formatShort(timestamp));
// Краткий формат: 28.04.2026 00:00

console.log('ISO формат:', formatISO(timestamp));
// ISO формат: 2026-04-28T00:00:00.000Z

module.exports = {
    formatTimestamp,
    formatDateOnly,
    formatFullDateTime,
    formatShort,
    formatISO
}