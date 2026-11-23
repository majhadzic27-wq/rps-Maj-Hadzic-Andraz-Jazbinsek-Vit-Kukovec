/**
 * auth.js - logika za login.html in register.html
 */
(function () {
  "use strict";

  const API_BASE = "api/";

  function apiRequest(path, options) {
    return fetch(API_BASE + path, Object.assign({
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    }, options))
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            throw new Error(data.error || "Napaka strežnika (" + res.status + ").");
          }
          return data;
        });
      });
  }

  function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function hideError(el) {
    el.hidden = true;
    el.textContent = "";
  }

  // ---------- Prijava ----------
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const errorEl = document.getElementById("loginError");
    const submitBtn = document.getElementById("loginSubmit");

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      hideError(errorEl);

      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;

      if (!username || !password) {
        showError(errorEl, "Vnesite uporabniško ime in geslo.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Prijavljanje ...";

      apiRequest("login.php", {
        method: "POST",
        body: JSON.stringify({ username: username, password: password }),
      }).then(function () {
        window.location.href = "index.html";
      }).catch(function (err) {
        showError(errorEl, err.message);
      }).finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Prijava";
      });
    });
  }

  // ---------- Registracija ----------
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    const errorEl = document.getElementById("registerError");
    const submitBtn = document.getElementById("registerSubmit");

    registerForm.addEventListener("submit", function (e) {
      e.preventDefault();
      hideError(errorEl);

      const username = document.getElementById("regUsername").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;
      const password2 = document.getElementById("regPassword2").value;

      if (!username || !email || !password || !password2) {
        showError(errorEl, "Izpolnite vsa polja.");
        return;
      }
      if (password.length < 8) {
        showError(errorEl, "Geslo mora imeti vsaj 8 znakov.");
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        showError(errorEl, "Geslo mora vsebovati vsaj eno črko in vsaj eno številko.");
        return;
      }
      if (password !== password2) {
        showError(errorEl, "Gesli se ne ujemata.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Ustvarjanje računa ...";

      apiRequest("register.php", {
        method: "POST",
        body: JSON.stringify({ username: username, email: email, password: password }),
      }).then(function () {
        window.location.href = "index.html";
      }).catch(function (err) {
        showError(errorEl, err.message);
      }).finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Ustvari račun";
      });
    });
  }
})();
