// v1.18 - 2026-04-30 07:00 PM ET
// Anti-spam hardening update:
// - honeypot field check
// - Cloudflare Turnstile server-side validation
// - Turnstile hostname enforcement
// - minimum form fill time check
// - short burst rate limiting
// - duplicate and repeated-pattern spam rejection
// - stricter comment content filtering
// - math check removed
var QUEUE_SHEET_NAME = "Incoming";
var FINAL_SHEET_NAME = "Sheet1";
var MIN_FORM_FILL_MS = 2500;
var MAX_FORM_FILL_MS = 60 * 60 * 1000;
var MAX_POSTS_PER_10_SECONDS = 2;
var MAX_POSTS_PER_MINUTE = 6;
var TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var TURNSTILE_SECRET_PROPERTY = "TURNSTILE_SECRET_KEY";
var ALLOWED_TURNSTILE_HOSTNAMES = [
  "mm07013.github.io",
  "localhost",
  "127.0.0.1"
];
var QUEUE_HEADERS = [
  "Queued At",
  "Request Id",
  "Initials",
  "Comment",
  "Status",
  "Processed At",
  "Error"
];
var FINAL_HEADERS = [
  "Timestamp",
  "Initials",
  "Comment",
  "ALERT ON DATE"
];

function doPost(e) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var queueSheet = ensureSheet_(spreadsheet, QUEUE_SHEET_NAME, QUEUE_HEADERS);
    ensureSheet_(spreadsheet, FINAL_SHEET_NAME, FINAL_HEADERS);

    var initials = ((e.parameter.initials || "") + "").trim().toUpperCase();
    var comment = ((e.parameter.reason || "") + "").trim();
    var website = ((e.parameter.website || "") + "").trim();
    var formFilledMs = parseInt((e.parameter.formFilledMs || "") + "", 10);
    var turnstileToken = ((e.parameter.turnstileToken || "") + "").trim();
    var requestId = ((e.parameter.requestId || "") + "").trim();
    var turnstileResult;
    var lock = LockService.getDocumentLock();

    if (!/^[A-Z]{2}$/.test(initials)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Initials must be exactly 2 letters."
      });
    }

    comment = comment.substring(0, 200);

    if (!comment) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Please enter a comment."
      });
    }

    if (website) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Submission rejected."
      });
    }

    if (isNaN(formFilledMs) || formFilledMs < MIN_FORM_FILL_MS || formFilledMs > MAX_FORM_FILL_MS) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Please wait a moment and try again."
      });
    }

    if (looksLikeSpam_(comment)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Comment looks like spam."
      });
    }

    turnstileResult = verifyTurnstileToken_(turnstileToken, requestId);
    if (!turnstileResult.success || !isAllowedTurnstileHostname_(turnstileResult.hostname)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Security check failed. Please try again."
      });
    }

    if (!allowSubmission_(initials, comment)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Too many submissions right now. Please try again later."
      });
    }

    lock.waitLock(5000);

    try {
      queueSheet.appendRow([
        new Date(),
        requestId || Utilities.getUuid(),
        initials,
        comment,
        "QUEUED",
        "",
        ""
      ]);
    } finally {
      lock.releaseLock();
    }

    return submitResponse_({
      success: true,
      requestId: requestId,
      message: "Saved successfully."
    });
  } catch (error) {
    return submitResponse_({
      success: false,
      requestId: ((e && e.parameter && e.parameter.requestId) || "") + "",
      message: error.message
    });
  }
}

function processQueue() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var queueSheet = ensureSheet_(spreadsheet, QUEUE_SHEET_NAME, QUEUE_HEADERS);
  var finalSheet = ensureSheet_(spreadsheet, FINAL_SHEET_NAME, FINAL_HEADERS);
  var lock = LockService.getDocumentLock();
  var values;
  var finalRows = [];
  var processedRows = [];

  lock.waitLock(30000);

  try {
    if (queueSheet.getLastRow() <= 1) {
      return;
    }

    values = queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, QUEUE_HEADERS.length).getValues();

    values.forEach(function(row, index) {
      var queuedAt = row[0];
      var initials = row[2];
      var comment = row[3];
      var status = row[4];

      if (status && status !== "QUEUED") {
        return;
      }

      finalRows.push([
        queuedAt || new Date(),
        initials,
        comment
      ]);
      processedRows.push(index + 2);
    });

    if (!finalRows.length) {
      return;
    }

    finalSheet
      .getRange(finalSheet.getLastRow() + 1, 1, finalRows.length, 3)
      .setValues(finalRows);

    processedRows.forEach(function(rowNumber) {
      queueSheet.getRange(rowNumber, 5, 1, 3).setValues([[
        "PROCESSED",
        new Date(),
        ""
      ]]);
    });
  } finally {
    lock.releaseLock();
  }
}

function createQueueTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === "processQueue";
  });

  if (!exists) {
    ScriptApp.newTrigger("processQueue")
      .timeBased()
      .everyMinutes(1)
      .create();
  }
}

function verifyTurnstileToken_(token, requestId) {
  var secret = PropertiesService.getScriptProperties().getProperty(TURNSTILE_SECRET_PROPERTY);
  var response;
  var payload;

  if (!secret) {
    throw new Error("Missing Turnstile secret in Script Properties.");
  }

  if (!token) {
    return {
      success: false
    };
  }

  response = UrlFetchApp.fetch(TURNSTILE_VERIFY_URL, {
    method: "post",
    payload: {
      secret: secret,
      response: token,
      idempotency_key: requestId || Utilities.getUuid()
    },
    muteHttpExceptions: true
  });

  payload = JSON.parse(response.getContentText() || "{}");
  return {
    success: !!payload.success,
    hostname: ((payload.hostname || "") + "").toLowerCase(),
    errorCodes: payload["error-codes"] || []
  };
}

