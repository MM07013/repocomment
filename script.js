const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzIosPcw2sChEnVFVaTkayTpxcY3KIyG8j78yHA4-prR8rxfwWYNApGQQ9frz1sc98/exec";
const APP_VERSION = "v2.9 - 2026-04-30";
const MAX_COMMENT_LENGTH = 200;

const form = document.getElementById("entry-form");
const initialsInput = document.getElementById("initials");
const reasonInput = document.getElementById("reason");
const websiteInput = document.getElementById("website");
const statusText = document.getElementById("form-status");
const charCount = document.getElementById("char-count");
const submitButton = document.getElementById("submit-button");
const versionText = document.getElementById("app-version");
const flashIndicator = document.getElementById("flash-indicator");
const flashIcon = document.getElementById("flash-icon");
const flashText = document.getElementById("flash-text");

const initialsPattern = /^[A-Za-z]{2}$/;
let flashTimeoutId;
const formLoadedAt = Date.now();

function isLikelyIosSafari() {
  const ua = window.navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isWebKit = /WebKit/i.test(ua);
  const isOtherBrowserShell = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIos && isWebKit && !isOtherBrowserShell;
}

function postWithHiddenForm(payload) {
  return new Promise((resolve, reject) => {
    const requestId = `submit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const iframeName = `submit_target_${requestId}`;
    const iframe = document.createElement("iframe");
    const tempForm = document.createElement("form");
    const timeoutMs = 20000;

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
    }, timeoutMs);

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

function postWithNoCors(payload) {
  return fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    body: new URLSearchParams(payload)
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

  return (
    initialsPattern.test(initials) &&
    reason.length > 0 &&
    reason.length <= MAX_COMMENT_LENGTH
  );
}

function updateSubmitState() {
  const ready = isFormReady();
  submitButton.disabled = !ready;
  submitButton.classList.toggle("is-ready", ready);
}

function getTurnstileToken() {
  if (!window.turnstile || typeof window.turnstile.getResponse !== "function") {
    return "";
  }

  return window.turnstile.getResponse() || "";
}

initialsInput.addEventListener("input", () => {
  initialsInput.value = sanitizeInitials(initialsInput.value);
  updateSubmitState();
});

reasonInput.addEventListener("input", syncCommentLength);
reasonInput.addEventListener("input", updateSubmitState);

versionText.textContent = APP_VERSION;
syncCommentLength();
updateSubmitState();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const initials = sanitizeInitials(initialsInput.value.trim());
  const reason = reasonInput.value.trim().slice(0, MAX_COMMENT_LENGTH);
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

  if (website) {
    setStatus("Could not save right now.", "error");
    showFlash("error", "Not saved");
    return;
  }

  if (!getTurnstileToken()) {
    setStatus("Please complete the security check.", "error");
    showFlash("error", "Check required");
    return;
  }

  submitButton.disabled = true;
  setStatus("Saving your entry...");

  try {
    const payload = {
      initials,
      reason,
      website,
      formFilledMs: String(formFilledMs),
      turnstileToken: getTurnstileToken()
    };

    if (isLikelyIosSafari()) {
      await postWithNoCors(payload);
    } else {
      await postWithHiddenForm(payload);
    }

    if (isLikelyIosSafari()) {
      setStatus("Submitted. Please check the sheet in a moment.", "success");
    } else {
      setStatus("Thank you for your submission.", "success");
    }
    showFlash("success", "Saved");
    form.reset();
    syncCommentLength();
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      window.turnstile.reset();
    }
    updateSubmitState();
    initialsInput.focus();
  } catch (error) {
    setStatus(error.message || "Could not save right now.", "error");
    showFlash("error", "Not saved");
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      window.turnstile.reset();
    }
    console.error(error);
  } finally {
    updateSubmitState();
  }
});
