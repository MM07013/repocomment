const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxmSLZgm2L_3ktoRFpNak3ZQTvo5xr4O1TzIv9x6PCYFy6RTZhfjjSRB7xN_3w5HVEC/exec";

const form = document.getElementById("entry-form");
const initialsInput = document.getElementById("initials");
const reasonInput = document.getElementById("reason");
const statusText = document.getElementById("form-status");
const charCount = document.getElementById("char-count");
const submitButton = document.getElementById("submit-button");

const initialsPattern = /^[A-Za-z]{2}$/;

function setStatus(message, type = "") {
  statusText.textContent = message;
  statusText.className = type ? `status ${type}` : "status";
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const initials = sanitizeInitials(initialsInput.value.trim());
  const reason = reasonInput.value.trim();

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

  submitButton.disabled = true;
  setStatus("Saving your entry...");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({
        initials,
        reason
      })
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    setStatus("Saved successfully.", "success");
    form.reset();
    charCount.textContent = "0 / 200";
    initialsInput.focus();
  } catch (error) {
    setStatus("Could not save right now. Please check the Apps Script deployment settings.", "error");
    console.error(error);
  } finally {
    submitButton.disabled = false;
  }
});
