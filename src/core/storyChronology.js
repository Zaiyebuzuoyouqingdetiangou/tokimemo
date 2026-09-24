// Presentation/request order only. Do not rewrite stored IDs, dates or progress.
// Missing years, relative dates and incomparable calendars stay in their slots.
function positiveInteger(value) {
    if (/^\d+$/u.test(value)) {
        const number = Number(value);
        return Number.isSafeInteger(number) && number > 0 ? number : null;
    }
    if (value === '元') return 1;
    const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (/^[零〇一二三四五六七八九]+$/u.test(value)) {
        const number = Number([...value].map(char => digits[char]).join(''));
        return Number.isSafeInteger(number) && number > 0 ? number : null;
    }
    const units = { 十: 10, 百: 100, 千: 1000 };
    let total = 0, digit = 0, lastUnit = Infinity;
    for (const char of value) {
        if (Object.hasOwn(digits, char)) { digit = digits[char]; continue; }
        const unit = units[char];
        if (!unit || unit >= lastUnit) return null;
        total += (digit || 1) * unit;
        digit = 0;
        lastUnit = unit;
    }
    const result = total + digit;
    return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function comparableStoryDate(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    const numeric = /^(\d{4,})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/u.exec(text)
        || /^(\d{4,})年(\d{1,2})月(\d{1,2})日?$/u.exec(text);
    if (numeric) {
        const [year, month, day] = numeric.slice(1).map(positiveInteger);
        if (!year || !month || !day || month > 12) return null;
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        if (day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]) return null;
        return { calendar: 'gregorian', parts: [year, month, day] };
    }
    // A named fictional/historical calendar is comparable only with itself.
    // Month-only era dates keep year/month precision so they still sort in-era.
    const era = /^([^\d年月日]+?)([零〇一二三四五六七八九十百千两元\d]+)年([零〇一二三四五六七八九十两元\d]+)月(?:初)?([零〇一二三四五六七八九十两\d]+)?日?$/u.exec(text);
    if (!era) return null;
    const year = positiveInteger(era[2]);
    const month = positiveInteger(era[3]);
    const day = era[4] ? positiveInteger(era[4]) : 0;
    if (!year || !month) return null;
    return { calendar: `era:${era[1].trim()}`, parts: [year, month, day || 0] };
}

export function sortByStoryDate(items) {
    const result = Array.isArray(items) ? [...items] : [];
    const calendars = new Map();
    result.forEach((item, index) => {
        const date = comparableStoryDate(item?.date);
        if (!date) return;
        if (!calendars.has(date.calendar)) calendars.set(date.calendar, []);
        calendars.get(date.calendar).push({ item, index, parts: date.parts });
    });
    for (const rows of calendars.values()) {
        const sorted = [...rows].sort((left, right) => left.parts[0] - right.parts[0]
            || left.parts[1] - right.parts[1] || left.parts[2] - right.parts[2] || left.index - right.index);
        rows.forEach((row, index) => { result[row.index] = sorted[index].item; });
    }
    return result;
}
