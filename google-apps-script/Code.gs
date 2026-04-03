function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var initials = ((e.parameter.initials || "") + "").trim().toUpperCase();
    var reason = ((e.parameter.reason || "") + "").trim();
    var captchaAnswer = parseInt((e.parameter.captchaAnswer || "") + "", 10);
    var captchaFirst = parseInt((e.parameter.captchaFirst || "") + "", 10);
    var captchaSecond = parseInt((e.parameter.captchaSecond || "") + "", 10);
    var captchaOperator = ((e.parameter.captchaOperator || "") + "").trim();
    var expectedCaptchaAnswer;

    if (!/^[A-Z]{2}$/.test(initials)) {
      return jsonResponse_({
        success: false,
        message: "Initials must be exactly 2 letters."
      });
    }

    if (!reason || reason.length > 200) {
      return jsonResponse_({
        success: false,
        message: "Reason must be between 1 and 200 characters."
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
      !expectedCaptchaAnswer && expectedCaptchaAnswer !== 0 ||
      captchaAnswer !== expectedCaptchaAnswer
    ) {
      return jsonResponse_({
        success: false,
        message: "Captcha answer is invalid."
      });
    }

    sheet.appendRow([
      new Date(),
      initials,
      reason
    ]);

    return jsonResponse_({
      success: true,
      message: "Saved successfully."
    });
  } catch (error) {
    return jsonResponse_({
      success: false,
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
