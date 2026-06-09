function formatTimestamp(timestamp) {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('ru-RU');
}

function formatDateOnly(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('ru-RU');
}

function formatFullDateTime(timestamp) {
    const date = new Date(timestamp);
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Stockholm',
    };
    return date.toLocaleString('ru-RU', options);
}

function formatShort(timestamp) {
    const date = new Date(parseInt(timestamp));
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatISO(timestamp) {
    return new Date(timestamp).toISOString();
}

module.exports = {
    formatTimestamp,
    formatDateOnly,
    formatFullDateTime,
    formatShort,
    formatISO,
};
