// v1.15 - 2026-04-04 12:15 PM ET
var QUEUE_SHEET_NAME = "Incoming";
var FINAL_SHEET_NAME = "Sheet1";
var EVENT_MODE = false;
var EVENT_CODE = "";
var EVENT_START = "";
var EVENT_END = "";
// Example party config:
// var EVENT_MODE = true;
// var EVENT_CODE = "PARTY2026";
// var EVENT_START = "2026-04-20T18:00:00";
// var EVENT_END = "2026-04-20T22:00:00";
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
    var eventCode = ((e.parameter.eventCode || "") + "").trim();
    var captchaAnswer = parseInt((e.parameter.captchaAnswer || "") + "", 10);
    var captchaFirst = parseInt((e.parameter.captchaFirst || "") + "", 10);
    var captchaSecond = parseInt((e.parameter.captchaSecond || "") + "", 10);
    var captchaOperator = ((e.parameter.captchaOperator || "") + "").trim();
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

    if (!isEventAccessAllowed_(eventCode)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Event access is not available right now."
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

function isEventAccessAllowed_(eventCode) {
  var now = new Date();
  var start = parseEventDate_(EVENT_START);
  var finish = parseEventDate_(EVENT_END);

  if (!EVENT_MODE) {
    return true;
  }

  if (!EVENT_CODE || eventCode !== EVENT_CODE) {
    return false;
  }

  if (start && now < start) {
    return false;
  }

  if (finish && now > finish) {
    return false;
  }

  return true;
}

function parseEventDate_(value) {
  if (!value) {
    return null;
  }

  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function doGet(e) {
  if (((e && e.parameter && e.parameter.mode) || "") === "config") {
    return jsonResponse_({
      eventMode: EVENT_MODE
    });
  }

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
