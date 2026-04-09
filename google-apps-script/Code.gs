// v1.17 - 2026-04-08 11:10 AM ET
// Anti-spam hardening update:
// - honeypot field check
// - minimum form fill time check
// - short burst rate limiting
// - duplicate and repeated-pattern spam rejection
var QUEUE_SHEET_NAME = "Incoming";
var FINAL_SHEET_NAME = "Sheet1";
var MIN_FORM_FILL_MS = 2500;
var MAX_FORM_FILL_MS = 60 * 60 * 1000;
var MAX_POSTS_PER_10_SECONDS = 4;
var MAX_POSTS_PER_MINUTE = 12;
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
    var captchaAnswer = parseInt((e.parameter.captchaAnswer || "") + "", 10);
    var captchaFirst = parseInt((e.parameter.captchaFirst || "") + "", 10);
    var captchaSecond = parseInt((e.parameter.captchaSecond || "") + "", 10);
    var captchaOperator = ((e.parameter.captchaOperator || "") + "").trim();
    var website = ((e.parameter.website || "") + "").trim();
    var formFilledMs = parseInt((e.parameter.formFilledMs || "") + "", 10);
    var requestId = ((e.parameter.requestId || "") + "").trim();
    var expectedCaptchaAnswer;
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

    if (captchaOperator === "+") {
      expectedCaptchaAnswer = captchaFirst + captchaSecond;
    } else if (captchaOperator === "-") {
      expectedCaptchaAnswer = captchaFirst - captchaSecond;
    } else if (captchaOperator === "x") {
      expectedCaptchaAnswer = captchaFirst * captchaSecond;
    }

    if (
      isNaN(captchaAnswer) ||
      isNaN(captchaFirst) ||
      isNaN(captchaSecond) ||
      (expectedCaptchaAnswer !== 0 && !expectedCaptchaAnswer) ||
      captchaAnswer !== expectedCaptchaAnswer
    ) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Captcha answer is invalid."
      });
    }

    if (looksLikeSpam_(comment)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Comment looks like spam."
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

  if (!text) {
    return true;
  }

  if (/(.)\1{24,}/.test(text)) {
    return true;
  }

  if (/(\b\w+\b)(?:\s+\1){7,}/i.test(text)) {
    return true;
  }

  if (text.length >= 80 && countUniqueChars_(text.replace(/\s+/g, "")) <= 3) {
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
  var safePayload = JSON.stringify({
    source: "repocomment-form",
    success: !!payload.success,
    message: payload.message || "",
    requestId: payload.requestId || ""
  }).replace(/</g, "\\u003c");

  return HtmlService
    .createHtmlOutput(
      '<!DOCTYPE html><html><body><script>' +
      "window.top.postMessage(" + safePayload + ', "*");' +
      "</script></body></html>"
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
