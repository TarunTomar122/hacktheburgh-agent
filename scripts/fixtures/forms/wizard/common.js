// Tiny client-side wizard for the fixtures: saves answers to sessionStorage, shows GOV.UK-style errors, moves on.
window.wizard = function (formId, next, validators) {
  const form = document.getElementById(formId);
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    document.querySelectorAll(".error-summary").forEach(function (n) { n.remove(); });
    document.querySelectorAll(".form-group--error").forEach(function (n) { n.classList.remove("form-group--error"); });
    document.querySelectorAll(".error-message").forEach(function (n) { n.remove(); });
    document.querySelectorAll("[aria-invalid]").forEach(function (n) { n.removeAttribute("aria-invalid"); });
    const errors = [];
    validators.forEach(function (v) {
      const msg = v.check();
      if (!msg) return;
      errors.push({ id: v.id, msg: msg });
      const el = document.getElementById(v.id);
      const group = el.closest(".form-group");
      group.classList.add("form-group--error");
      const m = document.createElement("span");
      m.className = "error-message"; m.id = v.id + "-error"; m.textContent = msg;
      group.insertBefore(m, el.closest("fieldset") === group ? group.children[1] : el);
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("aria-describedby", v.id + "-error");
    });
    if (errors.length) {
      const s = document.createElement("div");
      s.className = "error-summary"; s.setAttribute("role", "alert");
      s.innerHTML = "<h2>There is a problem</h2><ul>" + errors.map(function (e) { return '<li><a href="#' + e.id + '">' + e.msg + "</a></li>"; }).join("") + "</ul>";
      document.querySelector("main").prepend(s);
      return;
    }
    const data = JSON.parse(sessionStorage.getItem("answers") || "{}");
    new FormData(form).forEach(function (v, k) { data[k] = data[k] && k.endsWith("[]") ? data[k] + ", " + v : v; });
    sessionStorage.setItem("answers", JSON.stringify(data));
    setTimeout(function () { location.href = next; }, 150);
  });
};
window.val = function (id) { return (document.getElementById(id).value || "").trim(); };
window.radio = function (name) { const r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ""; };
