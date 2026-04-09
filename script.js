const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzhQA4vGm-GUmG5up12ruF58krwrdyEA1jgQ2_R6-25YQB5Hk-BX24IvtsmtLXSSNkK/exec";
const APP_VERSION = "v2.0 - 2026-04-05";
const MAX_COMMENT_LENGTH = 200;

const form = document.getElementById("entry-form");
const initialsInput = document.getElementById("initials");
const reasonInput = document.getElementById("reason");
const captchaInput = document.getElementById("captcha");
const websiteInput = document.getElementById("website");
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
const formLoadedAt = Date.now();

function createCaptcha() {
  const operators = ["+", "-", "x"];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let first = Math.floor(Math.random() * 9) + 1;
  let second = Math.floor(Math.random() * 9) + 1;
  let answer;

  if (operator === "-") {
    if (second > first) {
      const temp = first;
      first = second;
      second = temp;
    }
    answer = first - second;
  } else if (operator === "x") {
    answer = first * second;
  } else {
    answer = first + second;
  }

  return {
    first,
    second,
    operator,
    answer
  };
}

function renderCaptcha() {
  captchaQuestion.textContent = `${captchaValues.first} ${captchaValues.operator} ${captchaValues.second} = ?`;
}

function postWithHiddenForm(payload) {
  return new Promise((resolve, reject) => {
    const requestId = `submit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframeName = `submit_target_${requestId}`;
    const iframe = document.createElement("iframe");
    const tempForm = document.createElement("form");

    function cleanup() {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeoutId);
      tempForm.remove();
      iframe.remove();
    }

    function handleMessage(event) {
      const data = event.data;

      if (!data || data.source !== "repocomment-form" || data.requestId !== requestId) {
        return;
      }

      cleanup();

      if (data.success) {
        resolve(data);
      } else {
        reject(new Error(data.message || "Could not save right now."));
      }
    }

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Could not confirm the save. Please try again."));
    }, 10000);

    iframe.name = iframeName;
    iframe.style.display = "none";

    tempForm.method = "POST";
    tempForm.action = SCRIPT_URL;
    tempForm.target = iframeName;
    tempForm.style.display = "none";

    Object.entries({
      ...payload,
      requestId
    }).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      tempForm.appendChild(input);
    });

    window.addEventListener("message", handleMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(tempForm);
    tempForm.submit();
  });
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
  flashIcon.innerHTML = type === "success" ? "&#10003;" : "&#10005;";
  flashText.textContent = message;

  flashTimeoutId = window.setTimeout(() => {
    flashIndicator.className = "flash-indicator";
    flashIndicator.setAttribute("aria-hidden", "true");
  }, 1500);
}

function sanitizeInitials(value) {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2);
}

function syncCommentLength() {
  reasonInput.value = reasonInput.value.slice(0, MAX_COMMENT_LENGTH);
  charCount.textContent = `${reasonInput.value.length} / ${MAX_COMMENT_LENGTH}`;
}

function isFormReady() {
  const initials = sanitizeInitials(initialsInput.value.trim());
  const reason = reasonInput.value.trim();
  const captchaAnswer = captchaInput.value.trim();

  return (
    initialsPattern.test(initials) &&
    reason.length > 0 &&
    reason.length <= MAX_COMMENT_LENGTH &&
    captchaAnswer !== "" &&
    Number(captchaAnswer) === captchaValues.answer
  );
}

function updateSubmitState() {
  const ready = isFormReady();
  submitButton.disabled = !ready;
  submitButton.classList.toggle("is-ready", ready);
}

initialsInput.addEventListener("input", () => {
  initialsInput.value = sanitizeInitials(initialsInput.value);
  updateSubmitState();
});

reasonInput.addEventListener("input", syncCommentLength);
reasonInput.addEventListener("input", updateSubmitState);
captchaInput.addEventListener("input", updateSubmitState);

versionText.textContent = APP_VERSION;
syncCommentLength();
renderCaptcha();
updateSubmitState();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const initials = sanitizeInitials(initialsInput.value.trim());
  const reason = reasonInput.value.trim().slice(0, MAX_COMMENT_LENGTH);
  const captchaAnswer = captchaInput.value.trim();
  const website = websiteInput.value.trim();
  const formFilledMs = Date.now() - formLoadedAt;

  initialsInput.value = initials;
  reasonInput.value = reason;
  syncCommentLength();

  if (!initialsPattern.test(initials)) {
    setStatus("Please enter exactly 2 letters for initials.", "error");
    initialsInput.focus();
    return;
  }

  if (!reason) {
    setStatus("Please enter a comment.", "error");
    reasonInput.focus();
    return;
  }

  if (Number(captchaAnswer) !== captchaValues.answer) {
    setStatus("Captcha answer is not correct. Please try again.", "error");
    showFlash("error", "Wrong captcha");
    captchaValues = createCaptcha();
    renderCaptcha();
    captchaInput.value = "";
    updateSubmitState();
    captchaInput.focus();
    return;
  }

  if (website) {
    setStatus("Could not save right now.", "error");
    showFlash("error", "Not saved");
    return;
  }

  submitButton.disabled = true;
  setStatus("Saving your entry...");

  try {
    await postWithHiddenForm({
      initials,
      reason,
      captchaAnswer,
      captchaFirst: String(captchaValues.first),
      captchaSecond: String(captchaValues.second),
      captchaOperator: captchaValues.operator,
      website,
      formFilledMs: String(formFilledMs)
    });

    setStatus("Thank you for your submission.", "success");
    showFlash("success", "Saved");
    form.reset();
    syncCommentLength();
    captchaValues = createCaptcha();
    renderCaptcha();
    updateSubmitState();
    initialsInput.focus();
  } catch (error) {
    setStatus(error.message || "Could not save right now.", "error");
    showFlash("error", "Not saved");
    console.error(error);
  } finally {
    updateSubmitState();
  }
});