function isAllowedTurnstileHostname_(hostname) {
  return ALLOWED_TURNSTILE_HOSTNAMES.indexOf(((hostname || "") + "").toLowerCase()) !== -1;
}

function allowSubmission_(initials, comment) {
  var cache = CacheService.getScriptCache();
  var now = new Date();
  var tenSecondBucket = Utilities.formatDate(now, "UTC", "yyyyMMddHHmmss").slice(0, 13);
  var minuteBucket = Utilities.formatDate(now, "UTC", "yyyyMMddHHmm");
  var burstKey = "burst10:" + tenSecondBucket;
  var minuteKey = "burst60:" + minuteBucket;
  var fingerprint = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      (initials + "|" + normalizeComment_(comment)).slice(0, 500)
    )
  );
  var duplicateKey = "dup:" + fingerprint;
  var current10 = parseInt(cache.get(burstKey) || "0", 10);
  var current60 = parseInt(cache.get(minuteKey) || "0", 10);

  if (cache.get(duplicateKey)) {
    return false;
  }

  if (current10 >= MAX_POSTS_PER_10_SECONDS || current60 >= MAX_POSTS_PER_MINUTE) {
    return false;
  }

  cache.put(burstKey, String(current10 + 1), 15);
  cache.put(minuteKey, String(current60 + 1), 70);
  cache.put(duplicateKey, "1", 300);
  return true;
}

function normalizeComment_(comment) {
  return String(comment || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeSpam_(comment) {
  var text = normalizeComment_(comment);
  var compactText = text.replace(/\s+/g, "");
  var letters = (text.match(/[a-z]/gi) || []).length;
  var digits = (text.match(/[0-9]/g) || []).length;
  var safePunctuation = (text.match(/[.,!?:;'"()\/&@#%+\-_]/g) || []).length;
  var otherSymbols = Math.max(0, compactText.length - letters - digits - safePunctuation);

  if (!text) {
    return true;
  }

  if (/(.)\1{24,}/.test(text)) {
    return true;
  }

  if (/(\b\w+\b)(?:\s+\1){7,}/i.test(text)) {
    return true;
  }

  if (/([^a-z0-9\s])(?:\s*\1){7,}/i.test(text)) {
    return true;
  }

  if (text.length >= 80 && countUniqueChars_(compactText) <= 3) {
    return true;
  }

  if (compactText.length >= 20 && letters === 0 && digits === 0) {
    return true;
  }

  if (compactText.length >= 30 && otherSymbols > Math.floor(compactText.length * 0.35)) {
    return true;
  }

  if (!/^[\x20-\x7E\r\n\t]*$/.test(comment)) {
    return true;
  }

  return false;
}

function countUniqueChars_(text) {
  var map = {};

  for (var i = 0; i < text.length; i++) {
    map[text.charAt(i)] = true;
  }

  return Object.keys(map).length;
}

function doGet() {
  return jsonResponse_({
    success: true,
    message: "Apps Script is running."
  });
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var headerMismatch = headers.some(function(header, index) {
      return existingHeaders[index] !== header;
    });

    if (headerMismatch) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  return sheet;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function submitResponse_(payload) {
  var isSuccess = !!payload.success;
  var safeMessage = escapeHtml_(payload.message || (isSuccess ? "Saved successfully." : "Could not save right now."));
  var safeStatus = isSuccess ? "Saved" : "Not Saved";
  var accentColor = isSuccess ? "#17663d" : "#b33939";
  var safePayload = JSON.stringify({
    source: "repocomment-form",
    success: isSuccess,
    message: payload.message || "",
    requestId: payload.requestId || ""
  }).replace(/</g, "\\u003c");

  return HtmlService
    .createHtmlOutput(
      '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + safeStatus + '</title>' +
      '<style>' +
      'body{margin:0;font-family:Arial,sans-serif;background:#f6f4ee;color:#1f2a24;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;}' +
      '.card{max-width:420px;width:100%;background:#fff;border:1px solid rgba(31,42,36,.12);border-radius:20px;box-shadow:0 18px 40px rgba(31,42,36,.12);padding:24px;text-align:center;}' +
      '.badge{font-size:32px;font-weight:700;color:' + accentColor + ';margin:0 0 10px;}' +
      '.title{font-size:24px;font-weight:700;margin:0 0 8px;}' +
      '.message{font-size:16px;line-height:1.45;margin:0 0 16px;}' +
      '.hint{font-size:14px;color:#5d6b63;margin:0;}' +
      '</style></head><body><div class="card"><p class="badge">' + safeStatus + '</p>' +
      '<p class="title">' + safeMessage + '</p>' +
      '<p class="hint">You can close this tab and return to the form.</p></div>' +
      '<script>' +
      "if (window.opener) { window.opener.postMessage(" + safePayload + ', "*"); }' +
      "if (window.top && window.top !== window && window.top.postMessage) { window.top.postMessage(" + safePayload + ', "*"); }' +
      "window.setTimeout(function(){ try { window.close(); } catch (e) {} }, 300);" +
      "</script></body></html>"
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function escapeHtml_(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
