function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var initials = ((e.parameter.initials || "") + "").trim().toUpperCase();
    var reason = ((e.parameter.reason || "") + "").trim();
    var captchaAnswer = parseInt((e.parameter.captchaAnswer || "") + "", 10);
    var captchaFirst = parseInt((e.parameter.captchaFirst || "") + "", 10);
    var captchaSecond = parseInt((e.parameter.captchaSecond || "") + "", 10);

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

    if (
      isNaN(captchaAnswer) ||
      isNaN(captchaFirst) ||
      isNaN(captchaSecond) ||
      captchaAnswer !== captchaFirst + captchaSecond
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
