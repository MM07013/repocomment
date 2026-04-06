function processSaveCommentAlerts() {
  const SHEET_NAME = 'Sheet1';
  const EMAIL_TO = 'nikunj715@gmail.com';
  const EMAIL_SUBJECT = 'ALERT FROM SAVECOMMENT';
  const START_ROW = 2;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found.`);

  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) return;

  const headers = sheet.getRange(1, 1, 1, 4).getValues()[0];
  const values = sheet.getRange(START_ROW, 1, lastRow - START_ROW + 1, 4).getValues();

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = Utilities.formatDate(today, tz, 'yyyy-MM-dd');

  const alertDatesToWrite = [];
  const rowsToEmail = [];

  for (let i = 0; i < values.length; i++) {
    const colA = values[i][0];
    const colB = values[i][1];
    const colC = values[i][2];
    const existingColD = values[i][3];

    let alertDate = '';
    let matchedRealPattern = false;

    if (typeof colC === 'string' && colC.trim() !== '') {
      const baseDate = parseBaseDate(colA);

      const relativeReminder = extractRelativeReminder(colC);
      if (baseDate && relativeReminder) {
        alertDate = buildRelativeReminderDate(baseDate, relativeReminder);
        matchedRealPattern = true;
      } else {
        const reminderDate = extractAbsoluteReminderDate(colC);
        if (reminderDate) {
          const oneDayBefore = new Date(
            reminderDate.getFullYear(),
            reminderDate.getMonth(),
            reminderDate.getDate(),
            reminderDate.getHours(),
            reminderDate.getMinutes(),
            0,
            0
          );
          oneDayBefore.setDate(oneDayBefore.getDate() - 1);
          alertDate = oneDayBefore;
          matchedRealPattern = true;
        }
      }

      if (!matchedRealPattern && containsReminderLanguage(colC)) {
        const existingDate = parseBaseDate(existingColD);

        if (!existingDate || existingDate <= today) {
          const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          tomorrow.setDate(tomorrow.getDate() + 1);
          alertDate = tomorrow;
        } else {
          alertDate = existingDate;
        }
      }
    }

    alertDatesToWrite.push([alertDate]);

    if (
      alertDate &&
      Object.prototype.toString.call(alertDate) === '[object Date]' &&
      !isNaN(alertDate.getTime())
    ) {
      const alertDateKey = Utilities.formatDate(alertDate, tz, 'yyyy-MM-dd');
      if (alertDateKey === todayKey) {
        rowsToEmail.push({
          a: colA,
          b: colB,
          c: colC
        });
      }
    }
  }

  sheet.getRange(START_ROW, 4, alertDatesToWrite.length, 1).setValues(alertDatesToWrite);
  sheet.getRange(START_ROW, 4, alertDatesToWrite.length, 1).setNumberFormat('dd-mmm-yyyy hh:mm AM/PM');

  if (rowsToEmail.length > 0) {
    const htmlBody = buildEmailTable(rowsToEmail, headers, tz, today);

    MailApp.sendEmail({
      to: EMAIL_TO,
      subject: EMAIL_SUBJECT,
      htmlBody: htmlBody
    });
  }
}

function extractRelativeReminder(text) {
  const s = String(text).trim();

  const numberWords = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12
  };

  let match = s.match(
    /\b(?:put\s+(?:a\s+)?reminder|remind(?:\s+me)?|alert(?:\s+me)?)\b[\s\S]*?\bday\s+after\s+tomorrow\b(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?/i
  );
  if (match) {
    return {
      kind: 'relative',
      amount: 2,
      unit: 'days',
      hour: match[1] ? parseInt(match[1], 10) : null,
      minute: match[2] ? parseInt(match[2], 10) : 0,
      ampm: match[3] ? match[3].toUpperCase() : null
    };
  }

  match = s.match(
    /\b(?:put\s+(?:a\s+)?reminder|remind(?:\s+me)?|alert(?:\s+me)?)\b[\s\S]*?\btomorrow\b(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?/i
  );
  if (match) {
    return {
      kind: 'tomorrow',
      amount: 1,
      unit: 'days',
      hour: match[1] ? parseInt(match[1], 10) : null,
      minute: match[2] ? parseInt(match[2], 10) : 0,
      ampm: match[3] ? match[3].toUpperCase() : null
    };
  }

  match = s.match(
    /\b(?:put\s+(?:a\s+)?reminder|remind(?:\s+me)?|alert(?:\s+me)?)\b[\s\S]*?\b(?:of|after|in|on)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months|year|years)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?\b/i
  );

  if (!match) return null;

  const rawAmount = match[1].toLowerCase();
  const amount = /^\d+$/.test(rawAmount) ? Number(rawAmount) : numberWords[rawAmount];

  if (!amount) return null;

  return {
    kind: 'relative',
    amount: amount,
    unit: match[2].toLowerCase(),
    hour: match[3] ? parseInt(match[3], 10) : null,
    minute: match[4] ? parseInt(match[4], 10) : 0,
    ampm: match[5] ? match[5].toUpperCase() : null
  };
}

function buildRelativeReminderDate(baseDate, reminder) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);

  if (reminder.kind === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else {
    switch (reminder.unit) {
      case 'day':
      case 'days':
        d.setDate(d.getDate() + reminder.amount);
        break;
      case 'week':
      case 'weeks':
        d.setDate(d.getDate() + reminder.amount * 7);
        break;
      case 'month':
      case 'months':
        d.setMonth(d.getMonth() + reminder.amount);
        break;
      case 'year':
      case 'years':
        d.setFullYear(d.getFullYear() + reminder.amount);
        break;
      default:
        return '';
    }
  }

  if (reminder.hour !== null && reminder.ampm) {
    const time = convertTo24Hour(reminder.hour, reminder.minute || 0, reminder.ampm);
    d.setHours(time.hour, time.minute, 0, 0);
  }

  return d;
}

function convertTo24Hour(hour12, minute, ampm) {
  let hour = hour12 % 12;
  if (ampm === 'PM') hour += 12;
  return { hour: hour, minute: minute };
}

function parseBaseDate(value) {
  if (!value) return null;

  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function extractAbsoluteReminderDate(text) {
  const cleanText = String(text).trim();

  const prefixMatch = cleanText.match(/remind\s+me\s+on\s+(.+)/i);
  if (!prefixMatch) return null;

  const remaining = normalizeDateText(prefixMatch[1]);

  const patterns = [
    /^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}|\d{2}))?/i,
    /^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}|\d{2}))?/i,
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/,
    /^(\d{1,2})[\/\-](\d{1,2})/
  ];

  for (let i = 0; i < remaining.length; i++) {
    const candidate = remaining.substring(i).trimStart();

    for (const pattern of patterns) {
      const m = candidate.match(pattern);
      if (!m) continue;

      const matchedText = m[0];
      const parsed = parseFlexibleDate(matchedText);
      if (parsed) return parsed;
    }
  }

  return null;
}

function normalizeDateText(dateText) {
  let s = dateText.trim();
  s = s.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
  s = s.replace(/\bof\b/gi, ' ');
  s = s.replace(/,/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function parseFlexibleDate(dateText) {
  const currentYear = new Date().getFullYear();
  let m;

  m = dateText.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return buildValidDate(+m[1], +m[2], +m[3]);

  m = dateText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return buildValidDate(+m[3], +m[1], +m[2]);

  m = dateText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) {
    const yy = +m[3];
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return buildValidDate(year, +m[1], +m[2]);
  }

  m = dateText.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return buildValidDate(currentYear, +m[1], +m[2]);

  m = parseMonthNameDate(dateText);
  if (m) return m;

  m = parseDayMonthNameDate(dateText);
  if (m) return m;

  return null;
}

function parseMonthNameDate(dateText) {
  const currentYear = new Date().getFullYear();
  const monthMap = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12
  };

  const m = dateText.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{4}|\d{2}))?$/i);
  if (!m) return null;

  const month = monthMap[m[1].toLowerCase()];
  if (!month) return null;

  const day = +m[2];
  let year = currentYear;
  if (m[3]) year = normalizeYear(m[3]);

  return buildValidDate(year, month, day);
}

function parseDayMonthNameDate(dateText) {
  const currentYear = new Date().getFullYear();
  const monthMap = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12
  };

  const m = dateText.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}|\d{2}))?$/i);
  if (!m) return null;

  const day = +m[1];
  const month = monthMap[m[2].toLowerCase()];
  if (!month) return null;

  let year = currentYear;
  if (m[3]) year = normalizeYear(m[3]);

  return buildValidDate(year, month, day);
}

function normalizeYear(yearText) {
  const y = +yearText;
  if (String(yearText).length === 2) {
    return y >= 70 ? 1900 + y : 2000 + y;
  }
  return y;
}

function buildValidDate(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function containsReminderLanguage(text) {
  return /\b(remind|alert)\b/i.test(String(text));
}

function buildEmailTable(rows, headers, tz, today) {
  const todayFormatted = Utilities.formatDate(today, tz, 'dd-MMM-yyyy');

  const headerA = headers[0] || 'Column A';
  const headerB = headers[1] || 'Column B';
  const headerC = headers[2] || 'Column C';

  let html = `
    <p><b>ALERT FROM SAVECOMMENT</b></p>
    <p>Alert date: ${todayFormatted}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      <tr>
        <th>${escapeHtml(headerA)}</th>
        <th>${escapeHtml(headerB)}</th>
        <th>${escapeHtml(headerC)}</th>
      </tr>
  `;

  rows.forEach(r => {
    html += `
      <tr>
        <td>${escapeHtml(formatCellForEmail(r.a, tz))}</td>
        <td>${escapeHtml(formatCellForEmail(r.b, tz))}</td>
        <td>${escapeHtml(formatCellForEmail(r.c, tz))}</td>
      </tr>
    `;
  });

  html += `</table>`;
  return html;
}

function formatCellForEmail(value, tz) {
  if (value === null || value === undefined) return '';
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(value, tz, 'dd-MMM-yyyy hh:mm a');
  }
  return String(value);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
