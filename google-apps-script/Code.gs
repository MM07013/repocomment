function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var initials = ((e.parameter.initials || "") + "").trim().toUpperCase();
    var reason = ((e.parameter.reason || "") + "").trim();

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
