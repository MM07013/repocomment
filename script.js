const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhQA4vGm-GUmG5up12ruF58krwrdyEA1jgQ2_R6-25YQB5Hk-BX24IvtsmtLXSSNkK/exec";
const APP_VERSION = "v1.9 - 2026-04-02 12:16 AM ET";

const form = document.getElementById("entry-form");
const initialsInput = document.getElementById("initials");
const reasonInput = document.getElementById("reason");
const captchaInput = document.getElementById("captcha");
const captchaQuestion = document.getElementById("captcha-question");
const statusText = document.getElementById("form-status");
const charCount = document.getElementById("char-count");
const submitButton = document.getElementById("submit-button");
const versionText = document.getElementById("app-version");
const flashIndicator = document.getElementById("flash-indicator");
const flashIcon = document.getElementById("flash-icon");
const flashText = document.getElementById("flash-text");

const initialsPattern = /^[A-Za-z]{2}$/;
let captchaValues = createCaptcha();
let flashTimeoutId;

function createCaptcha() {
  const first = Math.floor(Math.random() * 9) + 1;
  const second = Math.floor(Math.random() * 9) + 1;
  return {
    first,
    second,
    answer: first + second
  };
}

function renderCaptcha() {
  captchaQuestion.textContent = `${captchaValues.first} + ${captchaValues.second} = ?`;
}

function postWithHiddenForm(payload) {
  const iframeName = `submit_target_${Date.now()}`;
  const iframe = document.createElement("iframe");
  iframe.name = iframeName;
  iframe.style.display = "none";

  const tempForm = document.createElement("form");
  tempForm.method = "POST";
  tempForm.action = SCRIPT_URL;
  tempForm.target = iframeName;
  tempForm.style.display = "none";

  Object.entries(payload).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    tempForm.appendChild(input);
  });

  document.body.appendChild(iframe);
  document.body.appendChild(tempForm);
  tempForm.submit();

  window.setTimeout(() => {
    tempForm.remove();
    iframe.remove();
  }, 5000);
}

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = type ? `status ${type}` : "status";
}

function showFlash(type, message) {
  if (flashTimeoutId) {
    window.clearTimeout(flashTimeoutId);
  }

  flashIndicator.className = `flash-indicator ${type} visible`;
  flashIndicator.setAttribute("aria-hidden", "false");
  flashIcon.textContent = type === "success" ? "✓" : "✕";
  flashText.textContent = message;

  flashTimeoutId = window.setTimeout(() => {
    flashIndicator.className = "flash-indicator";
    flashIndicator.setAttribute("aria-hidden", "true");
  }, 1500);
}

function sanitizeInitials(value) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
}

initialsInput.addEventListener("input", () => {
  initialsInput.value = sanitizeInitials(initialsInput.value);
});

reasonInput.addEventListener("input", () => {
  charCount.textContent = `${reasonInput.value.length} / 200`;
});

versionText.textContent = APP_VERSION;
renderCaptcha();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const initials = sanitizeInitials(initialsInput.value.trim());
  const reason = reasonInput.value.trim();
  const captchaAnswer = captchaInput.value.trim();

  initialsInput.value = initials;

  if (!initialsPattern.test(initials)) {
    setStatus("Please enter exactly 2 letters for initials.", "error");
    initialsInput.focus();
    return;
  }

  if (!reason) {
    setStatus("Please enter a reason.", "error");
    reasonInput.focus();
    return;
  }

  if (reason.length > 200) {
    setStatus("Reason must be 200 characters or fewer.", "error");
    reasonInput.focus();
    return;
  }

  if (Number(captchaAnswer) !== captchaValues.answer) {
    setStatus("Captcha answer is not correct. Please try again.", "error");
    showFlash("error", "Wrong captcha");
    captchaValues = createCaptcha();
    renderCaptcha();
    captchaInput.value = "";
    captchaInput.focus();
    return;
  }

  submitButton.disabled = true;
  setStatus("Saving your entry...");

  try {
    postWithHiddenForm({
      initials,
      reason,
      captchaAnswer,
      captchaFirst: String(captchaValues.first),
      captchaSecond: String(captchaValues.second)
    });

    setStatus("Thank you for your submission.", "success");
    showFlash("success", "Saved");
    form.reset();
    charCount.textContent = "0 / 200";
    captchaValues = createCaptcha();
    renderCaptcha();
    initialsInput.focus();
  } catch (error) {
    setStatus("Could not save right now. Please check the Apps Script deployment settings.", "error");
    showFlash("error", "Not saved");
    console.error(error);
  } finally {
    submitButton.disabled = false;
  }
});
