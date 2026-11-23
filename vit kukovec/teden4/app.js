/**
 * app.js - glavna logika aplikacije "Moji stroški"
 * Podatki se berejo/pišejo preko PHP REST API-ja (api/*.php), ki
 * jih shranjuje v MySQL bazo, ločeno za vsakega prijavljenega uporabnika.
 */
(function () {
  "use strict";

  const API_BASE = "api/";

  const EXPENSE_CATEGORIES = [
    { id: "hrana",         label: "Hrana in pijača",  icon: "🍔", color: "var(--cat-1)" },
    { id: "prevoz",        label: "Prevoz",           icon: "🚗", color: "var(--cat-2)" },
    { id: "stanovanje",    label: "Stanovanje",       icon: "🏠", color: "var(--cat-3)" },
    { id: "zabava",        label: "Zabava",           icon: "🎬", color: "var(--cat-4)" },
    { id: "zdravje",       label: "Zdravje",          icon: "💊", color: "var(--cat-5)" },
    { id: "obleka",        label: "Oblačila",         icon: "👕", color: "var(--cat-6)" },
    { id: "izobrazevanje", label: "Izobraževanje",    icon: "📚", color: "var(--cat-7)" },
    { id: "drugo",         label: "Drugo",            icon: "🔖", color: "var(--cat-8)" },
  ];
  const INCOME_CATEGORIES = [
    { id: "placa", label: "Plača",  icon: "💼", color: "var(--income-color)" },
    { id: "drugo", label: "Drugo",  icon: "💰", color: "var(--income-color)" },
  ];
  const ALL_CATEGORIES = EXPENSE_CATEGORIES.concat(
    INCOME_CATEGORIES.filter(function (c) { return !EXPENSE_CATEGORIES.some(function (e) { return e.id === c.id; }); })
  );

  const SLO_MONTHS_FULL = ["januar","februar","marec","april","maj","junij","julij","avgust","september","oktober","november","december"];

  function categoryById(id) {
    return ALL_CATEGORIES.find(function (c) { return c.id === id; }) ||
      { id: id, label: id, icon: "🔖", color: "var(--cat-8)" };
  }

  function formatCurrency(amount) {
    return (Math.round((amount + Number.EPSILON) * 100) / 100)
      .toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ---------------------------------------------------------------
  // API layer
  // ---------------------------------------------------------------
  function apiRequest(path, options) {
    return fetch(API_BASE + path, Object.assign({
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    }, options)).then(function (res) {
      if (res.status === 401) {
        window.location.href = "login.html";
        return new Promise(function () {}); // ustavi verigo, preusmeritev je v teku
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          throw new Error(data.error || "Napaka strežnika (" + res.status + ").");
        }
        return data;
      });
    });
  }

  const api = {
    currentUser: function () { return apiRequest("login.php", { method: "GET" }); },
    logout: function () { return apiRequest("logout.php", { method: "POST" }); },

    getTransactions: function () { return apiRequest("transactions.php", { method: "GET" }); },
    addTransaction: function (tx) { return apiRequest("transactions.php", { method: "POST", body: JSON.stringify(tx) }); },
    updateTransaction: function (id, tx) { return apiRequest("transactions.php?id=" + id, { method: "PUT", body: JSON.stringify(tx) }); },
    deleteTransaction: function (id) { return apiRequest("transactions.php?id=" + id, { method: "DELETE" }); },

    getBudget: function () { return apiRequest("budget.php", { method: "GET" }); },
    saveBudget: function (b) { return apiRequest("budget.php", { method: "POST", body: JSON.stringify(b) }); },

    getSavings: function () { return apiRequest("savings.php", { method: "GET" }); },
    saveSavingsGoal: function (g) { return apiRequest("savings.php", { method: "POST", body: JSON.stringify(g) }); },
    contributeSavings: function (amount) { return apiRequest("savings.php?action=contribute", { method: "POST", body: JSON.stringify({ amount: amount }) }); },
    resetSavings: function () { return apiRequest("savings.php?action=reset", { method: "POST", body: JSON.stringify({}) }); },

    reseed: function () { return apiRequest("reset.php?action=reseed", { method: "POST", body: JSON.stringify({}) }); },
    wipe: function () { return apiRequest("reset.php?action=wipe", { method: "POST", body: JSON.stringify({}) }); },

    getCategoryBudgets: function () { return apiRequest("category_budgets.php", { method: "GET" }); },
    saveCategoryBudget: function (category, amount) {
      return apiRequest("category_budgets.php", { method: "POST", body: JSON.stringify({ category: category, amount: amount }) });
    },
    deleteCategoryBudget: function (category) {
      return apiRequest("category_budgets.php?category=" + encodeURIComponent(category), { method: "DELETE" });
    },

    changePassword: function (currentPassword, newPassword) {
      return apiRequest("change_password.php", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }),
      });
    },
  };

  // ---------------------------------------------------------------
  // Stanje aplikacije
  // ---------------------------------------------------------------
  let transactions = [];
  let budget = { amount: 0, thresholdPercent: 80 };
  let savings = { name: "", target: 0, current: 0 };
  let categoryBudgets = []; // [{ category, amount }]
  let viewMonth = new Date(); // kateri mesec je prikazan na nadzorni plošči
  let categoryChartInstance = null;
  let trendChartInstance = null;

  function chartJsAvailable() {
    return typeof window.Chart !== "undefined";
  }

  // ---------------------------------------------------------------
  // Nalaganje vseh podatkov
  // ---------------------------------------------------------------
  function loadAllData() {
    return Promise.all([api.getTransactions(), api.getBudget(), api.getSavings(), api.getCategoryBudgets()])
      .then(function (results) {
        transactions = results[0] || [];
        budget = results[1] || { amount: 0, thresholdPercent: 80 };
        savings = results[2] || { name: "", target: 0, current: 0 };
        categoryBudgets = results[3] || [];
        renderAll();
      })
      .catch(showError);
  }

  function reloadCategoryBudgets() {
    return api.getCategoryBudgets().then(function (data) {
      categoryBudgets = data || [];
      renderBudgetView();
    }).catch(showError);
  }

  function reloadTransactions() {
    return api.getTransactions().then(function (data) {
      transactions = data || [];
      renderAll();
    }).catch(showError);
  }

  function reloadBudget() {
    return api.getBudget().then(function (data) {
      budget = data || { amount: 0, thresholdPercent: 80 };
      renderDashboard();
      renderBudgetView();
    }).catch(showError);
  }

  function reloadSavings() {
    return api.getSavings().then(function (data) {
      savings = data || { name: "", target: 0, current: 0 };
      renderSavingsView();
    }).catch(showError);
  }

  function renderAll() {
    renderDashboard();
    renderTransactionsView();
    renderBudgetView();
    renderSavingsView();
    populateCategoryFilterOptions();
  }

  // ---------------------------------------------------------------
  // Pomožno: transakcije za prikazani mesec
  // ---------------------------------------------------------------
  function isInViewMonth(tx) {
    const d = new Date(tx.date + "T00:00:00");
    return d.getFullYear() === viewMonth.getFullYear() && d.getMonth() === viewMonth.getMonth();
  }

  function updateMonthLabel() {
    const label = SLO_MONTHS_FULL[viewMonth.getMonth()] + " " + viewMonth.getFullYear();
    document.getElementById("currentMonthLabel").textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  // ---------------------------------------------------------------
  // Nadzorna plošča (Pregled)
  // ---------------------------------------------------------------
  function renderDashboard() {
    updateMonthLabel();
    const monthTx = transactions.filter(isInViewMonth);

    const income = monthTx.filter(function (t) { return t.type === "income"; })
      .reduce(function (s, t) { return s + Number(t.amount); }, 0);
    const expense = monthTx.filter(function (t) { return t.type === "expense"; })
      .reduce(function (s, t) { return s + Number(t.amount); }, 0);

    document.getElementById("sumIncome").textContent = formatCurrency(income);
    document.getElementById("sumExpense").textContent = formatCurrency(expense);
    document.getElementById("sumBalance").textContent = formatCurrency(income - expense);

    renderSemafor(expense);
    renderCategoryChart(monthTx);
    renderTrendChart();
    renderRecentList();
  }

  function renderSemafor(expense) {
    const dot = document.getElementById("semaforDot");
    const text = document.getElementById("semaforText");
    dot.className = "semafor-dot";

    if (!budget.amount || budget.amount <= 0) {
      text.textContent = "Proračun ni nastavljen. Nastavi ga v zavihku Proračun.";
      return;
    }

    const pct = (expense / budget.amount) * 100;
    if (pct >= 100) {
      dot.classList.add("is-critical");
      text.textContent = "Presegel/a si mesečni proračun (" + pct.toFixed(0) + " %).";
    } else if (pct >= budget.thresholdPercent) {
      dot.classList.add("is-serious");
      text.textContent = "Blizu meje proračuna (" + pct.toFixed(0) + " %).";
    } else if (pct >= budget.thresholdPercent * 0.7) {
      dot.classList.add("is-warning");
      text.textContent = "Poraba proračuna: " + pct.toFixed(0) + " %.";
    } else {
      dot.classList.add("is-good");
      text.textContent = "Poraba proračuna je v redu (" + pct.toFixed(0) + " %).";
    }
  }

  function renderRecentList() {
    const container = document.getElementById("recentTxList");
    const recent = transactions.slice(0, 5);
    container.innerHTML = "";
    if (recent.length === 0) {
      container.innerHTML = '<p class="empty-msg">Še ni transakcij.</p>';
      return;
    }
    recent.forEach(function (tx) { container.appendChild(buildTxRow(tx, false)); });
  }

  // ---------------------------------------------------------------
  // Grafi (Chart.js + ročna rezerva)
  // ---------------------------------------------------------------
  function expenseTotalsByCategory(monthTx) {
    const totals = {};
    monthTx.filter(function (t) { return t.type === "expense"; }).forEach(function (t) {
      totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
    });
    return totals;
  }

  function renderCategoryChart(monthTx) {
    const canvas = document.getElementById("categoryChart");
    const fallback = document.getElementById("categoryChartFallback");

    const totals = expenseTotalsByCategory(monthTx);
    const entries = Object.keys(totals).map(function (catId) {
      return { cat: categoryById(catId), amount: totals[catId] };
    }).sort(function (a, b) { return b.amount - a.amount; });

    if (entries.length === 0) {
      canvas.hidden = true;
      fallback.hidden = false;
      fallback.innerHTML = '<p class="empty-msg">Ni odhodkov za prikazani mesec.</p>';
      if (categoryChartInstance) { categoryChartInstance.destroy(); categoryChartInstance = null; }
      return;
    }

    if (chartJsAvailable()) {
      canvas.hidden = false;
      fallback.hidden = true;
      const ctx = canvas.getContext("2d");
      const colors = entries.map(function (e) { return resolveCssColor(e.cat.color); });
      if (categoryChartInstance) categoryChartInstance.destroy();
      categoryChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: entries.map(function (e) { return e.cat.label; }),
          datasets: [{ data: entries.map(function (e) { return e.amount; }), backgroundColor: colors }],
        },
        options: { plugins: { legend: { position: "bottom" } } },
      });
    } else {
      canvas.hidden = true;
      fallback.hidden = false;
      const max = entries[0].amount;
      fallback.innerHTML = entries.map(function (e) {
        const pct = max > 0 ? (e.amount / max) * 100 : 0;
        const color = resolveCssColor(e.cat.color);
        return '<div class="fb-row">' +
          '<span class="fb-swatch" style="background:' + color + '"></span>' +
          '<span>' + escapeHtml(e.cat.label) + '</span>' +
          '<div class="fb-bar-track"><div class="fb-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
          '<span>' + formatCurrency(e.amount) + '</span>' +
          '</div>';
      }).join("");
    }
  }

  function resolveCssColor(varExpr) {
    // pretvori "var(--cat-1)" v dejansko barvo, da jo Chart.js lahko uporabi
    const match = /var\((--[^)]+)\)/.exec(varExpr);
    if (!match) return varExpr;
    return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || "#999";
  }

  function lastSixMonths() {
    const months = [];
    const base = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    for (let i = 5; i >= 0; i--) {
      months.push(new Date(base.getFullYear(), base.getMonth() - i, 1));
    }
    return months;
  }

  function renderTrendChart() {
    const canvas = document.getElementById("trendChart");
    const fallback = document.getElementById("trendChartFallback");
    const months = lastSixMonths();

    const incomeData = months.map(function (m) {
      return transactions.filter(function (t) {
        const d = new Date(t.date + "T00:00:00");
        return t.type === "income" && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
      }).reduce(function (s, t) { return s + Number(t.amount); }, 0);
    });
    const expenseData = months.map(function (m) {
      return transactions.filter(function (t) {
        const d = new Date(t.date + "T00:00:00");
        return t.type === "expense" && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
      }).reduce(function (s, t) { return s + Number(t.amount); }, 0);
    });
    const labels = months.map(function (m) { return SLO_MONTHS_FULL[m.getMonth()].slice(0, 3) + " " + String(m.getFullYear()).slice(2); });

    if (chartJsAvailable()) {
      canvas.hidden = false;
      fallback.hidden = true;
      const ctx = canvas.getContext("2d");
      if (trendChartInstance) trendChartInstance.destroy();
      trendChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Prihodki", data: incomeData, backgroundColor: resolveCssColor("var(--income-color)") },
            { label: "Odhodki", data: expenseData, backgroundColor: resolveCssColor("var(--expense-color)") },
          ],
        },
        options: { plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } },
      });
    } else {
      canvas.hidden = true;
      fallback.hidden = false;
      const max = Math.max.apply(null, incomeData.concat(expenseData, [1]));
      fallback.innerHTML = labels.map(function (lab, i) {
        const incPct = (incomeData[i] / max) * 100;
        const expPct = (expenseData[i] / max) * 100;
        return '<div class="fb-row"><span>' + lab + '</span>' +
          '<div class="fb-bar-track"><div class="fb-bar-fill" style="width:' + incPct + '%;background:' + resolveCssColor("var(--income-color)") + '"></div></div>' +
          '<div class="fb-bar-track"><div class="fb-bar-fill" style="width:' + expPct + '%;background:' + resolveCssColor("var(--expense-color)") + '"></div></div>' +
          '</div>';
      }).join("");
    }
  }

  // ---------------------------------------------------------------
  // Seznam transakcij (vrstica, skupna za Pregled in Transakcije)
  // ---------------------------------------------------------------
  function buildTxRow(tx, withActions) {
    const row = document.createElement("div");
    row.className = "tx-row";
    row.dataset.id = tx.id;
    const cat = categoryById(tx.category);
    const sign = tx.type === "income" ? "+" : "-";
    const amountClass = tx.type === "income" ? "is-income" : "is-expense";

    row.innerHTML =
      '<div class="tx-row__icon" style="background:' + resolveCssColor(cat.color) + '">' + cat.icon + '</div>' +
      '<div class="tx-row__main">' +
        '<span class="tx-row__desc">' + escapeHtml(tx.description) + '</span>' +
        '<span class="tx-row__meta">' + escapeHtml(cat.label) + ' · ' + escapeHtml(tx.date) + '</span>' +
      '</div>' +
      '<div class="tx-row__amount ' + amountClass + '">' + sign + formatCurrency(Math.abs(Number(tx.amount))) + '</div>' +
      (withActions !== false
        ? '<div class="tx-row__actions">' +
            '<button type="button" class="icon-btn tx-edit-btn" aria-label="Uredi">✏️</button>' +
            '<button type="button" class="icon-btn tx-delete-btn" aria-label="Izbriši">🗑️</button>' +
          '</div>'
        : '');

    if (withActions !== false) {
      row.querySelector(".tx-edit-btn").addEventListener("click", function () { openEditModal(tx); });
      row.querySelector(".tx-delete-btn").addEventListener("click", function () { confirmDeleteTransaction(tx.id); });
    }
    return row;
  }

  // ---------------------------------------------------------------
  // Transakcije (iskanje/filtriranje/sortiranje)
  // ---------------------------------------------------------------
  function populateCategoryFilterOptions() {
    const select = document.getElementById("filterCategory");
    const current = select.value;
    select.innerHTML = '<option value="all">Vse kategorije</option>' +
      ALL_CATEGORIES.map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.label) + '</option>'; }).join("");
    select.value = current || "all";
  }

  function renderTransactionsView() {
    const search = document.getElementById("searchInput").value.trim().toLowerCase();
    const type = document.getElementById("filterType").value;
    const category = document.getElementById("filterCategory").value;
    const sortBy = document.getElementById("sortBy").value;

    let list = transactions.slice();

    if (type !== "all") list = list.filter(function (t) { return t.type === type; });
    if (category !== "all") list = list.filter(function (t) { return t.category === category; });
    if (search) {
      list = list.filter(function (t) {
        return t.description.toLowerCase().indexOf(search) !== -1 ||
          categoryById(t.category).label.toLowerCase().indexOf(search) !== -1;
      });
    }

    list.sort(function (a, b) {
      switch (sortBy) {
        case "date-asc": return a.date.localeCompare(b.date) || a.id - b.id;
        case "amount-desc": return Number(b.amount) - Number(a.amount);
        case "amount-asc": return Number(a.amount) - Number(b.amount);
        default: return b.date.localeCompare(a.date) || b.id - a.id; // date-desc
      }
    });

    const container = document.getElementById("fullTxList");
    const noResults = document.getElementById("noResultsMsg");
    container.innerHTML = "";

    if (list.length === 0) {
      noResults.hidden = false;
    } else {
      noResults.hidden = true;
      list.forEach(function (tx) { container.appendChild(buildTxRow(tx, true)); });
    }
  }

  // ---------------------------------------------------------------
  // Modal: dodaj / uredi transakcijo
  // ---------------------------------------------------------------
  const txModalOverlay = document.getElementById("txModalOverlay");
  const txForm = document.getElementById("txForm");
  const txFormError = document.getElementById("txFormError");

  function populateCategorySelect(type) {
    const select = document.getElementById("txCategory");
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    select.innerHTML = cats.map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.label) + '</option>'; }).join("");
  }

  function openAddModal() {
    document.getElementById("txModalTitle").textContent = "Dodaj strošek";
    document.getElementById("txId").value = "";
    txForm.reset();
    document.querySelector('input[name="txType"][value="expense"]').checked = true;
    populateCategorySelect("expense");
    document.getElementById("txDate").value = new Date().toISOString().slice(0, 10);
    hideFormError();
    setFormBusy(false);
    txModalOverlay.hidden = false;
  }

  function openEditModal(tx) {
    document.getElementById("txModalTitle").textContent = "Uredi transakcijo";
    document.getElementById("txId").value = tx.id;
    document.querySelector('input[name="txType"][value="' + tx.type + '"]').checked = true;
    populateCategorySelect(tx.type);
    document.getElementById("txCategory").value = tx.category;
    document.getElementById("txAmount").value = tx.amount;
    document.getElementById("txDate").value = tx.date;
    document.getElementById("txDescription").value = tx.description;
    hideFormError();
    setFormBusy(false);
    txModalOverlay.hidden = false;
  }

  function closeTxModal() { txModalOverlay.hidden = true; }

  function showFormError(msg) { txFormError.textContent = msg; txFormError.hidden = false; }
  function hideFormError() { txFormError.hidden = true; txFormError.textContent = ""; }

  function setFormBusy(busy) {
    document.getElementById("saveTxBtn").disabled = busy;
    document.getElementById("saveTxBtn").textContent = busy ? "Shranjujem ..." : "Shrani";
  }

  document.querySelectorAll('input[name="txType"]').forEach(function (radio) {
    radio.addEventListener("change", function () { populateCategorySelect(this.value); });
  });

  function handleTxFormSubmit(e) {
    e.preventDefault();
    hideFormError();

    const id = document.getElementById("txId").value;
    const type = document.querySelector('input[name="txType"]:checked').value;
    const amount = parseFloat(document.getElementById("txAmount").value);
    const category = document.getElementById("txCategory").value;
    const date = document.getElementById("txDate").value;
    const description = document.getElementById("txDescription").value.trim();

    if (!amount || amount <= 0) { showFormError("Znesek mora biti število, večje od 0."); return; }
    if (!date) { showFormError("Izberite datum."); return; }
    if (!description) { showFormError("Vnesite opis."); return; }

    const payload = { type: type, amount: amount, category: category, date: date, description: description };

    setFormBusy(true);
    const req = id ? api.updateTransaction(id, payload) : api.addTransaction(payload);
    req.then(function () {
      closeTxModal();
      showToast(id ? "Transakcija posodobljena." : "Transakcija dodana.");
      return reloadTransactions();
    }).catch(function (err) {
      showFormError(err.message);
    }).finally(function () { setFormBusy(false); });
  }

  function confirmDeleteTransaction(id) {
    if (!window.confirm("Ali res želite izbrisati to transakcijo?")) return;
    api.deleteTransaction(id).then(function () {
      showToast("Transakcija izbrisana.");
      return reloadTransactions();
    }).catch(showError);
  }

  // ---------------------------------------------------------------
  // Proračun
  // ---------------------------------------------------------------
  function renderBudgetView() {
    document.getElementById("budgetAmount").value = budget.amount || "";
    document.getElementById("budgetThreshold").value = budget.thresholdPercent || 80;

    const monthTx = transactions.filter(isInViewMonth);
    const expense = monthTx.filter(function (t) { return t.type === "expense"; })
      .reduce(function (s, t) { return s + Number(t.amount); }, 0);

    const bar = document.getElementById("budgetBar");
    const summary = document.getElementById("budgetSummaryText");

    if (!budget.amount || budget.amount <= 0) {
      bar.style.width = "0%";
      summary.textContent = "Proračun ni nastavljen.";
    } else {
      const pct = Math.min(100, (expense / budget.amount) * 100);
      bar.style.width = pct + "%";
      bar.style.background = pct >= 100 ? "var(--status-critical)" : pct >= budget.thresholdPercent ? "var(--status-serious)" : "var(--status-good)";
      summary.textContent = formatCurrency(expense) + " od " + formatCurrency(budget.amount) + " (" + pct.toFixed(0) + " %)";
    }

    renderCategoryBudgets(monthTx);
  }

  // Proračun po kategorijah - dopolnilo k skupnemu mesečnemu proračunu zgoraj.
  // Za vsako kategorijo z nastavljenim limitom prikaže "porabljeno / limit" in
  // vrstico napredka, pobarvano po istem principu kot skupni proračun (zeleno/
  // rumeno/rdeče glede na budget.thresholdPercent).
  function renderCategoryBudgets(monthTx) {
    const totals = expenseTotalsByCategory(monthTx);
    const threshold = budget.thresholdPercent || 80;

    const select = document.getElementById("categoryBudgetSelect");
    select.innerHTML = EXPENSE_CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '">' + c.icon + ' ' + escapeHtml(c.label) + '</option>';
    }).join("");

    const list = document.getElementById("categoryBudgetList");
    if (categoryBudgets.length === 0) {
      list.innerHTML = '<p class="empty-msg">Še ni nastavljenih limitov po posameznih kategorijah.</p>';
      return;
    }

    list.innerHTML = categoryBudgets.map(function (cb) {
      const cat = categoryById(cb.category);
      const spent = totals[cb.category] || 0;
      const limit = Number(cb.amount);
      const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
      const barColor = pct >= 100 ? "var(--status-critical)" : pct >= threshold ? "var(--status-serious)" : "var(--status-good)";
      return (
        '<div class="cat-budget-row">' +
          '<div class="cat-budget-row__head">' +
            '<span class="cat-budget-row__name">' + cat.icon + ' ' + escapeHtml(cat.label) + '</span>' +
            '<span class="cat-budget-row__amounts">' + formatCurrency(spent) + ' / ' + formatCurrency(limit) +
              '<button type="button" class="cat-budget-row__remove" data-category="' + cat.id + '" title="Odstrani limit">✕</button>' +
            '</span>' +
          '</div>' +
          '<div class="cat-budget-bar-wrap"><div class="cat-budget-bar" style="width:' + pct + '%; background:' + barColor + ';"></div></div>' +
        '</div>'
      );
    }).join("");
  }

  function handleCategoryBudgetFormSubmit(e) {
    e.preventDefault();
    const category = document.getElementById("categoryBudgetSelect").value;
    const amount = parseFloat(document.getElementById("categoryBudgetAmount").value);

    if (!category) { showToastError("Izberite kategorijo."); return; }
    if (isNaN(amount) || amount <= 0) { showToastError("Limit mora biti število, večje od 0."); return; }

    api.saveCategoryBudget(category, amount).then(function () {
      document.getElementById("categoryBudgetAmount").value = "";
      showToast("Limit za kategorijo shranjen.");
      return reloadCategoryBudgets();
    }).catch(showError);
  }

  function handleCategoryBudgetListClick(e) {
    const btn = e.target.closest(".cat-budget-row__remove");
    if (!btn) return;
    const category = btn.dataset.category;
    if (!window.confirm("Ali res želite odstraniti limit za to kategorijo?")) return;
    api.deleteCategoryBudget(category).then(function () {
      showToast("Limit odstranjen.");
      return reloadCategoryBudgets();
    }).catch(showError);
  }

  function handleBudgetFormSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("budgetAmount").value);
    const threshold = parseInt(document.getElementById("budgetThreshold").value, 10);

    if (isNaN(amount) || amount < 0) { showToastError("Znesek proračuna mora biti število, večje ali enako 0."); return; }
    if (isNaN(threshold) || threshold < 1 || threshold > 100) { showToastError("Opozorilni prag mora biti med 1 in 100 %."); return; }

    api.saveBudget({ amount: amount, thresholdPercent: threshold }).then(function () {
      showToast("Proračun shranjen.");
      return reloadBudget();
    }).catch(showError);
  }

  // ---------------------------------------------------------------
  // Varčevanje
  // ---------------------------------------------------------------
  function renderSavingsView() {
    document.getElementById("savingsName").value = savings.name || "";
    document.getElementById("savingsTarget").value = savings.target || "";

    const bar = document.getElementById("savingsBar");
    const summary = document.getElementById("savingsSummaryText");

    if (!savings.target || savings.target <= 0) {
      bar.style.width = "0%";
      summary.textContent = "Cilj varčevanja ni nastavljen.";
      return;
    }
    const pct = Math.min(100, (savings.current / savings.target) * 100);
    bar.style.width = pct + "%";
    summary.textContent = formatCurrency(savings.current) + " od " + formatCurrency(savings.target) + " (" + pct.toFixed(0) + " %)";
  }

  function handleSavingsGoalFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("savingsName").value.trim();
    const target = parseFloat(document.getElementById("savingsTarget").value);

    if (!name) { showToastError("Vnesite ime cilja."); return; }
    if (isNaN(target) || target <= 0) { showToastError("Cilj mora biti število, večje od 0."); return; }

    api.saveSavingsGoal({ name: name, target: target }).then(function () {
      showToast("Cilj varčevanja shranjen.");
      return reloadSavings();
    }).catch(showError);
  }

  function handleSavingsContributeFormSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("savingsContribution");
    const amount = parseFloat(input.value);
    if (isNaN(amount) || amount <= 0) { showToastError("Prispevek mora biti število, večje od 0."); return; }

    api.contributeSavings(amount).then(function () {
      input.value = "";
      showToast("Prispevek dodan.");
      return reloadSavings();
    }).catch(showError);
  }

  function handleResetSavings() {
    if (!window.confirm("Ali res želite ponastaviti napredek varčevanja na 0 €?")) return;
    api.resetSavings().then(function () {
      showToast("Napredek ponastavljen.");
      return reloadSavings();
    }).catch(showError);
  }

  // ---------------------------------------------------------------
  // Nastavitve (reseed/wipe/logout)
  // ---------------------------------------------------------------
  function handleReseed() {
    if (!window.confirm("S tem boste nadomestili vse svoje podatke s testnimi podatki. Nadaljevati?")) return;
    api.reseed().then(function () {
      showToast("Podatki ponastavljeni na testne.");
      return loadAllData();
    }).catch(showError);
  }

  function handleWipe() {
    if (!window.confirm("S tem boste IZBRISALI vse svoje podatke. Tega dejanja ni mogoče razveljaviti. Nadaljevati?")) return;
    api.wipe().then(function () {
      showToast("Vsi podatki izbrisani.");
      return loadAllData();
    }).catch(showError);
  }

  function handleLogout() {
    api.logout().then(function () {
      window.location.href = "login.html";
    }).catch(showError);
  }

  function handleChangePasswordFormSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const newPassword2 = document.getElementById("newPassword2").value;
    const errorEl = document.getElementById("changePasswordError");
    errorEl.hidden = true;

    if (!currentPassword || !newPassword || !newPassword2) {
      errorEl.textContent = "Izpolnite vsa polja.";
      errorEl.hidden = false;
      return;
    }
    if (newPassword !== newPassword2) {
      errorEl.textContent = "Novi gesli se ne ujemata.";
      errorEl.hidden = false;
      return;
    }

    api.changePassword(currentPassword, newPassword).then(function () {
      document.getElementById("changePasswordForm").reset();
      showToast("Geslo uspešno spremenjeno.");
    }).catch(function (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    });
  }

  // ---------------------------------------------------------------
  // Toast / napake
  // ---------------------------------------------------------------
  let toastTimer = null;
  function showToast(message, isError) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = "toast" + (isError ? " is-error" : "");
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 3500);
  }
  function showToastError(message) { showToast(message, true); }
  function showError(err) { showToast(err && err.message ? err.message : "Prišlo je do napake.", true); }

  // ---------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------
  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("is-active"); });
        document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("is-active"); });
        tab.classList.add("is-active");
        document.getElementById("view-" + tab.dataset.tab).classList.add("is-active");
      });
    });
  }

  // ---------------------------------------------------------------
  // Mesečna navigacija
  // ---------------------------------------------------------------
  function initMonthNav() {
    document.getElementById("prevMonthBtn").addEventListener("click", function () {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
      renderDashboard();
      renderBudgetView();
    });
    document.getElementById("nextMonthBtn").addEventListener("click", function () {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
      renderDashboard();
      renderBudgetView();
    });
  }

  // ---------------------------------------------------------------
  // Inicializacija
  // ---------------------------------------------------------------
  function init() {
    api.currentUser().then(function (user) {
      document.getElementById("topbarUser").textContent = "👤 " + user.username;

      initTabs();
      initMonthNav();

      document.getElementById("addTxBtn").addEventListener("click", openAddModal);
      document.getElementById("closeTxModalBtn").addEventListener("click", closeTxModal);
      document.getElementById("cancelTxBtn").addEventListener("click", closeTxModal);
      txModalOverlay.addEventListener("click", function (e) { if (e.target === txModalOverlay) closeTxModal(); });
      txForm.addEventListener("submit", handleTxFormSubmit);

      document.getElementById("searchInput").addEventListener("input", renderTransactionsView);
      document.getElementById("filterType").addEventListener("change", renderTransactionsView);
      document.getElementById("filterCategory").addEventListener("change", renderTransactionsView);
      document.getElementById("sortBy").addEventListener("change", renderTransactionsView);

      document.getElementById("budgetForm").addEventListener("submit", handleBudgetFormSubmit);
      document.getElementById("categoryBudgetForm").addEventListener("submit", handleCategoryBudgetFormSubmit);
      document.getElementById("categoryBudgetList").addEventListener("click", handleCategoryBudgetListClick);
      document.getElementById("savingsGoalForm").addEventListener("submit", handleSavingsGoalFormSubmit);
      document.getElementById("savingsContributeForm").addEventListener("submit", handleSavingsContributeFormSubmit);
      document.getElementById("resetSavingsBtn").addEventListener("click", handleResetSavings);

      document.getElementById("changePasswordForm").addEventListener("submit", handleChangePasswordFormSubmit);
      document.getElementById("reseedBtn").addEventListener("click", handleReseed);
      document.getElementById("wipeBtn").addEventListener("click", handleWipe);
      document.getElementById("logoutBtn").addEventListener("click", handleLogout);

      return loadAllData();
    }).catch(function () {
      // api.currentUser() že preusmeri na login.html ob 401
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
