"use strict";
const $ = (id) => document.getElementById(id),
  F = ValeFinance;
let data = [],
  start = "",
  end = "",
  preset = "";
const money = (c) =>
  c === null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(c / 100);
const showDate = (s) => s.split("-").reverse().join("/");
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
window.setTimeout(() => {
  $("app").hidden = false;
  $("splash").classList.add("leaving");
  window.setTimeout(() => {
    $("splash").hidden = true;
  }, 200);
}, 1200);
function choose() {
  $("file-input").value = "";
  $("file-input").click();
}
$("select-file").onclick = choose;
$("replace-file").onclick = choose;
$("file-input").onchange = async () => {
  const file = $("file-input").files?.[0];
  if (!file) return;
  const error = $("file-error");
  error.hidden = true;
  $("select-file").disabled = true;
  $("replace-file").disabled = true;
  try {
    if (
      !/\.(xlsx|xls)$/i.test(file.name) ||
      !file.size ||
      file.size > 20 * 1024 * 1024
    )
      throw Error("Selecione um Excel (.xlsx ou .xls) com até 20 MB.");
    if (typeof XLSX === "undefined")
      throw Error("Leitor Excel indisponível. Verifique a pasta vendor.");
    const w = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
      sheets: ["CONTAS_A_PAGAR"],
    });
    const result = F.importBook(w);
    data = result.rows;
    $("source-name").textContent = file.name + " · CONTAS_A_PAGAR";
    $("all-total").textContent = money(F.sum(data));
    $("all-count").textContent = data.length + " despesas";
    $("import-notice").hidden = !result.blanks;
    $("import-notice").textContent =
      result.blanks +
      " despesa(s) sem valor: incluídas na contagem, sem contribuição aos totais.";
    $("dashboard").hidden = false;
    document.querySelector(".intro").hidden = true;
    document.querySelector(".import-card").hidden = true;
    document.querySelector("main").classList.add("has-data");
    setRange("", "", "");
    $("dashboard").scrollIntoView({ block: "start" });
  } catch (e) {
    error.textContent = e.message || "Não foi possível ler o arquivo.";
    error.hidden = false;
    document.querySelector(".import-card").hidden = false;
  } finally {
    $("select-file").disabled = false;
    $("replace-file").disabled = false;
  }
};
function setRange(a, b, p = "") {
  start = a;
  end = b;
  preset = p;
  $("start-date").value = a;
  $("end-date").value = b;
  $("date-error").hidden = true;
  render();
}
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
// Atraso: vencimento anterior à data de hoje (horário de São Paulo) e sem baixa.
function isPaid(status) {
  return [
    "pago",
    "paga",
    "quitado",
    "quitada",
    "liquidado",
    "liquidada",
  ].includes(F.normalize(status));
}
function isOverdue(r, reference = today()) {
  return r.date < reference && !isPaid(r.status);
}
function renderOverdue() {
  const late = data.filter((r) => isOverdue(r));
  const panel = $("overdue-panel");
  panel.hidden = !late.length;
  if (!late.length) return;
  $("overdue-total").textContent = money(F.sum(late));
  $("overdue-count").textContent =
    late.length === 1
      ? "1 despesa vencida"
      : late.length + " despesas vencidas";
  const items = $("overdue-items");
  items.replaceChildren();
  for (const r of late) {
    const item = el("div", undefined, "overdue-item"),
      info = el("div");
    info.append(
      el("strong", r.description),
      el("span", "Venceu em " + showDate(r.date), "overdue-date"),
    );
    item.append(info, el("strong", money(r.cents), "overdue-amount"));
    items.append(item);
  }
}
function monthRange(m) {
  const [y, n] = m.split("-").map(Number);
  return [m + "-01", m + "-" + new Date(y, n, 0).getDate()];
}
document.querySelectorAll("[data-preset]").forEach(
  (b) =>
    (b.onclick = () => {
      const t = today();
      if (b.dataset.preset === "today") setRange(t, t, "today");
      if (b.dataset.preset === "week") {
        const d = new Date(t + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + 6);
        setRange(t, d.toISOString().slice(0, 10), "week");
      }
      if (b.dataset.preset === "month")
        setRange(...monthRange(t.slice(0, 7)), "month");
    }),
);
$("all-period").onclick = () => setRange("", "", "");
$("date-form").onsubmit = (e) => {
  e.preventDefault();
  const a = $("start-date").value,
    b = $("end-date").value;
  if (!a || !b || a > b) {
    $("date-error").textContent =
      "A data final deve ser igual ou posterior à inicial.";
    $("date-error").hidden = false;
    return;
  }
  setRange(a, b);
};
function render() {
  renderOverdue();
  const hasPeriod = Boolean(start && end);
  const filtered = hasPeriod ? F.filter(data, start, end) : data;
  $("period-label").textContent = !hasPeriod
    ? "Nenhum período selecionado."
    : start === end
      ? showDate(start)
      : showDate(start) + " a " + showDate(end);
  document.querySelectorAll("[data-preset]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.preset === preset));
  });
  const months = F.group(data, (r) => r.date.slice(0, 7)),
    max = Math.max(1, ...Array.from(months.values(), F.sum));
  const chart = $("month-chart");
  chart.replaceChildren();
  for (const [m, rows] of months) {
    const v = F.sum(rows),
      range = monthRange(m),
      active = start === range[0] && end === range[1];
    const b = el("button", undefined, "bar-column");
    b.type = "button";
    b.setAttribute("aria-pressed", String(active));
    const label = new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(m + "-15T12:00:00Z"));
    b.setAttribute("aria-label", label + ": " + money(v));
    b.append(el("span", money(v), "bar-value"));
    const track = el("span", undefined, "bar-track"),
      bar = el("span", undefined, "bar");
    bar.style.height =
      Math.max(v > 0 ? 2 : 0, (Math.max(0, v) / max) * 100) + "%";
    track.append(bar);
    b.append(track, el("span", label, "bar-label"));
    b.onclick = () => setRange(...range);
    chart.append(b);
  }
  const cats = $("categories");
  cats.replaceChildren();
  const grouped = [...F.group(filtered, (r) => r.category)].sort(
    (a, b) => F.sum(b[1]) - F.sum(a[1]),
  );
  const catMax = Math.max(1, ...grouped.map((x) => F.sum(x[1])));
  for (const [name, rows] of grouped) {
    const row = el("div", undefined, "category"),
      top = el("div", undefined, "category-top");
    top.append(el("span", name), el("strong", money(F.sum(rows))));
    const rail = el("div", undefined, "category-rail"),
      fill = el("span");
    fill.style.width = (Math.max(0, F.sum(rows)) / catMax) * 100 + "%";
    rail.append(fill);
    row.append(top, rail);
    cats.append(row);
  }
  if (!grouped.length)
    cats.append(el("p", "Nenhuma despesa neste período.", "empty"));
  const list = $("expense-list");
  list.replaceChildren();
  $("period-count").hidden = !hasPeriod;
  $("period-count").textContent = filtered.length + " itens";
  if (!hasPeriod) {
    list.append(
      el(
        "p",
        "Selecione um período ou mês para visualizar as despesas.",
        "empty",
      ),
    );
    $("period-total").hidden = true;
    $("period-total").replaceChildren();
    return;
  }
  for (const [day, rows] of F.group(filtered, (r) => r.date)) {
    const section = el("section", undefined, "day-group");
    section.append(el("h3", showDate(day)));
    for (const r of rows) {
      const row = el("div", undefined, "expense"),
        left = el("div"),
        name = el("strong", r.description);
      if (isOverdue(r)) row.classList.add("expense-overdue");
      left.append(name, el("span", r.category, "expense-category"));
      const badge = el("span", r.status, "status");
      if (isPaid(r.status)) badge.classList.add("paid");
      left.append(badge);
      if (isOverdue(r))
        left.append(el("span", "ATRASADA", "status overdue-status"));
      row.append(left, el("strong", money(r.cents), "expense-value"));
      section.append(row);
    }
    const sub = el("div", undefined, "subtotal");
    sub.append(el("span", "Subtotal do dia"), el("strong", money(F.sum(rows))));
    section.append(sub);
    list.append(section);
  }
  if (!filtered.length)
    list.append(el("p", "Nenhuma despesa no período selecionado.", "empty"));
  $("period-total").hidden = start === end;
  $("period-total").replaceChildren(
    el("span", "Total do período"),
    el("strong", money(F.sum(filtered))),
  );
}
