// Single place to change if your API runs somewhere else.
const API_BASE_URL = "http://127.0.0.1:8000";
const PREDICT_ENDPOINT = `${API_BASE_URL}/predict`;

const form = document.getElementById("loan-form");
const submitBtn = document.getElementById("submit-btn");
const formError = document.getElementById("form-error");

const stateEmpty = document.getElementById("state-empty");
const stateError = document.getElementById("state-error");
const stateResult = document.getElementById("state-result");

const errorMessageEl = document.getElementById("error-message");
const errorHintEl = document.getElementById("error-hint");

// Fields and how to coerce each one before sending to FastAPI.
const FIELD_TYPES = {
  person_age: "int",
  person_income: "float",
  person_home_ownership: "str",
  person_emp_length: "float",
  loan_intent: "str",
  loan_grade: "str",
  loan_amnt: "float",
  loan_int_rate: "float",
  loan_percent_income: "float",
  cb_person_default_on_file: "str",
  cb_person_cred_hist_length: "int",
};

function clearFieldErrors() {
  document.querySelectorAll(".field__error").forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".field input, .field select").forEach((el) =>
    el.classList.remove("invalid")
  );
  formError.textContent = "";
}

function setFieldError(name, message) {
  const el = document.querySelector(`[data-error-for="${name}"]`);
  const input = document.getElementById(name);
  if (el) el.textContent = message;
  if (input) input.classList.add("invalid");
}

// Client-side validation mirroring the FastAPI Pydantic model's expectations.
function validateAndCollect() {
  clearFieldErrors();
  const formData = new FormData(form);
  const payload = {};
  let firstInvalid = null;

  for (const [name, kind] of Object.entries(FIELD_TYPES)) {
    const raw = (formData.get(name) || "").toString().trim();

    if (raw === "") {
      setFieldError(name, "Required.");
      firstInvalid = firstInvalid || name;
      continue;
    }

    if (kind === "int" || kind === "float") {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        setFieldError(name, "Enter a valid number.");
        firstInvalid = firstInvalid || name;
        continue;
      }
      if (kind === "int" && !Number.isInteger(num)) {
        setFieldError(name, "Enter a whole number.");
        firstInvalid = firstInvalid || name;
        continue;
      }
      if (name === "loan_percent_income" && (num < 0 || num > 1)) {
        setFieldError(name, "Enter a value between 0 and 1.");
        firstInvalid = firstInvalid || name;
        continue;
      }
      if (num < 0) {
        setFieldError(name, "Must be zero or greater.");
        firstInvalid = firstInvalid || name;
        continue;
      }
      payload[name] = num;
    } else {
      payload[name] = raw;
    }
  }

  if (firstInvalid) {
    formError.textContent = "Fix the highlighted fields before submitting.";
    document.getElementById(firstInvalid).focus();
    return null;
  }

  return payload;
}

function showState(which) {
  stateEmpty.hidden = which !== "empty";
  stateError.hidden = which !== "error";
  stateResult.hidden = which !== "result";
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("is-loading", isLoading);
  submitBtn.querySelector(".submit-btn__label").textContent = isLoading
    ? "Assessing…"
    : "Assess risk";
}

function renderResult(data) {
  const probabilityPct = Math.round(data.default_probability * 1000) / 10; // one decimal
  const thresholdPct = Math.round(data.threshold * 1000) / 10;
  const isHighRisk = data.default_prediction === 1;

  document.getElementById("prob-value").textContent = probabilityPct.toFixed(1);
  document.getElementById("gauge-fill").style.width = `${Math.min(probabilityPct, 100)}%`;
  document.getElementById("gauge-fill").style.background = isHighRisk
    ? "var(--red)"
    : "var(--teal)";
  document.getElementById("gauge-threshold").style.left = `${Math.min(thresholdPct, 100)}%`;
  document.getElementById("threshold-label").textContent = `${thresholdPct}% threshold`;

  const badge = document.getElementById("verdict-badge");
  badge.classList.remove("is-low", "is-high");
  badge.classList.add(isHighRisk ? "is-high" : "is-low");
  document.getElementById("verdict-text").textContent =
    data.Result || (isHighRisk ? "High Risk" : "Low Risk");

  document.getElementById("out-prediction").textContent = isHighRisk
    ? "Likely to default"
    : "Not likely to default";
  document.getElementById("out-threshold").textContent = `${thresholdPct}%`;

  showState("result");
}

async function submitApplication(payload) {
  const response = await fetch(PREDICT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = null;
    try {
      const body = await response.json();
      detail = body.detail;
    } catch (_) {
      /* response wasn't JSON */
    }

    if (response.status === 422 && Array.isArray(detail)) {
      // FastAPI validation error shape: surface it on the right fields.
      detail.forEach((err) => {
        const field = err.loc && err.loc[err.loc.length - 1];
        if (field) setFieldError(field, err.msg);
      });
      throw new Error("The API rejected some of the values — check the form.");
    }

    throw new Error(
      typeof detail === "string"
        ? detail
        : `The API responded with status ${response.status}.`
    );
  }

  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = validateAndCollect();
  if (!payload) return;

  setLoading(true);

  try {
    const data = await submitApplication(payload);
    renderResult(data);
  } catch (err) {
    const isNetworkError = err instanceof TypeError;
    errorMessageEl.textContent = isNetworkError
      ? "Couldn't reach the API."
      : err.message;
    errorHintEl.textContent = isNetworkError
      ? `Make sure the FastAPI server is running and reachable at ${API_BASE_URL}.`
      : "";
    showState("error");
  } finally {
    setLoading(false);
  }
});
