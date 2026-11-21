/* هوم ماربل — نظام الإدارة | المرحلة الأولى + المرحلة الثانية (إضافات عبر نقاط ربط فقط) */
(function () {
  const sb = supabase.createClient(HM_CONFIG.url, HM_CONFIG.key);
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $("#app");

  // ---------- نقاط ربط الإضافات (المرحلة الثانية) — لا تؤثر على المرحلة الأولى إن لم توجد إضافات ----------
  const HMX = window.HM_EXT || [];
  const X = (fn, ...args) => HMX.map((e) => { try { return typeof e[fn] === "function" ? e[fn](...args) : undefined; } catch (er) { console.error("[HM_EXT]", fn, er); return undefined; } });
  const XS = (fn, ...args) => X(fn, ...args).filter((v) => typeof v === "string").join("");
  const xPage = (r) => HMX.find((e) => e.pages && typeof e.pages[r] === "function");

  const ROLE_LABEL = { admin: "المدير العام (مدير النظام)", executive: "المدير التنفيذي", sales: "موظف المبيعات", factory_manager: "مدير المصنع", accountant: "المحاسبة" };
  const ROLE_DESC = { admin: "كل الصلاحيات", executive: "نفس صلاحيات المدير العام بالكامل (بما فيها تعديل الصلاحيات)", sales: "العملاء والعقود وعروض الأسعار", factory_manager: "إدارة المصنع والتصنيع", accountant: "الفواتير والدفعات" };
  const STATUS = {
    design: ["قيد التصميم", "b-blue", "#3d7bd6"],
    measurement: ["قيد القياس", "b-yellow", "#e6b422"],
    awaiting_contract: ["بانتظار اعتماد العقد", "b-red", "#d63b3b"],
    manufacturing: ["قيد التصنيع", "b-orange", "#ef9a3c"],
    ready_install: ["جاهز للتركيب", "b-green", "#5aa58a"],
    completed: ["مكتمل", "b-green", "#2f9e5b"],
  };
  const DOC = {
    quote: ["عرض سعر", "quote"], contract: ["عقد", "contract"], design: ["تصميم", "design"],
    measurement: ["طلب مقاس", "ruler"], receipt: ["سند قبض", "receipt"], invoice: ["فاتورة", "orders"], sample: ["طلب عينات", "layers"],
  };
  const DOC_STATUS = { draft: ["مسودة", "b-gray"], sent: ["مُرسل", "b-blue"], approved: ["معتمد", "b-green"], rejected: ["مرفوض", "b-red"], scheduled: ["مجدول", "b-yellow"], done: ["منفّذ", "b-green"] };

  const S = { session: null, user: null, profile: null, roles: [], branches: [], customers: [], orders: [], documents: [], profiles: [], allRoles: [], audit: [], route: "", channel: null };

  // ---------- helpers ----------
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const d = (t) => (t ? new Date(t).toLocaleDateString("en-CA").replace(/-/g, "/") : "—");
  const has = (...r) => S.roles.some((x) => r.includes(x));
  const isMgr = () => has("admin", "executive");
  const canSell = () => has("admin", "executive", "sales", "accountant");
  const branchName = (id) => (S.branches.find((b) => b.id === id) || {}).name || "—";
  const cityOf = (id) => (S.branches.find((b) => b.id === id) || {}).city || "—";
  const cust = (id) => S.customers.find((c) => c.id === id) || {};
  const badge = (st) => { const s = STATUS[st] || [st, "b-gray"]; return `<span class="badge ${s[1]}">${s[0]}</span>`; };
  const dbadge = (st) => { const s = DOC_STATUS[st] || [st, "b-gray"]; return `<span class="badge ${s[1]}">${s[0]}</span>`; };
  const paidFor = (orderId) => S.documents.filter((x) => x.order_id === orderId && x.kind === "receipt").reduce((a, b) => a + Number(b.amount), 0);

  function toast(msg, type) {
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    $("#toast-root").appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
  function errMsg(e) { return (e && (e.message || e.error_description)) || "حدث خطأ غير متوقع"; }

  function modal(title, body, actions) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="overlay"><div class="modal"><div class="modal-head"><h3>${title}</h3><button data-close>${icon("x")}</button></div><div class="modal-body">${body}</div>${actions ? `<div class="modal-foot">${actions}</div>` : ""}</div></div>`;
    const ov = root.firstChild;
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) closeModal(); });
    return ov;
  }
  function closeModal() { $("#modal-root").innerHTML = ""; }
  function formData(form) { const o = {}; new FormData(form).forEach((v, k) => (o[k] = v)); return o; }

  // ---------- data ----------
  // تحميل كل الصفوف على دفعات (1000 صف لكل دفعة) لتجاوز حد قاعدة البيانات — بلا حد أقصى لعدد العملاء
  async function fetchAll(table, col, asc) {
    const all = []; const size = 1000;
    for (let from = 0; ; from += size) {
      const r = await sb.from(table).select("*").order(col, { ascending: asc }).order("id", { ascending: true }).range(from, from + size - 1);
      if (r.error) return all.length ? { data: all, error: null } : r;
      const d = r.data || []; all.push(...d);
      if (d.length < size) return { data: all, error: null };
    }
  }
  async function loadAll() {
    const q = await Promise.all([
      sb.from("branches").select("*").order("name"),
      fetchAll("customers", "created_at", false),
      fetchAll("orders", "order_no", false),
      fetchAll("documents", "created_at", false),
      fetchAll("profiles", "created_at", true),
      sb.from("user_roles").select("*"),
    ]);
    S.branches = q[0].data || []; S.customers = q[1].data || []; S.orders = q[2].data || [];
    S.documents = q[3].data || []; S.profiles = q[4].data || []; S.allRoles = q[5].data || [];
    if (isMgr()) { const a = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200); S.audit = a.data || []; }
    try { await Promise.all(X("load")); } catch (er) { console.error("[HM_EXT] load", er); }
  }

  // ---------- المزامنة اللحظية بين كل الأجهزة (قاعدة Supabase واحدة) ----------
  // 1) Realtime: أي إضافة/تعديل/حذف يصل لكل من فاتح البرنامج أو الموقع خلال ثوانٍ.
  // 2) احتياطي: إن انقطع الاتصال اللحظي (نوم الجهاز، ضعف الشبكة) نعيد الاشتراك ونحدّث البيانات تلقائياً.
  let reloadTimer, rtOk = false, lastSync = Date.now(), reloading = false;
  const typingNow = () => { const a = document.activeElement; return !!(a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== "gs" && app.contains(a)); };
  function setLive() {
    const el = document.querySelector(".live"); if (!el) return;
    el.lastChild.textContent = rtOk ? " مباشر" : " إعادة الاتصال…";
    el.style.opacity = rtOk ? "" : ".6";
  }
  async function syncNow() {
    if (!S.user || reloading) return;
    if (typingNow() || document.getElementById("modal-root").firstChild) { clearTimeout(reloadTimer); reloadTimer = setTimeout(syncNow, 2500); return; }
    reloading = true;
    try { await loadRoles(); await loadAll(); lastSync = Date.now(); render(true); setLive(); }
    catch (er) { console.error("[sync]", er); }
    finally { reloading = false; }
  }
  function scheduleSync() { clearTimeout(reloadTimer); reloadTimer = setTimeout(syncNow, 300); }
  function subscribeRealtime() {
    if (S.channel) sb.removeChannel(S.channel);
    rtOk = false;
    const ch = (S.channel = sb.channel("hm-live-" + Math.random().toString(36).slice(2)));
    ["customers", "orders", "documents", "user_roles", "profiles"].concat(...X("realtimeTables").filter(Array.isArray)).forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, scheduleSync)
    );
    ch.subscribe((st) => {
      if (ch !== S.channel) return;
      const ok = st === "SUBSCRIBED";
      if (ok && !rtOk) scheduleSync(); // استرجعنا الاتصال ← حدّث ما فاتنا
      rtOk = ok; setLive();
      if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") setTimeout(() => { if (S.user && ch === S.channel) subscribeRealtime(); }, 4000);
    });
  }
  setInterval(() => {
    if (!S.user || document.hidden) return;
    // الاتصال اللحظي سليم: تحديث أمان كل دقيقتين. غير سليم: كل 15 ثانية.
    if (Date.now() - lastSync > (rtOk ? 120000 : 15000)) syncNow();
  }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.user && Date.now() - lastSync > 20000) { if (!rtOk) subscribeRealtime(); syncNow(); } });
  window.addEventListener("online", () => { if (S.user) { subscribeRealtime(); syncNow(); } });

  async function loadRoles() {
    const { data } = await sb.from("user_roles").select("role").eq("user_id", S.user.id);
    S.roles = (data || []).map((r) => r.role);
    const p = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
    S.profile = p.data;
  }

  // ---------- auth ----------
  function renderAuth(mode) {
    mode = mode || "in";
    app.innerHTML = `
    <div class="auth">
      <div class="auth-side">${logoSVG(260)}<h1>هوم ماربل</h1><p>نظام إداري وتشغيلي متكامل للمعارض والمصنع والمبيعات — كل التحديثات تظهر لحظياً لجميع أصحاب الصلاحية.</p></div>
      <div class="auth-form"><div class="auth-card">
        <h2>${mode === "in" ? "تسجيل الدخول" : mode === "up" ? "إنشاء حساب موظف" : "استعادة كلمة المرور"}</h2>
        <p class="sub">${mode === "reset" ? "أدخل بريدك وسنرسل لك رابط الاستعادة" : "مرحباً بك في نظام هوم ماربل"}</p>
        ${mode !== "reset" ? `<div class="tabs"><button data-mode="in" class="${mode === "in" ? "on" : ""}">دخول</button><button data-mode="up" class="${mode === "up" ? "on" : ""}">حساب جديد</button></div>` : ""}
        <form id="authf">
          ${mode === "up" ? `<div class="field"><label>الاسم الكامل</label><input class="input" name="full_name" required></div>` : ""}
          <div class="field"><label>البريد الإلكتروني</label><input class="input" type="email" name="email" required dir="ltr"></div>
          ${mode !== "reset" ? `<div class="field"><label>كلمة المرور</label><input class="input" type="password" name="password" minlength="6" required dir="ltr"></div>` : ""}
          <button class="btn btn-primary btn-block" type="submit">${mode === "in" ? "دخول" : mode === "up" ? "إنشاء الحساب" : "إرسال الرابط"}</button>
        </form>
        <p style="margin-top:16px;text-align:center;font-size:14px">${mode === "reset" ? `<a data-mode="in">العودة لتسجيل الدخول</a>` : `<a data-mode="reset">نسيت كلمة المرور؟</a>`}</p>
      </div></div>
    </div>`;
    app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => renderAuth(b.dataset.mode)));
    $("#authf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = formData(e.target); const btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        if (mode === "in") {
          const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
          if (error) throw error;
        } else if (mode === "up") {
          const { error } = await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.full_name }, ...(location.protocol.startsWith("http") ? { emailRedirectTo: location.href.split("#")[0] } : {}) } });
          if (error) throw error;
          toast("تم إنشاء الحساب وتسجيل الدخول", "ok");
        } else {
          const { error } = await sb.auth.resetPasswordForEmail(f.email, { redirectTo: location.href.split("#")[0] + "#/reset-password" });
          if (error) throw error;
          toast("تم إرسال رابط الاستعادة إلى بريدك", "ok");
        }
      } catch (er) { toast(errMsg(er), "err"); }
      btn.disabled = false;
    });
    X("authRendered", mode);
  }

  function renderResetPassword() {
    app.innerHTML = `<div class="pending"><div class="card"><h2 style="color:var(--brand-dark);margin-bottom:14px">تعيين كلمة مرور جديدة</h2>
    <form id="rp"><div class="field"><label>كلمة المرور الجديدة</label><input class="input" type="password" name="password" minlength="6" required dir="ltr"></div><button class="btn btn-primary btn-block">حفظ</button></form></div></div>`;
    $("#rp").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: formData(e.target).password });
      if (error) return toast(errMsg(error), "err");
      toast("تم تحديث كلمة المرور", "ok"); location.hash = "#/"; boot();
    });
  }

  function renderPending() {
    app.innerHTML = `<div class="pending"><div class="card">${logoSVG(180)}<h2 style="margin:20px 0 8px;color:var(--brand-dark)">حسابك بانتظار التفعيل</h2>
    <p style="color:var(--muted)">تم تسجيل حسابك (${esc(S.user.email)}). سيقوم مدير النظام بتحديد وظيفتك وصلاحياتك، وستظهر لك الشاشة تلقائياً فور التفعيل.</p>
    <button class="btn btn-ghost mt" id="lo">${icon("logout", 18)} تسجيل الخروج</button></div></div>`;
    $("#lo").onclick = () => sb.auth.signOut();
    X("pendingRendered");
  }

  // ---------- shell ----------
  function navItems() {
    const n = [["", "الرئيسية", "home"]];
    n.push(["customers", "العملاء", "users"]);
    n.push(["orders", "الطلبات والمشاريع", "orders"]);
    n.push(["docs/quote", "العروض والأسعار", "quote"]);
    n.push(["docs/design", "التصاميم", "design"]);
    n.push(["docs/contract", "العقود", "contract"]);
    n.push(["docs/measurement", "المقاسات", "ruler"]);
    n.push(["docs/sample", "طلب عينات", "layers"]);
    n.push(["docs/receipt", "الفواتير والدفعات", "receipt"]);
    if (isMgr()) { n.push(["sep"]); n.push(["users", "المستخدمون والصلاحيات", "shield"]); n.push(["audit", "سجل العمليات", "log"]); }
    X("nav", n);
    if (window.HM_PERM) return n.filter((i) => i[0] === "sep" || window.HM_PERM.navOk(i[0]));
    return n;
  }
  function alertsList() {
    const a = [];
    // تنبيهات كل قسم تظهر لأصحاب القسم فقط (مبيعات/محاسبة/إدارة) — وليس لكل الموظفين
    const sellers = canSell();
    const due = sellers ? S.orders.filter((o) => paidFor(o.id) < Number(o.required_deposit) && o.status !== "completed").length : 0;
    const pendingContracts = sellers ? S.orders.filter((o) => !o.contract_approved).length : 0;
    const readyToSend = sellers ? S.orders.filter((o) => !o.sent_to_factory_at && o.contract_approved && paidFor(o.id) >= Number(o.required_deposit)).length : 0;
    const meas = sellers || has("factory_manager") ? S.documents.filter((x) => x.kind === "measurement" && x.status !== "done").length : 0;
    if (pendingContracts) a.push(["a-orange", "contract", "مراجعة عقود بانتظار اعتماد", pendingContracts, "orders"]);
    if (due) a.push(["a-red", "coins", "دفعات مقدمة مستحقة من عملاء", due, "orders"]);
    if (readyToSend) a.push(["a-blue", "factory", "طلبات جاهزة للإرسال للمصنع", readyToSend, "orders"]);
    if (meas) a.push(["a-orange", "ruler", "طلبات قياس مفتوحة", meas, "docs/measurement"]);
    X("alerts", a);
    return a;
  }
  // ---- المشاهَد من التنبيهات: يُخفى من العدّاد ويُنقل لأسفل تحت «تمت مشاهدتها» (يعود كجديد إذا تغيّر عدده)
  const alSeenKey = () => "hm_alseen_" + (S.user && S.user.id);
  const alSig = (x) => x[2] + "#" + x[3];
  const alSeen = () => { try { return JSON.parse(localStorage.getItem(alSeenKey()) || "[]"); } catch (e) { return []; } };
  const alMark = (sigs) => { try { localStorage.setItem(alSeenKey(), JSON.stringify(Array.from(new Set(alSeen().concat(sigs))).slice(-300))); } catch (e) {} };
  function alSplit() { const all = alertsList(), sn = alSeen(); return { fresh: all.filter((x) => !sn.includes(alSig(x))), old: all.filter((x) => sn.includes(alSig(x))) }; }
  const alRow = (a, sz) => `<div class="alert ${a[0]}" data-go="${a[4]}" data-sig="${esc(alSig(a))}">${icon(a[1], sz)}${a[2]}<span class="n">${a[3]}</span></div>`;
  function alHtml(sz, empty) {
    const { fresh, old } = alSplit();
    if (!fresh.length && !old.length) return `<div class="empty">${empty}</div>`;
    return (fresh.length ? `<div class="alerts">${fresh.map((a) => alRow(a, sz)).join("")}</div>` : `<div class="empty">لا توجد تنبيهات جديدة 👌</div>`)
      + (old.length ? `<details class="al-seen"><summary>تمت مشاهدتها (${old.length})</summary><div class="alerts">${old.map((a) => alRow(a, sz)).join("")}</div></details>` : "");
  }
  function alBind(root) {
    (root || document).querySelectorAll("[data-go]").forEach((x) => (x.onclick = () => { if (x.dataset.sig) alMark([x.dataset.sig]); closeModal(); location.hash = "#/" + x.dataset.go; }));
  }

  function shell(inner) {
    const r = S.route.split("/")[0];
    const sub = S.route;
    const name = (S.profile && S.profile.full_name) || S.user.email;
    const al = alertsList();
    return `<div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><div class="mark">${logoSVG(46)}</div><div><b>هوم ماربل</b><small>Home Marble</small></div></div>
        <nav class="nav">${navItems().map((n) => n[0] === "sep" ? '<div class="sep"></div>' : `<a href="#/${n[0]}" class="${(n[0] === sub || (n[0] && n[0] === r && !n[0].includes("/"))) || (n[0] === "" && sub === "") ? "on" : ""}">${icon(n[2])}${n[1]}</a>`).join("")}</nav>
        <div class="side-foot">${XS("footer") || "المرحلة الأولى · الأساس والمبيعات"}</div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="burger" id="burger">${icon("menu", 24)}</button>
          <div class="gsearch">${icon("search", 18)}<input class="input" id="gs" placeholder="ابحث عن عميل، رقم طلب، فاتورة أو جوال..." autocomplete="off"><div class="gresults" id="gr" hidden></div></div>
          <div class="top-spacer"></div>
          ${XS("topbar")}
          <span class="live"><i></i> مباشر</span>
          <button class="bell" id="bell">${icon("bell", 22)}${(() => { const f = alSplit().fresh; return f.length ? `<span class="dot">${f.reduce((a, b) => a + b[3], 0)}</span>` : ""; })()}</button>
          <div class="me"><div class="avatar">${esc(name.trim()[0] || "؟")}</div><div><b>${esc(ROLE_LABEL[S.roles[0]] || "")}</b><small>${esc(name)}${S.profile && S.profile.branch_id ? " · " + esc(branchName(S.profile.branch_id)) : ""}</small></div></div>
          <button class="btn btn-ghost btn-sm" id="lo" title="خروج">${icon("logout", 18)}</button>
        </header>
        <main class="content">${inner}</main>
      </div></div>`;
  }

  function bindShell() {
    $("#lo").onclick = () => sb.auth.signOut();
    $("#burger").onclick = () => $("#sidebar").classList.toggle("open");
    $("#bell").onclick = () => {
      const ov = modal("المهام والتنبيهات", alHtml(20, "لا توجد تنبيهات") + (alSplit().fresh.length ? '<div style="margin-top:10px;text-align:left"><button class="btn btn-ghost btn-sm" id="al-allseen">تعليم الكل كمشاهَد</button></div>' : ""));
      alBind(ov);
      const b = ov.querySelector("#al-allseen"); if (b) b.onclick = () => { alMark(alertsList().map(alSig)); closeModal(); render(true); };
    };
    const gs = $("#gs"), gr = $("#gr");
    gs.addEventListener("input", () => {
      const q = gs.value.trim().toLowerCase();
      if (!q) { gr.hidden = true; return; }
      const res = [];
      S.customers.forEach((c) => { if ((c.name + " " + (c.phone || "")).toLowerCase().includes(q)) res.push([`#/customer/${c.id}`, c.name, "عميل · " + (c.phone || "")]); });
      S.orders.forEach((o) => { const c = cust(o.customer_id); if ((String(o.order_no) + " " + o.work_type + " " + (c.name || "")).toLowerCase().includes(q)) res.push([`#/order/${o.id}`, `طلب #${o.order_no} — ${c.name || ""}`, o.work_type]); });
      S.documents.forEach((x) => { if ((String(x.doc_no) + " " + x.title).toLowerCase().includes(q)) res.push([`#/doc/${x.id}`, `${DOC[x.kind][0]} #${x.doc_no}`, x.title]); });
      X("search", q, res);
      gr.innerHTML = res.slice(0, 15).map((r) => `<a href="${r[0]}"><span>${esc(r[1])}</span><span class="kind">${esc(r[2])}</span></a>`).join("") || '<div class="empty">لا توجد نتائج</div>';
      gr.hidden = false;
    });
    gs.addEventListener("blur", () => setTimeout(() => (gr.hidden = true), 200));
  }

  // ---------- charts ----------
  function donut(parts, total, label) {
    const R = 70, C = 2 * Math.PI * R; let off = 0;
    const segs = parts.filter((p) => p.v > 0).map((p) => { const len = (p.v / (total || 1)) * C; const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${p.c}" stroke-width="26" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`; off += len; return s; }).join("");
    return `<svg width="180" height="180" viewBox="0 0 180 180"><circle r="${R}" cx="90" cy="90" fill="none" stroke="#f1eaea" stroke-width="26"/>${segs}<text x="90" y="88" text-anchor="middle" font-size="30" font-weight="800" fill="#2a1a1b">${total}</text><text x="90" y="112" text-anchor="middle" font-size="12" fill="#7b6b6c">${label}</text></svg>`;
  }
  function bars(groups, series) {
    const W = 320, H = 200, pad = 34;
    const max = Math.max(1, ...groups.flatMap((g) => g.vals));
    const gw = (W - pad) / groups.length, bw = Math.min(26, gw / (series.length + 1));
    let out = "";
    for (let i = 0; i <= 3; i++) { const y = H - 24 - ((H - 40) * i) / 3; out += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#f1eaea"/><text x="${pad - 6}" y="${y + 4}" font-size="10" text-anchor="end" fill="#7b6b6c">${Math.round((max * i) / 3 / 1000)}K</text>`; }
    groups.forEach((g, gi) => {
      g.vals.forEach((v, si) => { const h = ((H - 40) * v) / max; const x = pad + gi * gw + (gw - bw * series.length) / 2 + si * bw; out += `<rect x="${x}" y="${H - 24 - h}" width="${bw - 3}" height="${h}" rx="2" fill="${series[si].c}"><title>${money(v)}</title></rect>`; });
      out += `<text x="${pad + gi * gw + gw / 2}" y="${H - 6}" font-size="11" text-anchor="middle" fill="#7b6b6c">${g.label}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%">${out}</svg><ul class="legend" style="flex-direction:row;gap:16px;justify-content:center">${series.map((s) => `<li><span class="dot" style="background:${s.c}"></span>${s.n}</li>`).join("")}</ul>`;
  }

  // ---------- pages ----------
  function ordersTable(list, cols) {
    cols = cols || ["no", "cust", "branch", "type", "value", "status", "date"];
    const H = { no: "رقم الطلب", cust: "اسم العميل", branch: "الفرع", type: "نوع العمل", value: "القيمة", status: "الحالة", date: "تاريخ التحديث" };
    if (!list.length) return '<div class="empty">لا توجد طلبات</div>';
    return `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th>${H[c]}</th>`).join("")}</tr></thead><tbody>${list.map((o) => `<tr class="click" data-href="#/order/${o.id}">${cols.map((c) => `<td>${c === "no" ? o.order_no : c === "cust" ? esc(cust(o.customer_id).name) : c === "branch" ? esc(cityOf(o.branch_id)) : c === "type" ? esc(o.work_type) : c === "value" ? money(o.total_value) : c === "status" ? badge(o.status) : d(o.updated_at)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function pageDashboard() {
    if (!isMgr() && has("factory_manager") && !has("sales")) return `<div class="page-head"><div><h1>الرئيسية</h1><div class="sub">آخر التحديثات</div></div></div>${XS("dashboard", S.filter || { branch: "", from: "", to: "" })}`;
    if (!isMgr()) return pageSalesHome();
    const f = S.filter || { branch: "", from: "", to: "" };
    const inRange = (t) => (!f.from || t >= f.from) && (!f.to || t <= f.to + "T23:59");
    const orders = S.orders.filter((o) => (!f.branch || o.branch_id === f.branch) && inRange(o.created_at));
    const receipts = S.documents.filter((x) => x.kind === "receipt" && inRange(x.created_at) && (!f.branch || (S.orders.find((o) => o.id === x.order_id) || cust(x.customer_id)).branch_id === f.branch));
    const revenue = receipts.reduce((a, b) => a + Number(b.amount), 0);
    const pipeline = orders.reduce((a, b) => a + Number(b.total_value), 0);
    const quotes = S.documents.filter((x) => x.kind === "quote" && inRange(x.created_at));
    const cnt = (s) => orders.filter((o) => o.status === s).length;
    const parts = Object.keys(STATUS).map((k) => ({ k, v: cnt(k), c: STATUS[k][2] }));
    const months = []; const now = new Date();
    for (let i = 2; i >= 0; i--) { const m = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(m); }
    const groups = months.map((m) => ({ label: m.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long" }), vals: S.branches.map((b) => S.orders.filter((o) => o.branch_id === b.id && new Date(o.created_at).getMonth() === m.getMonth() && new Date(o.created_at).getFullYear() === m.getFullYear()).reduce((a, o) => a + Number(o.total_value), 0)) }));
    const colors = ["#3d7bd6", "#2f9e5b", "#ef9a3c", "#7e1416"];
    const late = orders.filter((o) => !o.sent_to_factory_at && (Date.now() - new Date(o.created_at)) / 864e5 > 14).length;
    const al = alertsList();
    const conv = quotes.length ? Math.round((quotes.filter((q) => q.status === "approved").length / quotes.length) * 100) : 0;
    const contractRate = orders.length ? Math.round((orders.filter((o) => o.contract_approved).length / orders.length) * 100) : 0;
    const collectRate = pipeline ? Math.min(100, Math.round((revenue / pipeline) * 100)) : 0;

    return `<div class="page-head"><div><h1>نظرة عامة</h1><div class="sub">مؤشرات هوم ماربل لحظة بلحظة</div></div>
      <div class="filters"><select class="input" id="fb"><option value="">جميع الفروع</option>${S.branches.map((b) => `<option value="${b.id}" ${f.branch === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      <input type="date" class="input" id="ff" value="${f.from}"><input type="date" class="input" id="ft" value="${f.to}"></div></div>
    <div class="grid g4">
      <div class="card"><div class="kpi"><div><div class="lbl">إجمالي الطلبات</div><div class="val">${orders.length}</div><div class="unit">طلب</div></div><div class="ico">${icon("orders", 26)}</div></div>
        <ul class="legend">${[["design", "قيد التصميم"], ["manufacturing", "قيد التنفيذ"], ["ready_install", "جاهز للتركيب"], ["completed", "مكتمل"]].map((s) => `<li><span class="dot" style="background:${STATUS[s[0]][2]}"></span>${s[1]}<b>${cnt(s[0])}</b></li>`).join("")}<li><span class="dot" style="background:var(--red)"></span>متأخر<b style="color:var(--red)">${late}</b></li></ul></div>
      <div class="card"><div class="kpi"><div><div class="lbl">قيمة المشاريع</div><div class="val">${money(pipeline)}</div><div class="unit">ريال سعودي</div></div><div class="ico">${icon("coins", 26)}</div></div><div class="kpi-foot">إجمالي قيمة الطلبات المسجلة</div></div>
      <div class="card"><div class="kpi"><div><div class="lbl">المحصّل</div><div class="val">${money(revenue)}</div><div class="unit">ريال سعودي</div></div><div class="ico">${icon("receipt", 26)}</div></div><div class="kpi-foot"><span class="up">${collectRate}%</span> نسبة التحصيل من قيمة المشاريع</div></div>
      <div class="card"><div class="kpi"><div><div class="lbl">المتبقي على العملاء</div><div class="val">${money(Math.max(0, pipeline - revenue))}</div><div class="unit">ريال سعودي</div></div><div class="ico">${icon("cart", 26)}</div></div><div class="kpi-foot">${S.customers.length} عميل مسجل · ${quotes.length} عرض سعر</div></div>
    </div>
    <div class="grid g3 mt">
      <div class="card"><div class="card-head"><h3>مبيعات الفروع</h3></div>${bars(groups, S.branches.map((b, i) => ({ n: b.city, c: colors[i % 4] })))}</div>
      <div class="card"><div class="card-head"><h3>حالة الطلبات</h3></div><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center">${donut(parts, orders.length, "إجمالي الطلبات")}<ul class="legend" style="min-width:150px">${parts.map((p) => `<li><span class="dot" style="background:${p.c}"></span>${STATUS[p.k][0]}<b>${p.v}</b></li>`).join("")}</ul></div></div>
      <div class="card"><div class="card-head"><h3>أداء الأقسام</h3></div>
        ${[["العروض المعتمدة", conv, "#2f9e5b"], ["توقيع العقود", contractRate, "#c98a6a"], ["التحصيل", collectRate, "#e2c9a8"]].map((x) => `<div class="hbar"><span>${x[0]}</span><div class="track"><div class="fill" style="width:${x[1]}%;background:${x[2]}"></div></div><b>${x[1]}%</b></div>`).join("")}</div>
    </div>
    <div class="grid g-wide mt">
      <div class="card"><div class="card-head"><h3>أحدث الطلبات</h3><a href="#/orders">عرض الكل</a></div>${ordersTable(orders.slice(0, 6))}</div>
      <div class="card"><div class="card-head"><h3>المهام والتنبيهات</h3>${alSplit().fresh.length ? `<span class="badge b-red">${alSplit().fresh.length}</span>` : ""}</div>${alHtml(18, "لا توجد تنبيهات 👌")}</div>
    </div>${XS("dashboard", f)}`;
  }

  function pageSalesHome() {
    const mine = S.orders.filter((o) => !S.profile || !S.profile.branch_id || o.branch_id === S.profile.branch_id);
    const upcoming = S.documents.filter((x) => (x.kind === "measurement") && x.scheduled_date).sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1)).slice(0, 5);
    const tiles = [["new-customer", "عميل جديد", "userPlus"], ["new-doc:quote", "عرض سعر", "quote"], ["new-doc:design", "تصميم", "design"], ["new-doc:contract", "عقد جديد", "contract"], ["new-doc:measurement", "طلب مقاس", "ruler"], ["new-order", "رفع أوردر", "file"], ["new-doc:sample", "طلب عينات", "layers"], ["go:docs/measurement", "جدول القياسات", "calendar"], ["go:customers", "متابعة العملاء", "users"], ["new-doc:receipt", "الفواتير والدفعات", "receipt"]];
    return `<div class="page-head"><h1>الرئيسية</h1></div>
      <div class="tiles">${tiles.map((t) => `<div class="tile" data-act="${t[0]}">${icon(t[2], 36)}${t[1]}</div>`).join("")}</div>
      <div class="card mt"><div class="card-head"><h3>${icon("store")} طلباتي الحالية</h3><a href="#/orders">عرض الكل</a></div>${ordersTable(mine.slice(0, 6), ["no", "cust", "type", "status", "date"])}</div>
      <div class="grid g2 mt">
        <div class="card"><div class="card-head"><h3>${icon("users")} آخر العملاء المضافين</h3><a href="#/customers">عرض الكل</a></div>
          <div class="tbl-wrap"><table><thead><tr><th>الاسم</th><th>رقم الجوال</th><th>المدينة</th></tr></thead><tbody>${S.customers.slice(0, 5).map((c) => `<tr class="click" data-href="#/customer/${c.id}"><td>${esc(c.name)}</td><td dir="ltr" style="text-align:right">${esc(c.phone)}</td><td>${esc(c.city)}</td></tr>`).join("")}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon("calendar")} مواعيد القياس القادمة</h3><a href="#/docs/measurement">عرض الكل</a></div>
          ${upcoming.length ? `<div class="tbl-wrap"><table><thead><tr><th>التاريخ</th><th>العميل</th><th>الحالة</th></tr></thead><tbody>${upcoming.map((x) => `<tr class="click" data-href="#/doc/${x.id}"><td>${d(x.scheduled_date)}</td><td>${esc(cust(x.customer_id).name)}</td><td>${dbadge(x.status)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">لا توجد مواعيد</div>'}</div>
      </div>`;
  }

  function pageCustomers() {
    const q = (S.cq || "").toLowerCase();
    const list = S.customers.filter((c) => !q || (c.name + (c.phone || "") + (c.city || "") + (c.customer_type === "company" ? "شركة" : "فرد") + (c.contact_person || "")).toLowerCase().includes(q));
    return `<div class="page-head"><div><h1>العملاء</h1><div class="sub">${S.customers.length} عميل مسجل</div></div>
      <div class="filters"><input class="input" id="cq" placeholder="بحث بالاسم أو الجوال" value="${esc(S.cq || "")}">${XS("customersTools")}${canSell() ? `<button class="btn btn-primary" data-act="new-customer">${icon("plus", 18)} عميل جديد</button>` : ""}</div></div>
      <div class="card"><div class="tbl-wrap"><table><thead><tr><th>الاسم</th><th>النوع</th><th>الجوال</th><th>المدينة</th><th>الفرع</th><th>الطلبات</th><th>تاريخ الإضافة</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="click" data-href="#/customer/${c.id}"><td><b>${esc(c.name)}</b></td><td><span class="badge ${c.customer_type === "company" ? "b-blue" : "b-gray"}">${c.customer_type === "company" ? "شركة" : "فرد"}</span></td><td dir="ltr" style="text-align:right">${esc(c.phone)}</td><td>${esc(c.city)}</td><td>${esc(branchName(c.branch_id))}</td><td>${S.orders.filter((o) => o.customer_id === c.id).length}</td><td>${d(c.created_at)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">لا توجد نتائج</td></tr>'}
      </tbody></table></div></div>`;
  }

  function docsTable(list, showCust) {
    if (!list.length) return '<div class="empty">لا توجد مستندات</div>';
    return `<div class="tbl-wrap"><table><thead><tr><th>الرقم</th><th>النوع</th><th>العنوان</th>${showCust ? "<th>العميل</th>" : ""}<th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${list.map((x) => `<tr class="click" data-href="#/doc/${x.id}"><td>${x.doc_no}</td><td>${DOC[x.kind][0]}</td><td>${esc(x.title)}</td>${showCust ? `<td>${esc(cust(x.customer_id).name)}</td>` : ""}<td>${money(x.amount)}</td><td>${dbadge(x.status)}</td><td>${d(x.scheduled_date || x.created_at)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function pageCustomer(id) {
    const c = cust(id); if (!c.id) return '<div class="empty">العميل غير موجود</div>';
    const orders = S.orders.filter((o) => o.customer_id === id);
    const docs = S.documents.filter((x) => x.customer_id === id);
    const total = orders.reduce((a, b) => a + Number(b.total_value), 0);
    const paid = docs.filter((x) => x.kind === "receipt").reduce((a, b) => a + Number(b.amount), 0);
    const tab = S.ctab || "orders";
    const tabs = [["orders", "سجل الطلبات"], ["contract", "العقود"], ["invoice", "الفواتير"], ["receipt", "الدفعات"], ["design", "التصاميم"], ["quote", "عروض الأسعار"], ["measurement", "المقاسات"]];
    return `<div class="page-head"><div><h1>${esc(c.name)}</h1><div class="sub">الملف الإلكتروني الموحد للعميل</div></div>
      <div class="filters">${canSell() ? `<button class="btn btn-ghost" data-act="edit-customer" data-id="${c.id}">${icon("edit", 18)} تعديل</button><button class="btn btn-primary" data-act="new-order" data-cust="${c.id}">${icon("plus", 18)} طلب جديد</button><button class="btn btn-line" data-act="new-doc:quote" data-cust="${c.id}">عرض سعر</button>` : ""}${isMgr() ? `<button class="btn btn-danger" data-act="del-customer" data-id="${c.id}">${icon("trash", 18)}</button>` : ""}</div></div>
      <div class="grid g-wide">
        <div class="card"><div class="card-head"><h3>بيانات التواصل</h3></div><dl class="kv"><dt>نوع العميل</dt><dd><span class="badge ${c.customer_type === "company" ? "b-blue" : "b-gray"}">${c.customer_type === "company" ? "شركة" : "فرد"}</span></dd>${c.customer_type === "company" ? `<dt>الشخص المسؤول</dt><dd>${esc(c.contact_person) || "—"}</dd><dt>السجل التجاري</dt><dd dir="ltr" style="text-align:right">${esc(c.cr_no) || "—"}</dd><dt>الرقم الضريبي</dt><dd dir="ltr" style="text-align:right">${esc(c.tax_no) || "—"}</dd>` : ""}<dt>الجوال</dt><dd dir="ltr" style="text-align:right">${esc(c.phone) || "—"}</dd><dt>البريد</dt><dd>${esc(c.email) || "—"}</dd><dt>المدينة</dt><dd>${esc(c.city) || "—"}</dd><dt>العنوان</dt><dd>${esc(c.address) || "—"}</dd><dt>الفرع</dt><dd>${esc(branchName(c.branch_id))}</dd><dt>ملاحظات</dt><dd>${esc(c.notes) || "—"}</dd></dl></div>
        <div class="card"><div class="card-head"><h3>الملخص المالي</h3></div><dl class="kv"><dt>عدد الطلبات</dt><dd>${orders.length}</dd><dt>إجمالي القيمة</dt><dd>${money(total)} ر.س</dd><dt>المدفوع</dt><dd style="color:var(--green)">${money(paid)} ر.س</dd><dt>المتبقي</dt><dd style="color:var(--red)">${money(Math.max(0, total - paid))} ر.س</dd></dl></div>
      </div>
      <div class="card mt"><div class="tabbar">${tabs.map((t) => `<button data-ctab="${t[0]}" class="${tab === t[0] ? "on" : ""}">${t[1]}</button>`).join("")}</div>
        ${tab === "orders" ? ordersTable(orders, ["no", "type", "value", "status", "date"]) : docsTable(docs.filter((x) => x.kind === tab))}</div>${XS("customerSection", c)}`;
  }

  function pageOrders() {
    const f = S.of || "";
    const list = S.orders.filter((o) => !f || o.status === f);
    return `<div class="page-head"><div><h1>الطلبات والمشاريع</h1><div class="sub">متابعة الطلبات من التصميم حتى التسليم</div></div>
      <div class="filters"><select class="input" id="of"><option value="">كل الحالات</option>${Object.keys(STATUS).map((k) => `<option value="${k}" ${f === k ? "selected" : ""}>${STATUS[k][0]}</option>`).join("")}</select>${canSell() ? `<button class="btn btn-primary" data-act="new-order">${icon("plus", 18)} رفع أوردر</button>` : ""}</div></div>
      <div class="card">${ordersTable(list)}</div>`;
  }

  function pageOrder(id) {
    const o = S.orders.find((x) => x.id === id); if (!o) return '<div class="empty">الطلب غير موجود</div>';
    const c = cust(o.customer_id);
    const docs = S.documents.filter((x) => x.order_id === id);
    const paid = paidFor(id);
    const depOk = paid >= Number(o.required_deposit);
    const ready = o.contract_approved && depOk; // v5.4: اعتماد العقد وحده كافٍ
    const pct = Number(o.total_value) ? Math.min(100, Math.round((paid / Number(o.total_value)) * 100)) : 0;
    const sent = !!o.sent_to_factory_at;
    const row = (ok, label, sub, act) => `<div class="gate-row"><span class="st ${ok ? "ok" : "no"}">${icon(ok ? "check" : "x", 16)}</span><div><b>${label}</b><div style="font-size:13px;color:var(--muted)">${sub}</div></div><div class="act">${act || ""}</div></div>`;
    return `<div class="page-head"><div><h1>طلب #${o.order_no} — ${esc(o.work_type)}</h1><div class="sub"><a href="#/customer/${c.id}">${esc(c.name)}</a> · ${esc(branchName(o.branch_id))} · ${badge(o.status)}</div></div>
      <div class="filters">${canSell() ? `<button class="btn btn-ghost" data-act="edit-order" data-id="${o.id}">${icon("edit", 18)} تعديل</button><button class="btn btn-line" data-act="new-doc:receipt" data-cust="${c.id}" data-order="${o.id}">${icon("receipt", 18)} سند قبض</button>` : ""}${isMgr() ? `<button class="btn btn-danger" data-act="del-order" data-id="${o.id}">${icon("trash", 18)}</button>` : ""}</div></div>
      <div class="grid g-wide">
        <div class="card"><div class="card-head"><h3>${icon("factory")} ضوابط الإرسال للمصنع</h3>${sent ? `<span class="badge b-green">أُرسل ${d(o.sent_to_factory_at)}</span>` : ""}</div>
          <div class="gate">
            ${row(o.contract_approved, "اعتماد العقد", o.contract_approved ? "تم توقيع واعتماد العقد" : "العقد بانتظار الاعتماد", canSell() && !sent ? `<button class="btn btn-sm ${o.contract_approved ? "btn-line" : "btn-success"}" data-toggle="contract_approved">${o.contract_approved ? "إلغاء" : "اعتماد"}</button>` : "")}
            ${row(depOk, "الدفعة المقدمة", `المطلوب ${money(o.required_deposit)} ر.س · المدفوع ${money(paid)} ر.س`, "")}
          </div>
          ${sent ? "" : `<button class="btn ${ready ? "btn-primary" : "btn-line"} btn-block mt" id="send-factory" ${ready && canSell() ? "" : "disabled"}>${icon("factory", 18)} إرسال الطلب للمصنع</button>${ready ? "" : '<p style="font-size:13px;color:var(--muted);margin-top:8px;text-align:center">لا يُرسل الطلب للمصنع إلا بعد اعتماد العقد وتحقق الدفعة المقدمة المطلوبة.</p>'}`}
        </div>
        <div class="card"><div class="card-head"><h3>تفاصيل الطلب</h3></div><dl class="kv"><dt>قيمة الطلب</dt><dd>${money(o.total_value)} ر.س</dd><dt>الدفعة المطلوبة</dt><dd>${money(o.required_deposit)} ر.س</dd><dt>المتبقي</dt><dd style="color:var(--red)">${money(Math.max(0, o.total_value - paid))} ر.س</dd><dt>تاريخ الإنشاء</dt><dd>${d(o.created_at)}</dd><dt>الوصف</dt><dd style="white-space:pre-wrap">${esc(o.description) || "—"}</dd></dl>
          <div style="margin-top:14px;font-size:13px">نسبة السداد ${pct}%<div class="progress"><div style="width:${pct}%"></div></div></div>
          ${isMgr() || has("factory_manager") ? `<div class="field mt"><label>تحديث الحالة</label><select class="input" id="ost">${Object.keys(STATUS).map((k) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${STATUS[k][0]}</option>`).join("")}</select></div>` : ""}
        </div>
      </div>
      <div class="card mt"><div class="card-head"><h3>مستندات الطلب</h3>${canSell() ? `<div class="filters">${["quote", "design", "contract", "measurement", "invoice"].map((k) => `<button class="btn btn-ghost btn-sm" data-act="new-doc:${k}" data-cust="${c.id}" data-order="${o.id}">+ ${DOC[k][0]}</button>`).join("")}</div>` : ""}</div>${docsTable(docs)}</div>${XS("orderSection", o)}`;
  }

  function pageDocs(kind) {
    const list = S.documents.filter((x) => x.kind === kind);
    const title = { quote: "العروض والأسعار", design: "التصاميم", contract: "العقود", measurement: "المقاسات وطلبات القياس", receipt: "الفواتير والدفعات", sample: "طلب عينات", invoice: "الفواتير" }[kind];
    const extra = kind === "receipt" ? S.documents.filter((x) => x.kind === "invoice") : [];
    return `<div class="page-head"><div><h1>${title}</h1><div class="sub">${list.length} مستند</div></div>${canSell() ? `<div class="filters"><button class="btn btn-primary" data-act="new-doc:${kind}">${icon("plus", 18)} ${kind === "receipt" ? "سند قبض جديد" : DOC[kind][0] + " جديد"}</button>${kind === "receipt" ? `<button class="btn btn-ghost" data-act="new-doc:invoice">${icon("plus", 18)} فاتورة</button>` : ""}</div>` : ""}</div>
      <div class="card">${kind === "receipt" ? '<div class="card-head"><h3>سندات القبض</h3></div>' : ""}${docsTable(list, true)}</div>
      ${kind === "receipt" ? `<div class="card mt"><div class="card-head"><h3>الفواتير</h3></div>${docsTable(extra, true)}</div>` : ""}`;
  }

  function pageDoc(id) {
    const x = S.documents.find((y) => y.id === id); if (!x) return '<div class="empty">المستند غير موجود</div>';
    const c = cust(x.customer_id); const o = S.orders.find((y) => y.id === x.order_id);
    const items = Array.isArray(x.items) ? x.items : [];
    return `<div class="page-head"><div><h1>${DOC[x.kind][0]} #${x.doc_no}</h1><div class="sub"><a href="#/customer/${c.id}">${esc(c.name)}</a>${o ? ` · <a href="#/order/${o.id}">طلب #${o.order_no}</a>` : ""} · ${dbadge(x.status)}</div></div>
      <div class="filters"><button class="btn btn-primary" data-act="print" data-id="${x.id}">${icon("print", 18)} طباعة / PDF</button>${canSell() ? `<button class="btn btn-ghost" data-act="edit-doc" data-id="${x.id}">${icon("edit", 18)} تعديل</button>` : ""}${isMgr() ? `<button class="btn btn-danger" data-act="del-doc" data-id="${x.id}">${icon("trash", 18)}</button>` : ""}</div></div>
      <div class="card"><dl class="kv"><dt>العنوان</dt><dd>${esc(x.title)}</dd><dt>المبلغ</dt><dd>${money(x.amount)} ر.س</dd>${x.scheduled_date ? `<dt>الموعد</dt><dd>${d(x.scheduled_date)}</dd>` : ""}<dt>التفاصيل</dt><dd style="white-space:pre-wrap">${esc(x.details) || "—"}</dd><dt>التاريخ</dt><dd>${d(x.created_at)}</dd></dl>
      ${x.kind === "contract" ? "" : items.length ? `<div class="tbl-wrap mt"><table><thead><tr><th>البند</th><th>النوع</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.sale_type === "meter" ? "بالمتر" : i.sale_type === "piece" ? "بالقطعة" : "—"}</td><td>${esc(i.qty)}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>
      ${x.kind === "contract" ? `<div class="card mt hmc-preview"><div class="card-head"><h3>معاينة العقد الموحد (أفقي)</h3></div><div class="hmc-scroll">${contractHtml(x)}</div></div>` : ""}${XS("docSection", x)}`;
  }

  function pageUsers() {
    if (!isMgr()) return '<div class="empty">لا تملك صلاحية</div>';
    const admin = has("admin", "executive");
    return `<div class="page-head"><div><h1>المستخدمون والصلاحيات</h1><div class="sub">حدد وظيفة وفرع كل موظف — يتم تطبيق الصلاحيات فوراً</div></div></div>
      <div class="card"><div class="tbl-wrap"><table><thead><tr><th>الاسم</th><th>البريد</th><th>الفرع</th>${Object.keys(ROLE_LABEL).map((r) => `<th title="${esc(ROLE_DESC[r] || "")}">${ROLE_LABEL[r]}</th>`).join("")}${window.HM_PERM ? "<th>صلاحيات فرعية</th>" : ""}</tr></thead><tbody>
      ${S.profiles.map((p) => { const rs = S.allRoles.filter((r) => r.user_id === p.id).map((r) => r.role); return `<tr><td><b>${esc(p.full_name)}</b>${rs.length ? "" : ' <span class="badge b-yellow">بانتظار التفعيل</span>'}</td><td dir="ltr" style="text-align:right">${esc(p.email)}</td>
        <td>${admin ? `<select class="input" data-branch="${p.id}" style="min-width:130px"><option value="">—</option>${S.branches.map((b) => `<option value="${b.id}" ${p.branch_id === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>` : esc(branchName(p.branch_id))}</td>
        ${Object.keys(ROLE_LABEL).map((r) => `<td style="text-align:center"><input type="checkbox" class="check" style="accent-color:var(--brand);width:18px;height:18px" data-role="${r}" data-uid="${p.id}" ${rs.includes(r) ? "checked" : ""} ${admin && !(p.id === S.user.id && (r === "admin" || r === "executive")) ? "" : "disabled"}></td>`).join("")}${window.HM_PERM ? `<td>${window.HM_PERM.userCell(p, rs)}</td>` : ""}</tr>`; }).join("")}
      </tbody></table></div><p style="font-size:13px;color:var(--muted);margin-top:12px">الموظف الجديد ينشئ حسابه من شاشة الدخول ← "حساب جديد"، ثم يظهر هنا لتفعيله. أول حساب في النظام يصبح مدير النظام تلقائياً.</p></div>
      ${admin ? `<div class="card mt"><div class="card-head"><h3>الفروع / المعارض</h3><button class="btn btn-ghost btn-sm" data-act="new-branch">${icon("plus", 16)} فرع جديد</button></div><div class="tbl-wrap"><table><thead><tr><th>الفرع</th><th>المدينة</th><th>العملاء</th><th>الطلبات</th></tr></thead><tbody>${S.branches.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.city)}</td><td>${S.customers.filter((c) => c.branch_id === b.id).length}</td><td>${S.orders.filter((o) => o.branch_id === b.id).length}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  }

  function pageAudit() {
    if (!isMgr()) return '<div class="empty">لا تملك صلاحية</div>';
    const T = { customers: "العملاء", orders: "الطلبات", documents: "المستندات", user_roles: "الصلاحيات" };
    X("auditLabels").forEach((m) => { if (m && typeof m === "object") Object.assign(T, m); });
    const A = { INSERT: ["إضافة", "b-green"], UPDATE: ["تعديل", "b-blue"], DELETE: ["حذف", "b-red"] };
    const desc = (l) => { const r = l.action === "UPDATE" ? (l.changes || {}).new : l.changes; if (!r) return ""; return r.name || r.title || (r.order_no ? "طلب #" + r.order_no : "") || (r.role ? ROLE_LABEL[r.role] || r.role : "") || XS("auditDesc", l.table_name, r); };
    return `<div class="page-head"><div><h1>سجل العمليات</h1><div class="sub">آخر 200 عملية مع التاريخ والمستخدم المسؤول</div></div></div>
      <div class="card"><div class="tbl-wrap"><table><thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>السجل</th></tr></thead><tbody>
      ${S.audit.map((l) => `<tr><td>${new Date(l.created_at).toLocaleString("en-GB")}</td><td>${esc(l.user_email || "النظام")}</td><td><span class="badge ${(A[l.action] || [l.action, "b-gray"])[1]}">${(A[l.action] || [l.action])[0]}</span></td><td>${T[l.table_name] || l.table_name}</td><td>${esc(desc(l))}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">لا توجد عمليات بعد</td></tr>'}
      </tbody></table></div></div>`;
  }

  // ---------- forms ----------
  const branchOpts = (sel) => S.branches.map((b) => `<option value="${b.id}" ${sel === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("");
  const custOpts = (sel) => S.customers.map((c) => `<option value="${c.id}" ${sel === c.id ? "selected" : ""}>${esc(c.name)} — ${esc(c.phone || "")}</option>`).join("");

  function customerForm(c) {
    c = c || { branch_id: S.profile && S.profile.branch_id };
    const ov = modal(c.id ? "تعديل بيانات العميل" : "إضافة عميل جديد", `<form id="mf">
      <div class="field"><label>نوع العميل *</label><div class="seg" id="ctype"><label><input type="radio" name="customer_type" value="individual" ${c.customer_type === "company" ? "" : "checked"}> فرد</label><label><input type="radio" name="customer_type" value="company" ${c.customer_type === "company" ? "checked" : ""}> شركة</label></div></div>
      <div class="grid2"><div class="field"><label id="lb-name">اسم العميل *</label><input class="input" name="name" required value="${esc(c.name)}"></div>
      <div class="field co-only"><label>الشخص المسؤول (جهة الاتصال)</label><input class="input" name="contact_person" value="${esc(c.contact_person)}"></div>
      <div class="field co-only"><label>السجل التجاري</label><input class="input" name="cr_no" dir="ltr" value="${esc(c.cr_no)}"></div>
      <div class="field co-only"><label>الرقم الضريبي</label><input class="input" name="tax_no" dir="ltr" value="${esc(c.tax_no)}"></div>
      <div class="field"><label>رقم الجوال</label><input class="input" name="phone" dir="ltr" value="${esc(c.phone)}"></div>
      <div class="field"><label>البريد</label><input class="input" name="email" type="email" dir="ltr" value="${esc(c.email)}"></div>
      <div class="field"><label>المدينة</label><input class="input" name="city" value="${esc(c.city)}"></div></div>
      <div class="field"><label>العنوان</label><input class="input" name="address" value="${esc(c.address)}"></div>
      <div class="field"><label>الفرع</label><select class="input" name="branch_id">${branchOpts(c.branch_id)}</select></div>
      <div class="field"><label>ملاحظات</label><textarea class="input" name="notes">${esc(c.notes)}</textarea></div></form>`,
      `<button class="btn btn-primary" id="save">حفظ</button><button class="btn btn-line" data-close>إلغاء</button>`);
    const syncType = () => { const co = ($("#mf", ov).customer_type.value === "company"); ov.querySelectorAll(".co-only").forEach((e) => (e.style.display = co ? "" : "none")); $("#lb-name", ov).textContent = co ? "اسم الشركة *" : "اسم العميل *"; };
    ov.querySelectorAll('input[name="customer_type"]').forEach((e) => (e.onchange = syncType)); syncType();
    $("#save", ov).onclick = async () => {
      const f = $("#mf", ov); if (!f.reportValidity()) return;
      const v = formData(f);
      if (v.customer_type !== "company") { v.contact_person = null; v.cr_no = null; v.tax_no = null; }
      const save = (val) => (c.id ? sb.from("customers").update(val).eq("id", c.id).select().single() : sb.from("customers").insert({ ...val, created_by: S.user.id }).select().single());
      let r = await save(v);
      if (r.error && /customer_type|contact_person|cr_no|tax_no/.test(r.error.message || "")) { toast("تنبيه: شغّل ملف 0004 في Supabase لحفظ نوع العميل", "err"); const { customer_type, contact_person, cr_no, tax_no, ...rest } = v; r = await save(rest); }
      if (r.error) return toast(errMsg(r.error), "err");
      closeModal(); toast("تم حفظ بيانات العميل", "ok"); await refresh(); location.hash = "#/customer/" + r.data.id;
    };
  }

  function orderForm(o, custId) {
    o = o || { customer_id: custId };
    if (!S.customers.length) return toast("أضف عميلاً أولاً", "err");
    const ov = modal(o.id ? `تعديل طلب #${o.order_no}` : "رفع أوردر جديد", `<form id="mf">
      <div class="field"><label>العميل *</label><select class="input" name="customer_id" required>${custOpts(o.customer_id)}</select></div>
      <div class="grid2"><div class="field"><label>نوع العمل *</label><input class="input" name="work_type" required list="wt" value="${esc(o.work_type)}"><datalist id="wt"><option>مطابخ رخام</option><option>مغاسل رخام</option><option>درج رخام</option><option>طاولات رخام</option><option>أعمال خشبية</option><option>غرفة ملابس</option><option>مجلس</option></datalist></div>
      <div class="field"><label>الفرع</label><select class="input" name="branch_id">${branchOpts(o.branch_id || cust(o.customer_id).branch_id || (S.profile && S.profile.branch_id))}</select></div>
      <div class="field"><label>قيمة الطلب (ر.س)</label><input class="input" type="number" step="0.01" name="total_value" value="${o.total_value || 0}"></div>
      <div class="field"><label>الدفعة المقدمة المطلوبة (ر.س)</label><input class="input" type="number" step="0.01" name="required_deposit" value="${o.required_deposit || 0}"></div></div>
      ${o.id ? "" : `<div class="field"><label>الحالة</label><select class="input" name="status">${["design", "measurement", "awaiting_contract"].map((k) => `<option value="${k}">${STATUS[k][0]}</option>`).join("")}</select></div>`}
      <div class="field"><label>الوصف والمواصفات</label><textarea class="input" name="description">${esc(o.description)}</textarea></div></form>`,
      `<button class="btn btn-primary" id="save">حفظ</button><button class="btn btn-line" data-close>إلغاء</button>`);
    const tv = $("[name=total_value]", ov), dep = $("[name=required_deposit]", ov);
    if (!o.id) tv.addEventListener("input", () => (dep.value = (Number(tv.value) * 0.5).toFixed(2)));
    $("#save", ov).onclick = async () => {
      const f = $("#mf", ov); if (!f.reportValidity()) return;
      const v = formData(f);
      const r = o.id ? await sb.from("orders").update(v).eq("id", o.id).select().single() : await sb.from("orders").insert({ ...v, created_by: S.user.id }).select().single();
      if (r.error) return toast(errMsg(r.error), "err");
      closeModal(); toast("تم حفظ الطلب", "ok"); await refresh(); location.hash = "#/order/" + r.data.id;
    };
  }

  // ======================= v5.4: المستندات (عرض سعر مرتبط بالمخزن + عقد موحد أفقي) =======================
  const FILES = () => window.HM_FILES || null;
  const STOCK = () => window.HM_STOCK || null;
  const SALE_LBL = { piece: "قطعة", meter: "متر" };
  const unitLbl = (i) => (i && i.sale_type ? SALE_LBL[i.sale_type] || "" : "");
  const itemTotal = (i) => Number(i.qty || 0) * Number(i.price || 0);
  const CT_FIELDS = [["material", "نوع الخامة / الرخام"], ["color", "اللون"], ["thickness", "السماكة"], ["finish", "التشطيب"], ["dimensions", "الأبعاد / المقاسات"], ["area", "المساحة الإجمالية (م²)"], ["delivery", "مدة التنفيذ / موعد التسليم"], ["install", "ملاحظات التركيب"]];
  const CT_TERMS = "1. يلتزم الطرف الثاني بسداد الدفعة المقدمة عند توقيع العقد.\n2. تبدأ مدة التنفيذ من تاريخ استلام الدفعة المقدمة واعتماد المقاسات النهائية.\n3. أي تعديل بعد اعتماد التصميم والمقاسات يخضع لموافقة الطرفين وقد يترتب عليه تكلفة إضافية.\n4. الرخام مادة طبيعية، وقد تختلف العروق والدرجات اللونية قليلاً عن العينة المعتمدة ولا يُعد ذلك عيباً.\n5. يتم التسليم والتركيب وفق الجدول المتفق عليه بين الطرفين.";
  const CT_CSS = `.hmc{font-family:Tajawal,sans-serif;color:#2a1a1b;font-size:13px;line-height:1.6;background:#fff}
  .hmc-head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2a1a1b;padding-bottom:8px}
  .hmc-brand{text-align:center;color:#7e1416;font-size:13px}.hmc-title{text-align:center}.hmc-title h1{color:#7e1416;font-size:26px;margin:0}.hmc-title div{color:#7b6b6c}
  .hmc-meta{text-align:left;font-size:13px}
  .hmc-parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
  .hmc-box{border:1px solid #d9c9c8;border-radius:8px;padding:8px 12px;background:#faf5f4}.hmc-box h4{margin:0 0 4px;color:#7e1416;font-size:14px}
  .hmc-main{display:grid;grid-template-columns:1fr 1.5fr;gap:12px;margin-top:6px;page-break-inside:avoid}
  .hmc-sec{border:1px solid #d9c9c8;border-radius:8px;padding:8px 10px}.hmc-sec h4{margin:0 0 6px;color:#4a1416;font-size:14px}
  .hmc-imgs{display:flex;flex-wrap:wrap;gap:6px}.hmc-imgs img{max-width:100%;max-height:250px;object-fit:contain;border:1px solid #ece4e3;border-radius:6px;background:#fff}
  .hmc-imgs.many img{max-width:48%}.hmc-none{color:#9a8b8c;font-size:12px;padding:20px 0;text-align:center;width:100%}
  .hmc-draw{display:grid;grid-template-columns:1.25fr 1fr;gap:10px}
  .hmc-fields{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;align-content:start;font-size:12.5px}.hmc-fields dt{color:#7b6b6c;font-weight:700}.hmc-fields dd{margin:0;border-bottom:1px dotted #cfc2c1;min-height:18px}
  .hmc table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12.5px}.hmc th{background:#7e1416;color:#fff;padding:6px 8px;text-align:right}.hmc td{border-bottom:1px solid #ece4e3;padding:5px 8px}
  .hmc-tot{display:flex;gap:18px;justify-content:flex-end;margin-top:8px;font-weight:800;color:#7e1416;font-size:14px;flex-wrap:wrap}
  .hmc-terms{white-space:pre-wrap;margin-top:8px;font-size:12px}
  .hmc-sign{display:flex;justify-content:space-between;margin-top:34px}.hmc-sign div{border-top:1px solid #999;width:230px;text-align:center;padding-top:6px}
  @media (max-width:820px){.hmc-main,.hmc-draw,.hmc-parties{grid-template-columns:1fr}}`;

  (function () { const s = document.createElement("style"); s.id = "hmc-css"; s.textContent = CT_CSS; document.head.appendChild(s); })();
  function contractHtml(x, urls) {
    const c = cust(x.customer_id); const o = S.orders.find((y) => y.id === x.order_id);
    const m = x.meta || {}; const f = m.fields || {}; const items = Array.isArray(x.items) ? x.items : [];
    const total = Number(x.amount || 0); const dep = Number(m.deposit != null && m.deposit !== "" ? m.deposit : o ? o.required_deposit : 0);
    const img = (p) => (urls ? `<img src="${esc(urls[p] || "")}" alt="">` : `<img data-sp="${esc(p)}" alt="">`);
    const gal = (arr, emptyTxt) => (arr && arr.length ? `<div class="hmc-imgs ${arr.length > 1 ? "many" : ""}">${arr.map(img).join("")}</div>` : `<div class="hmc-none">${emptyTxt}</div>`);
    const co = c.customer_type === "company";
    return `<div class="hmc">
      <div class="hmc-head"><div class="hmc-brand">${logoSVG(150)}<div>Home Marble</div></div>
        <div class="hmc-title"><h1>عقد اتفاق</h1><div>${esc(x.title || "")}</div></div>
        <div class="hmc-meta"><div><b>رقم العقد:</b> ${x.doc_no || "—"}</div><div><b>التاريخ:</b> ${d(x.created_at || new Date())}</div>${o ? `<div><b>رقم الطلب:</b> ${o.order_no}</div>` : ""}</div></div>
      <div class="hmc-parties">
        <div class="hmc-box"><h4>الطرف الأول</h4><div><b>هوم ماربل</b> — ${esc(branchName(o ? o.branch_id : c.branch_id))}</div><div>الرياض – الخرج</div></div>
        <div class="hmc-box"><h4>الطرف الثاني (${co ? "شركة" : "فرد"})</h4><div><b>${esc(c.name || "—")}</b>${co && c.contact_person ? ` — المسؤول: ${esc(c.contact_person)}` : ""}</div><div>الجوال: <span dir="ltr">${esc(c.phone || "—")}</span> · المدينة: ${esc(c.city || "—")}</div>${co && (c.cr_no || c.tax_no) ? `<div>${c.cr_no ? "س.ت: " + esc(c.cr_no) : ""} ${c.tax_no ? " · ر.ض: " + esc(c.tax_no) : ""}</div>` : ""}${c.address ? `<div>العنوان: ${esc(c.address)}</div>` : ""}</div></div>
      <div class="hmc-main">
        <div class="hmc-sec"><h4>صورة التصميم المعتمد</h4>${gal(m.design_images, "لم تُرفق صورة تصميم")}</div>
        <div class="hmc-sec"><h4>الرسم الهندسي والبيانات</h4><div class="hmc-draw">${gal(m.drawing_images, "لم يُرفق رسم هندسي")}<dl class="hmc-fields">${CT_FIELDS.map((k) => `<dt>${k[1]}</dt><dd>${esc(f[k[0]] || "")}</dd>`).join("")}</dl></div></div></div>
      ${items.length ? `<table><thead><tr><th>#</th><th>البند</th><th>النوع</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${esc(unitLbl(i) ? (i.sale_type === "meter" ? "بالمتر" : "بالقطعة") : "—")}</td><td>${esc(i.qty)} ${esc(unitLbl(i))}</td><td>${money(i.price)}</td><td>${money(itemTotal(i))}</td></tr>`).join("")}</tbody></table>` : ""}
      <div class="hmc-tot"><span>إجمالي العقد: ${money(total)} ر.س</span><span>الدفعة المقدمة: ${money(dep)} ر.س</span><span>المتبقي: ${money(Math.max(0, total - dep))} ر.س</span></div>
      ${m.payment_terms ? `<div class="hmc-terms"><b>شروط الدفع:</b> ${esc(m.payment_terms)}</div>` : ""}
      ${x.details ? `<div class="hmc-terms"><b>الشروط والأحكام:</b>\n${esc(x.details)}</div>` : ""}
      <div class="hmc-sign"><div>توقيع الطرف الثاني (العميل)</div><div>ختم وتوقيع هوم ماربل</div></div></div>`;
  }
  async function printContract(x) {
    const w = window.open("", "_blank"); if (!w) return toast("اسمح بالنوافذ المنبثقة للطباعة", "err");
    const m = x.meta || {}; const paths = [].concat(m.design_images || [], m.drawing_images || []); const urls = {};
    if (paths.length) { try { const r = await sb.storage.from("hm-files").createSignedUrls(paths, 3600); (r.data || []).forEach((u) => { if (u.signedUrl) urls[u.path] = u.signedUrl; }); } catch (e) { console.error(e); } }
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عقد ${x.doc_no || ""}</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>@page{size:A4 landscape;margin:10mm}body{margin:0;padding:6px}${CT_CSS}@media print{button{display:none}}</style></head><body>${contractHtml(x, urls)}<script>var im=[].slice.call(document.images);Promise.all(im.map(function(i){return i.complete?1:new Promise(function(r){i.onload=i.onerror=r})})).then(function(){setTimeout(function(){window.print()},400)})<\/script></body></html>`);
    w.document.close();
  }

  function docForm(kind, x, custId, orderId) {
    x = x || { kind, customer_id: custId, order_id: orderId, status: kind === "measurement" ? "scheduled" : "draft", items: [] };
    const isNew = !x.id; kind = x.kind;
    if (!S.customers.length) return toast("أضف عميلاً أولاً", "err");
    const withItems = ["quote", "invoice", "contract"].includes(kind);
    const withDate = ["measurement", "sample"].includes(kind);
    const isContract = kind === "contract";
    const meta0 = x.meta || {};
    const meta = { design_images: (meta0.design_images || []).slice(), drawing_images: (meta0.drawing_images || []).slice(), fields: Object.assign({}, meta0.fields || {}), deposit: meta0.deposit, payment_terms: meta0.payment_terms || "" };
    const orderOpts = () => `<option value="">— بدون —</option>` + S.orders.filter((o) => o.customer_id === $("[name=customer_id]", ov).value).map((o) => `<option value="${o.id}" ${x.order_id === o.id ? "selected" : ""}>#${o.order_no} — ${esc(o.work_type)}</option>`).join("");
    const stk = STOCK(); const stockList = stk ? stk.list() : [];
    const defTitle = kind === "receipt" ? "دفعة مقدمة" : "";
    const ctBlock = isContract ? `
      <div class="grid2 mt"><div class="field"><label>صورة التصميم (يمكن رفع أكثر من صورة)</label><input type="file" id="ct-design" accept="image/*" multiple class="input"><div id="ct-design-list"></div></div>
      <div class="field"><label>صور الرسم الهندسي</label><input type="file" id="ct-drawing" accept="image/*" multiple class="input"><div id="ct-drawing-list"></div></div></div>
      <label style="font-size:13px;font-weight:700;color:var(--brand-dark)">بيانات بجوار الرسم الهندسي</label>
      <div class="grid2" style="margin-top:6px">${CT_FIELDS.map((k) => `<div class="field"><label>${k[1]}</label><input class="input" data-cf="${k[0]}" value="${esc(meta.fields[k[0]] || "")}"></div>`).join("")}</div>
      <div class="grid2"><div class="field"><label>الدفعة المقدمة (ر.س)</label><input class="input" type="number" step="0.01" id="ct-dep" value="${meta.deposit != null && meta.deposit !== "" ? esc(meta.deposit) : ""}" placeholder="تؤخذ من الطلب تلقائياً"></div><div class="field"><label>شروط الدفع</label><input class="input" id="ct-pay" value="${esc(meta.payment_terms)}" placeholder="مثال: 50% مقدم، 30% عند التصنيع، 20% عند التسليم"></div></div>` : "";
    const ov = modal(`${x.id ? "تعديل" : "إنشاء"} ${DOC[kind][0]}`, `<form id="mf" onsubmit="return false">
      <div class="grid2"><div class="field"><label>العميل *</label><select class="input" name="customer_id" required>${custOpts(x.customer_id)}</select></div>
      <div class="field"><label>الطلب المرتبط</label><select class="input" name="order_id"></select></div></div>
      <div class="field"><label>العنوان *</label><input class="input" name="title" required value="${esc(x.title || defTitle)}"></div>
      ${withItems ? `<label style="font-size:13px;font-weight:700;color:var(--brand-dark)">البنود ${kind === "quote" ? "— اختر الصنف من المخزن ليُسحب سعره ونوع بيعه ويظهر المتاح" : ""}</label><div class="tbl-wrap items-tbl" style="margin:6px 0 10px"><table><thead><tr><th style="min-width:150px">من المخزن</th><th>البند</th><th style="width:105px">النوع</th><th style="width:85px">الكمية</th><th style="width:105px">السعر</th><th style="width:70px">المتاح</th><th style="width:40px"></th></tr></thead><tbody id="items"></tbody></table></div><button type="button" class="btn btn-ghost btn-sm" id="additem">+ بند</button>` : ""}
      <div class="grid2 mt"><div class="field"><label>${kind === "receipt" ? "المبلغ المستلم *" : "المبلغ الإجمالي"} (ر.س)</label><input class="input" type="number" step="0.01" name="amount" value="${x.amount || 0}" ${withItems ? "readonly" : ""}></div>
      <div class="field"><label>الحالة</label><select class="input" name="status">${Object.keys(DOC_STATUS).map((k) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${DOC_STATUS[k][0]}</option>`).join("")}</select></div>
      ${withDate ? `<div class="field"><label>الموعد</label><input class="input" type="date" name="scheduled_date" value="${x.scheduled_date || ""}"></div>` : ""}</div>
      ${ctBlock}
      <div class="field"><label>${kind === "measurement" ? "تفاصيل الموقع والملاحظات" : isContract ? "شروط العقد" : kind === "receipt" ? "طريقة الدفع والملاحظات" : "التفاصيل"}</label><textarea class="input" name="details" rows="${isContract ? 6 : 3}">${esc(x.details != null && x.details !== "" ? x.details : isContract && isNew ? CT_TERMS : "")}</textarea></div></form>`,
      `<button class="btn btn-primary" id="save">حفظ</button><button class="btn btn-line" data-close>إلغاء</button>`);
    if (isContract) ov.querySelector(".modal").classList.add("modal-wide");
    const os = $("[name=order_id]", ov); os.innerHTML = orderOpts();
    let items = (x.items || []).map((i) => Object.assign({}, i));
    const invOpts = (sel) => `<option value="">— بند حر —</option>` + stockList.map((i) => `<option value="${i.id}" ${sel === i.id ? "selected" : ""}>${esc(i.name)}</option>`).join("");
    const availTxt = (i) => (i.inventory_item_id && stk ? (() => { const a = stk.avail(i.inventory_item_id); const bad = Number(i.qty) > a; return `<span style="color:${bad ? "var(--red)" : "var(--green)"};font-weight:700">${a}</span>`; })() : "—");
    const sum = () => { const t = items.reduce((a, i) => a + itemTotal(i), 0); $("[name=amount]", ov).value = t.toFixed(2); };
    const drawItems = () => {
      const tb = $("#items", ov); if (!tb) return;
      tb.innerHTML = items.map((i, n) => `<tr><td><select class="input" data-i="${n}" data-k="inventory_item_id">${invOpts(i.inventory_item_id)}</select></td><td><input class="input" data-i="${n}" data-k="name" value="${esc(i.name)}"></td><td><select class="input" data-i="${n}" data-k="sale_type"><option value="piece" ${i.sale_type !== "meter" ? "selected" : ""}>بالقطعة</option><option value="meter" ${i.sale_type === "meter" ? "selected" : ""}>بالمتر</option></select></td><td><input class="input" type="number" step="0.01" data-i="${n}" data-k="qty" value="${i.qty}"></td><td><input class="input" type="number" step="0.01" data-i="${n}" data-k="price" value="${i.price}"></td><td data-av="${n}" style="text-align:center">${availTxt(i)}</td><td><button type="button" class="btn btn-danger btn-sm" data-rm="${n}">×</button></td></tr>`).join("");
      sum();
    };
    const newItem = () => ({ name: "", qty: 1, price: 0, sale_type: "piece", inventory_item_id: "" });
    const autoFill = () => {
      // تعبئة تلقائية للعقد: العنوان + البنود من آخر عرض سعر للطلب/العميل + مبلغ الطلب
      if (!isContract || !isNew) return;
      const cid = $("[name=customer_id]", ov).value, oid = os.value; const c = cust(cid); const o = S.orders.find((y) => y.id === oid);
      const t = $("[name=title]", ov); if (!t.dataset.touched) t.value = `عقد ${c.name || ""}${o ? " — " + o.work_type : ""}`;
      const items0 = items.filter((i) => i.name);
      if (!items0.length) {
        const q = S.documents.filter((d0) => d0.kind === "quote" && d0.customer_id === cid && (!oid || d0.order_id === oid) && Array.isArray(d0.items) && d0.items.length).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
        if (q) { items = q.items.map((i) => Object.assign({ sale_type: "piece" }, i)); drawItems(); }
      }
    };
    if (withItems) {
      if (!items.length) items.push(newItem());
      drawItems();
      $("#additem", ov).onclick = () => { items.push(newItem()); drawItems(); };
      const tb = $("#items", ov);
      tb.addEventListener("input", (e) => { const t = e.target; if (t.dataset.i == null || t.dataset.k === "inventory_item_id") return; const it = items[t.dataset.i]; it[t.dataset.k] = ["qty", "price"].includes(t.dataset.k) ? Number(t.value) : t.value; if (t.dataset.k === "qty") { const av = tb.querySelector(`[data-av="${t.dataset.i}"]`); if (av) av.innerHTML = availTxt(it); } sum(); });
      tb.addEventListener("change", (e) => { const t = e.target; if (t.dataset.i == null) return; const it = items[t.dataset.i];
        if (t.dataset.k === "sale_type") { it.sale_type = t.value; return; }
        if (t.dataset.k !== "inventory_item_id") return;
        it.inventory_item_id = t.value; const inv = stockList.find((z) => z.id === t.value);
        if (inv) { it.name = inv.name; it.sale_type = stk.saleOf(inv); if (Number(inv.sale_price)) it.price = Number(inv.sale_price); }
        drawItems(); });
      tb.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { items.splice(+b.dataset.rm, 1); if (!items.length) items.push(newItem()); drawItems(); } });
    }
    if (isContract) {
      const F = FILES();
      const draw = (key, host) => { const h = $(host, ov); if (!F) { h.innerHTML = '<div class="p2-muted">الرفع غير متاح</div>'; return; } h.innerHTML = F.photos(meta[key], "ct-del:" + key); F.hydratePhotos(h); h.querySelectorAll("[data-act^='ct-del:']").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); const k = b.dataset.act.split(":")[1]; meta[k] = meta[k].filter((p) => p !== b.dataset.path); draw(k, k === "design_images" ? "#ct-design-list" : "#ct-drawing-list"); })); };
      const hook = (inputId, key, host) => { $(inputId, ov).onchange = async (e) => { if (!F) return toast("الرفع غير متاح", "err"); const paths = await F.upload(e.target.files, "contracts"); meta[key] = meta[key].concat(paths); e.target.value = ""; draw(key, host); }; };
      hook("#ct-design", "design_images", "#ct-design-list"); hook("#ct-drawing", "drawing_images", "#ct-drawing-list");
      draw("design_images", "#ct-design-list"); draw("drawing_images", "#ct-drawing-list");
      $("[name=title]", ov).addEventListener("input", (e) => (e.target.dataset.touched = "1"));
      if (!isNew) $("[name=title]", ov).dataset.touched = "1";
    }
    $("[name=customer_id]", ov).addEventListener("change", () => { os.innerHTML = orderOpts(); autoFill(); });
    os.addEventListener("change", autoFill);
    if (isNew && isContract) autoFill();
    $("#save", ov).onclick = async () => {
      const f = $("#mf", ov); if (!f.reportValidity()) return;
      const v = formData(f); v.kind = kind; v.order_id = v.order_id || null; v.scheduled_date = v.scheduled_date || null; v.amount = Number(v.amount || 0);
      if (withItems) {
        v.items = items.filter((i) => i.name).map((i) => ({ name: i.name, qty: Number(i.qty), price: Number(i.price), sale_type: i.sale_type === "meter" ? "meter" : "piece", inventory_item_id: i.inventory_item_id || null }));
        if (kind === "quote" && stk) { const short = v.items.filter((i) => i.inventory_item_id && Number(i.qty) > stk.avail(i.inventory_item_id)); if (short.length) toast("تنبيه: الكمية المطلوبة أكبر من المتاح بالمخزن في: " + short.map((i) => i.name).join("، "), "err"); }
      }
      if (kind === "receipt" && v.amount <= 0) return toast("أدخل المبلغ المستلم", "err");
      if (isContract) {
        const fields = {}; ov.querySelectorAll("[data-cf]").forEach((e) => { if (e.value.trim()) fields[e.dataset.cf] = e.value.trim(); });
        const dep = $("#ct-dep", ov).value;
        v.meta = { design_images: meta.design_images, drawing_images: meta.drawing_images, fields, deposit: dep === "" ? null : Number(dep), payment_terms: $("#ct-pay", ov).value.trim() };
      }
      const save = (val) => (x.id ? sb.from("documents").update(val).eq("id", x.id).select().single() : sb.from("documents").insert({ ...val, created_by: S.user.id }).select().single());
      let r = await save(v);
      if (r.error && v.meta && /meta/.test(r.error.message || "")) { toast("شغّل ملف 0004 في Supabase لحفظ صور وبيانات العقد — تم الحفظ بدونها", "err"); const { meta: _m, ...rest } = v; r = await save(rest); }
      if (r.error) return toast(errMsg(r.error), "err");
      closeModal(); toast("تم الحفظ", "ok"); await refresh(); location.hash = "#/doc/" + r.data.id;
    };
  }

  function printDoc(x) {
    const c = cust(x.customer_id); const o = S.orders.find((y) => y.id === x.order_id);
    const items = Array.isArray(x.items) ? x.items : [];
    const w = window.open("", "_blank");
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${DOC[x.kind][0]} ${x.doc_no}</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet">
    <style>body{font-family:Tajawal,sans-serif;color:#2a1a1b;margin:0;padding:36px 44px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2a1a1b;padding-bottom:14px}
    .brand{text-align:center;color:#7e1416;font-size:15px}h1{color:#7e1416;font-size:28px;margin:26px 0 4px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 30px;background:#f6eceb;padding:16px 20px;border-radius:10px;margin:18px 0}
    .meta b{color:#4a1416}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#7e1416;color:#fff;padding:9px;text-align:right}td{border-bottom:1px solid #ece4e3;padding:9px}
    .total{margin-top:16px;text-align:left;font-size:20px;font-weight:800;color:#7e1416}.details{white-space:pre-wrap;margin-top:18px;line-height:1.9}.sign{display:flex;justify-content:space-between;margin-top:70px}.sign div{border-top:1px solid #999;width:200px;text-align:center;padding-top:8px}
    footer{position:fixed;bottom:18px;left:44px;right:44px;text-align:center;font-size:12px;color:#7b6b6c;border-top:1px solid #ece4e3;padding-top:8px}@media print{button{display:none}}</style></head><body>
    <header><div class="brand">${logoSVG(170)}<div>Home Marble</div></div><div style="text-align:left"><div><b>رقم المستند:</b> ${x.doc_no}</div><div><b>التاريخ:</b> ${d(x.created_at)}</div>${o ? `<div><b>رقم الطلب:</b> ${o.order_no}</div>` : ""}</div></header>
    <h1>${DOC[x.kind][0]}</h1><div>${esc(x.title)}</div>
    <div class="meta"><div><b>العميل:</b> ${esc(c.name)}</div><div><b>الجوال:</b> ${esc(c.phone || "—")}</div><div><b>المدينة:</b> ${esc(c.city || "—")}</div><div><b>الفرع:</b> ${esc(branchName(o ? o.branch_id : c.branch_id))}</div>${x.scheduled_date ? `<div><b>الموعد:</b> ${d(x.scheduled_date)}</div>` : ""}${o ? `<div><b>نوع العمل:</b> ${esc(o.work_type)}</div>` : ""}</div>
    ${items.length ? `<table><thead><tr><th>#</th><th>البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td></tr>`).join("")}</tbody></table>` : ""}
    ${Number(x.amount) ? `<div class="total">${x.kind === "receipt" ? "المبلغ المستلم" : "الإجمالي"}: ${money(x.amount)} ريال سعودي</div>` : ""}
    ${x.details ? `<div class="details">${esc(x.details)}</div>` : ""}
    <div class="sign"><div>توقيع العميل</div><div>ختم وتوقيع هوم ماربل</div></div>
    <footer>هوم ماربل · الرياض – الخرج · نعزز جمال مساحتكم .. بالرخام والتصميم</footer>
    <script>setTimeout(()=>window.print(),600)<\/script></body></html>`);
    w.document.close();
  }

  // ---------- actions ----------
  async function refresh() { await loadAll(); render(true); }

  async function handleAction(el) {
    const a = el.dataset.act;
    if (window.HM_PERM && window.HM_PERM.blockAction(a, el)) return;
    if (X("action", a, el).some((v) => v === true)) return;
    if (a === "new-customer") return customerForm();
    if (a === "edit-customer") return customerForm(cust(el.dataset.id));
    if (a === "new-order") return orderForm(null, el.dataset.cust);
    if (a === "edit-order") return orderForm(S.orders.find((o) => o.id === el.dataset.id));
    if (a.startsWith("new-doc:")) return docForm(a.split(":")[1], null, el.dataset.cust, el.dataset.order);
    if (a.startsWith("go:")) return (location.hash = "#/" + a.slice(3));
    if (a === "edit-doc") return docForm(null, S.documents.find((x) => x.id === el.dataset.id));
    if (a === "print") { const dx = S.documents.find((x) => x.id === el.dataset.id); return dx.kind === "contract" ? printContract(dx) : printDoc(dx); }
    if (a === "new-branch") {
      const ov = modal("فرع / معرض جديد", `<form id="mf"><div class="field"><label>اسم الفرع</label><input class="input" name="name" required placeholder="معرض ..."></div><div class="field"><label>المدينة</label><input class="input" name="city" required></div></form>`, `<button class="btn btn-primary" id="save">حفظ</button>`);
      $("#save", ov).onclick = async () => { const f = $("#mf", ov); if (!f.reportValidity()) return; const r = await sb.from("branches").insert(formData(f)); if (r.error) return toast(errMsg(r.error), "err"); closeModal(); refresh(); };
      return;
    }
    const del = { "del-customer": ["customers", "#/customers", "سيتم حذف العميل وجميع طلباته ومستنداته. متأكد؟"], "del-order": ["orders", "#/orders", "حذف هذا الطلب؟"], "del-doc": ["documents", "#/", "حذف هذا المستند؟"] }[a];
    if (del && confirm(del[2])) { const r = await sb.from(del[0]).delete().eq("id", el.dataset.id); if (r.error) return toast(errMsg(r.error), "err"); toast("تم الحذف", "ok"); await refresh(); location.hash = del[1]; }
  }

  function bindPage() {
    app.querySelectorAll("[data-href]").forEach((r) => (r.onclick = () => (location.hash = r.dataset.href)));
    app.querySelectorAll("[data-act]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); handleAction(b); }));
    app.querySelectorAll("[data-go]").forEach((x) => (x.onclick = () => { if (x.dataset.sig) alMark([x.dataset.sig]); location.hash = "#/" + x.dataset.go; }));
    const cq = $("#cq"); if (cq) cq.oninput = () => { S.cq = cq.value; render(true); const n = $("#cq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
    const of = $("#of"); if (of) of.onchange = () => { S.of = of.value; render(true); };
    ["fb", "ff", "ft"].forEach((id) => { const e = $("#" + id); if (e) e.onchange = () => { S.filter = { branch: $("#fb").value, from: $("#ff").value, to: $("#ft").value }; render(true); }; });
    app.querySelectorAll("[data-ctab]").forEach((b) => (b.onclick = () => { S.ctab = b.dataset.ctab; render(true); }));
    const id = S.route.split("/")[1];
    app.querySelectorAll("[data-toggle]").forEach((b) => (b.onclick = async () => {
      const o = S.orders.find((x) => x.id === id); const k = b.dataset.toggle;
      const r = await sb.from("orders").update({ [k]: !o[k] }).eq("id", id); if (r.error) return toast(errMsg(r.error), "err"); refresh();
    }));
    const sf = $("#send-factory"); if (sf) sf.onclick = async () => {
      const r = await sb.from("orders").update({ status: "manufacturing" }).eq("id", id);
      if (r.error) return toast(errMsg(r.error), "err"); toast("تم إرسال الطلب للمصنع ✓", "ok"); refresh();
    };
    const ost = $("#ost"); if (ost) ost.onchange = async () => { const r = await sb.from("orders").update({ status: ost.value }).eq("id", id); if (r.error) { toast(errMsg(r.error), "err"); } refresh(); };
    app.querySelectorAll("[data-role]").forEach((cb) => (cb.onchange = async () => {
      const r = cb.checked ? await sb.from("user_roles").insert({ user_id: cb.dataset.uid, role: cb.dataset.role }) : await sb.from("user_roles").delete().eq("user_id", cb.dataset.uid).eq("role", cb.dataset.role);
      if (r.error) toast(errMsg(r.error), "err"); else toast("تم تحديث الصلاحيات", "ok"); refresh();
    }));
    app.querySelectorAll("[data-branch]").forEach((s) => (s.onchange = async () => { const r = await sb.from("profiles").update({ branch_id: s.value || null }).eq("id", s.dataset.branch); if (r.error) toast(errMsg(r.error), "err"); else toast("تم تحديث الفرع", "ok"); refresh(); }));
    X("bind", S.route);
  }

  function render(keepScroll) {
    if (!S.user) return;
    if (!S.roles.length) return renderPending();
    const y = window.scrollY;
    const [r, id] = S.route.split("/");
    let html;
    const xp = xPage(r);
    if (window.HM_PERM && !window.HM_PERM.routeOk(r, id)) html = '<div class="empty">لا تملك صلاحية لفتح هذه الصفحة — راجع مدير النظام</div>';
    else if (r === "") html = XS("home") || pageDashboard();
    else if (r === "customers") html = pageCustomers();
    else if (r === "customer") html = pageCustomer(id);
    else if (r === "orders") html = pageOrders();
    else if (r === "order") html = pageOrder(id);
    else if (r === "docs") html = pageDocs(id);
    else if (r === "doc") html = pageDoc(id);
    else if (r === "users") html = pageUsers();
    else if (r === "audit") html = pageAudit();
    else if (xp) { try { html = xp.pages[r](id); } catch (er) { console.error(er); html = '<div class="empty">تعذّر عرض الصفحة</div>'; } }
    else html = '<div class="empty">الصفحة غير موجودة</div>';
    const gsv = $("#gs") ? $("#gs").value : "";
    app.innerHTML = shell(html);
    bindShell(); bindPage();
    if (gsv) $("#gs").value = gsv;
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    setLive();
  }

  window.addEventListener("hashchange", () => {
    const h = location.hash.replace(/^#\/?/, "");
    if (h === "reset-password") return renderResetPassword();
    S.route = h; if (S.route.split("/")[0] !== "customer") S.ctab = "orders";
    render(false);
  });

  async function boot() {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    if (location.hash.includes("type=recovery") || location.hash === "#/reset-password") { if (S.session) return renderResetPassword(); }
    if (!S.session) return renderAuth("in");
    const u = await sb.auth.getUser();
    if (u.error || !u.data.user) { await sb.auth.signOut(); return renderAuth("in"); }
    S.user = u.data.user;
    S.route = location.hash.replace(/^#\/?/, "");
    await loadRoles(); await loadAll(); subscribeRealtime(); render(false);
  }

  // تمرير الأدوات المشتركة للإضافات (المرحلة الثانية)
  X("init", { sb, S, $, app, esc, money, d, has, isMgr, canSell, branchName, cityOf, cust, badge, dbadge, paidFor, toast, errMsg, modal, closeModal, formData, refresh, render, ordersTable, docsTable, STATUS, DOC, DOC_STATUS, ROLE_LABEL, icon: window.icon, logoSVG: window.logoSVG });

  let lastUid = undefined;
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "PASSWORD_RECOVERY") return renderResetPassword();
    const uid = session && session.user.id;
    if (uid === lastUid && ev !== "SIGNED_OUT") return;
    lastUid = uid;
    if (!session) { S.user = null; S.roles = []; if (S.channel) sb.removeChannel(S.channel); return renderAuth("in"); }
    setTimeout(boot, 0);
  });
})();
