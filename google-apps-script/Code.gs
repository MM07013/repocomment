function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var initials = ((e.parameter.initials || "") + "").trim().toUpperCase();
    var reason = ((e.parameter.reason || "") + "").trim();
    var captchaAnswer = parseInt((e.parameter.captchaAnswer || "") + "", 10);
    var captchaFirst = parseInt((e.parameter.captchaFirst || "") + "", 10);
    var captchaSecond = parseInt((e.parameter.captchaSecond || "") + "", 10);
    var captchaOperator = ((e.parameter.captchaOperator || "") + "").trim();
    var requestId = ((e.parameter.requestId || "") + "").trim();
    var expectedCaptchaAnswer;

    if (!/^[A-Z]{2}$/.test(initials)) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Initials must be exactly 2 letters."
      });
    }

    reason = reason.substring(0, 200);

    if (!reason) {
      return submitResponse_({
        success: false,
        requestId: requestId,
        message: "Please enter a comment."
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

    sheet.appendRow([
      new Date(),
      initials,
      reason
    ]);

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

function doGet() {
  return jsonResponse_({
    success: true,
    message: "Apps Script is running."
  });
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
