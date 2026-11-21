/* هوم ماربل v5.5 — الصلاحيات الفرعية لكل موظف + ملحوظات العملاء (المصنع) + فحص تحديث قاعدة البيانات
   ملف إضافي عبر window.HM_EXT، ويعمل بأمان حتى لو لم تُشغَّل ملفات SQL بعد (يعرض تنبيهاً للمدير). */
(function () {
  "use strict";
  let C = null;
  const P4 = { denied: [], map: {}, missing: {}, notes: [], miss: [], checked: false };
  const L = (s) => s.split(",");
  const FAC = "factory_manager,cutting_supervisor,assembly_supervisor,polishing_supervisor,quality_inspector";
  const SAL = "sales,accountant";

  // [المفتاح، الوصف، المجموعة، الأدوار التي تملكه أصلاً]  — المدير يحجب منها ما يشاء لكل موظف
  const GROUPS = ["المبيعات والعملاء", "المصنع والجودة", "المخزن والمشتريات", "الميدان (قياس وتركيب)", "المحاسبة والموارد", "التواصل والعام"];
  const PERMS = [
    ["customers.view", "عرض العملاء", 0, SAL + ",factory_manager"],
    ["customers.add", "إضافة عميل جديد", 0, SAL],
    ["customers.edit", "تعديل بيانات العميل", 0, SAL],
    ["orders.view", "عرض الطلبات والمشاريع", 0, SAL + ",factory_manager"],
    ["orders.add", "رفع أوردر جديد", 0, SAL],
    ["orders.edit", "تعديل الأوردر", 0, SAL],
    ["orders.contract_approve", "اعتماد العقد", 0, SAL],
    ["orders.send_factory", "إرسال الطلب للمصنع", 0, SAL],
    ["orders.status", "تغيير حالة الطلب", 1, "factory_manager"],
    ["quotes.view", "عرض عروض الأسعار", 0, SAL + ",factory_manager"],
    ["quotes.edit", "إنشاء/تعديل عروض الأسعار", 0, SAL],
    ["designs.view", "عرض التصاميم", 0, SAL + ",factory_manager"],
    ["designs.edit", "إنشاء/تعديل التصاميم", 0, SAL],
    ["contracts.view", "عرض العقود", 0, SAL + ",factory_manager"],
    ["contracts.edit", "إنشاء/تعديل العقود", 0, SAL],
    ["measdocs.view", "عرض طلبات المقاسات", 0, SAL + ",factory_manager"],
    ["measdocs.edit", "إنشاء/تعديل طلبات المقاسات", 0, SAL],
    ["samples.view", "عرض طلبات العينات", 0, SAL + ",factory_manager"],
    ["samples.edit", "إنشاء/تعديل طلبات العينات", 0, SAL],
    ["receipts.view", "عرض الفواتير والدفعات", 0, SAL + ",factory_manager"],
    ["receipts.edit", "إنشاء/تعديل الفواتير والدفعات", 0, SAL],
    ["docs.print", "طباعة المستندات", 0, SAL + ",factory_manager"],
    ["templates.view", "عرض قوالب العقود", 0, "sales"],
    ["templates.edit", "رفع وتعديل قوالب العقود", 0, "sales"],
    ["marketing.view", "التسويق وواتساب", 0, "sales"],
    ["factory.view", "عرض المصنع والإنتاج", 1, FAC],
    ["factory.edit", "تحريك المنتجات بين المراحل وتعديل البنود", 1, FAC],
    ["quality.view", "عرض فحص الجودة", 1, "factory_manager,quality_inspector"],
    ["quality.edit", "تسجيل نتائج الفحص", 1, "factory_manager,quality_inspector"],
    ["notes.view", "عرض ملحوظات العملاء", 1, SAL + "," + FAC],
    ["notes.add", "إضافة ملحوظات العملاء", 1, SAL + "," + FAC],
    ["inventory.view", "عرض المستودع والمخزون", 2, "factory_manager,warehouse,purchasing,sales,accountant"],
    ["inventory.edit", "إضافة/تعديل أصناف المخزون", 2, "warehouse,factory_manager,purchasing"],
    ["inventory.move", "حركات المخزون (وارد/صرف/تسوية)", 2, "warehouse,factory_manager"],
    ["inventory.reserve", "حجز المواد للطلبات", 2, "warehouse,factory_manager,sales"],
    ["purchases.view", "عرض طلبات الشراء", 2, "factory_manager,purchasing,warehouse,accountant"],
    ["purchases.edit", "إنشاء/اعتماد/استلام طلبات الشراء", 2, "purchasing,factory_manager,accountant,warehouse,sales"],
    ["suppliers.view", "عرض الموردين", 2, "purchasing,factory_manager,warehouse,accountant"],
    ["suppliers.edit", "إضافة/تعديل الموردين", 2, "purchasing,factory_manager,warehouse"],
    ["visits.view", "عرض زيارات القياس", 3, "sales,factory_manager,measurement_tech"],
    ["visits.edit", "إدارة زيارات القياس", 3, "sales,factory_manager,measurement_tech"],
    ["installs.view", "عرض التركيبات", 3, "factory_manager,installer"],
    ["installs.edit", "إدارة التركيبات", 3, "factory_manager,installer"],
    ["finance.view", "عرض المحاسبة والمالية", 4, "accountant"],
    ["finance.edit", "إضافة/تعديل القيود والسندات", 4, "accountant"],
    ["hr.view", "عرض شؤون الموظفين", 4, "accountant"],
    ["hr.edit", "إدارة الموظفين والإجازات والسياسات", 4, "accountant"],
    ["store.view", "المتجر الإلكتروني", 4, "sales,warehouse"],
    ["support.view", "الدعم الفني", 5, "support"],
    ["portal.view", "بوابة الموظف", 5, "*"],
    ["comms.view", "الإشعارات والتواصل", 5, "*"],
    ["chats.view", "الدردشات", 5, "*"],
    ["reports.view", "أرشيف التقارير", 5, "*"],
    ["guide.view", "دليل الاستخدام", 5, "*"],
  ];
  const KEY_LABEL = {}; PERMS.forEach((p) => (KEY_LABEL[p[0]] = p[1]));
  const NAV = { customers: "customers.view", orders: "orders.view", "docs/quote": "quotes.view", "docs/design": "designs.view", "docs/contract": "contracts.view", "docs/measurement": "measdocs.view", "docs/sample": "samples.view", "docs/receipt": "receipts.view", factory: "factory.view", quality: "quality.view", inventory: "inventory.view", purchases: "purchases.view", suppliers: "suppliers.view", measurements: "visits.view", installations: "installs.view", support: "support.view", chats: "chats.view", reports: "reports.view", finance: "finance.view", hr: "hr.view", portal: "portal.view", comms: "comms.view", marketing: "marketing.view", store: "store.view", guide: "guide.view", notes: "notes.view", templates: "templates.view" };
  const KIND_KEY = { quote: "quotes", design: "designs", contract: "contracts", measurement: "measdocs", sample: "samples", receipt: "receipts", invoice: "receipts" };
  const ROUTE_ALIAS = { customer: "customers", order: "orders", "factory-order": "factory", "inventory-item": "inventory", purchase: "purchases", visit: "measurements", job: "installations", "support-thread": "support", room: "chats", "report-view": "reports", join: "chats" };
  const ACT = {
    "new-customer": "customers.add", "edit-customer": "customers.edit", "new-order": "orders.add", "edit-order": "orders.edit", print: "docs.print",
    "p2-item-new": "factory.edit", "p2-item-edit": "factory.edit", "p2-next": "factory.edit", "p2-item-back": "factory.edit", "p2-state": "factory.edit", "p2-import": "factory.edit", "p2-item-log": null,
    "p2-qc": "quality.edit", "p2-qc-photos": "quality.edit",
    "p2-inv-new": "inventory.edit", "p2-inv-edit": "inventory.edit", "p2-move-new": "inventory.move", "p2-res-new": "inventory.reserve", "p2-res-release": "inventory.reserve", "p2-res-consume": "inventory.reserve",
    "p2-pr-new": "purchases.edit", "p2-pr-edit": "purchases.edit", "p2-pr-status": "purchases.edit", "p2-pr-receive": "purchases.edit", "p2-pr-del": "purchases.edit",
    "p2-sup-new": "suppliers.edit", "p2-sup-edit": "suppliers.edit",
    "p2-visit-new": "visits.edit", "p2-visit-edit": "visits.edit", "p2-visit-status": "visits.edit", "p2-visit-meas": "visits.edit", "p2-visit-draw": "visits.edit", "p2-visit-del": "visits.edit",
    "p2-job-new": "installs.edit", "p2-job-edit": "installs.edit", "p2-job-status": "installs.edit", "p2-job-issues": "installs.edit", "p2-job-handover": "installs.edit", "p2-job-del": "installs.edit",
    "p3-fin-new": "finance.edit", "p3-fin-edit": "finance.edit", "p3-fin-voucher": "finance.edit",
    "p3-emp-new": "hr.edit", "p3-emp-edit": "hr.edit", "p3-lv-new": "hr.edit", "p3-lv": "hr.edit", "p3-pol-new": "hr.edit", "p3-pol-edit": "hr.edit",
  };

  // ---------------------------------------------------------------- مساعدات
  const esc = (v) => C.esc(v);
  const myRoles = () => C.S.roles || [];
  const isMgr = () => C.isMgr();
  const ok = (key) => !key || isMgr() || !P4.denied.includes(key);
  const availFor = (roles) => (roles.includes("admin") || roles.includes("executive") ? PERMS : PERMS.filter((p) => p[3] === "*" || L(p[3]).some((r) => roles.includes(r))));
  const docKind = (id) => { const x = C.S.documents.find((y) => y.id === id); return x ? x.kind : null; };
  function actKey(a, el) {
    if (a.startsWith("new-doc:")) { const k = KIND_KEY[a.split(":")[1]]; return k ? k + ".edit" : null; }
    if (a === "edit-doc") { const k = KIND_KEY[docKind(el && el.dataset && el.dataset.id)]; return k ? k + ".edit" : null; }
    return Object.prototype.hasOwnProperty.call(ACT, a) ? ACT[a] : null;
  }
  const blocked = (a, el) => !ok(actKey(a, el));
  function routeKey(r, id) {
    if (!r) return null;
    if (r === "docs") return NAV["docs/" + id] || null;
    if (r === "doc") { const k = KIND_KEY[docKind(id)]; return k ? k + ".view" : null; }
    return NAV[ROUTE_ALIAS[r] || r] || null;
  }
  const routeOk = (r, id) => ok(routeKey(r, id));
  const navOk = (route) => ok(NAV[route]);
  const deny = (key) => C.toast("ليست لديك صلاحية: " + (KEY_LABEL[key] || "هذا الإجراء") + " — حددها لك مدير النظام", "err");

  // ---------------------------------------------------------------- التحميل + فحص القاعدة
  const PROBES = [["installation_jobs", "member_ids", "جداول قديمة ناقصة أعمدة"], ["customers", "customer_type", "نوع العميل (فرد/شركة)"], ["inventory_items", "sale_type", "نوع المنتج قطعة/متر"], ["documents", "meta", "بيانات العقد (صور/قوالب)"], ["announcements", "target_roles", "إعلانات لعدة أقسام"], ["hm_user_perms", "user_id", "الصلاحيات الفرعية"], ["hm_templates", "id", "قوالب العقود"], ["hm_notes", "id", "ملحوظات العملاء"]];
  async function probe() {
    const rs = await Promise.all(PROBES.map((p) => C.sb.from(p[0]).select(p[1]).limit(1).then((r) => r, () => ({ error: { message: "x" } }))));
    P4.miss = PROBES.filter((p, i) => rs[i].error).map((p) => p[2]);
  }
  async function load() {
    const r = await C.sb.from("hm_user_perms").select("*");
    if (r.error) { P4.missing.perms = true; P4.denied = []; P4.map = {}; }
    else { P4.missing.perms = false; P4.map = {}; (r.data || []).forEach((x) => (P4.map[x.user_id] = x.denied || [])); P4.denied = P4.map[C.S.user.id] || []; }
    const n = await C.sb.from("hm_notes").select("*").order("created_at", { ascending: false }).limit(1500);
    if (n.error) { P4.missing.notes = true; P4.notes = []; } else { P4.missing.notes = false; P4.notes = n.data || []; }
    if (isMgr() && !P4.checked) { P4.checked = true; await probe(); }
  }

  // ---------------------------------------------------------------- نافذة تحديث القاعدة
  function projectRef() { try { return new URL(window.HM_CONFIG.url).hostname.split(".")[0]; } catch (e) { return ""; } }
  function sqlModal() {
    const sql = window.HM_SQL || "-- ملف التحديث غير متاح داخل هذه النسخة";
    const ov = C.modal("تحديث قاعدة البيانات إلى الإصدار " + (window.HM_VERSION || ""),
      `<p style="margin-bottom:8px">قاعدة بياناتك تنقصها بعض الجداول/الأعمدة الخاصة بالتعديلات الجديدة: <b>${P4.miss.map(esc).join("، ") || "—"}</b>.<br>المتصفح لا يملك صلاحية تعديل هيكل القاعدة، لذلك نفّذ الخطوات التالية <b>مرة واحدة فقط</b> (آمنة، ولا تحذف أي بيانات):</p>
      <ol style="padding-right:20px;line-height:2"><li>اضغط «نسخ الكود».</li><li>اضغط «فتح محرر SQL» (يفتح Supabase) والصق الكود.</li><li>اضغط <b>Run</b> ثم ارجع هنا واضغط «إعادة الفحص» — ستظهر كل التعديلات فوراً لكل من يفتح البرنامج.</li></ol>
      <textarea class="input" id="p4-sql" readonly rows="8" dir="ltr" style="font-family:monospace;font-size:12px">${esc(sql)}</textarea>`,
      `<button class="btn btn-primary" id="p4-copy">نسخ الكود</button><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://supabase.com/dashboard/project/${esc(projectRef())}/sql/new">فتح محرر SQL</a><button class="btn btn-line" id="p4-recheck">إعادة الفحص</button><button class="btn btn-line" data-close>إغلاق</button>`);
    ov.querySelector(".modal").classList.add("modal-wide");
    ov.querySelector("#p4-copy").onclick = async () => { const t = ov.querySelector("#p4-sql"); try { await navigator.clipboard.writeText(sql); } catch (e) { t.select(); document.execCommand("copy"); } C.toast("تم نسخ الكود ✓", "ok"); };
    ov.querySelector("#p4-recheck").onclick = async () => { P4.checked = false; C.closeModal(); await C.refresh(); C.toast(P4.miss.length ? "ما زال ينقص: " + P4.miss.join("، ") : "القاعدة محدّثة بالكامل ✓", P4.miss.length ? "err" : "ok"); };
  }

  // ---------------------------------------------------------------- نافذة الصلاحيات الفرعية
  function userCell(p, rs) {
    if (rs.includes("admin") || rs.includes("executive")) return '<span class="badge b-green">كامل</span>';
    if (!rs.length) return "—";
    const n = (P4.map[p.id] || []).length;
    return `<button class="btn btn-ghost btn-sm" data-act="p4-perm-edit" data-uid="${p.id}">${n ? "مقيّدة (" + n + ")" : "تخصيص"}</button>`;
  }
  function permModal(uid) {
    if (!isMgr()) return;
    if (P4.missing.perms) { P4.miss = P4.miss.length ? P4.miss : ["الصلاحيات الفرعية"]; return sqlModal(); }
    const p = C.S.profiles.find((x) => x.id === uid); if (!p) return;
    const roles = C.S.allRoles.filter((r) => r.user_id === uid).map((r) => r.role);
    const av = availFor(roles); const den = new Set(P4.map[uid] || []);
    const body = `<p style="margin-bottom:6px"><b>${esc(p.full_name)}</b> · <span dir="ltr">${esc(p.email)}</span><br><small style="color:var(--muted)">الوظيفة: ${roles.map((r) => esc(C.ROLE_LABEL[r] || r)).join("، ")} — فعّل (✓) ما يجوز لهذا الموظف رؤيته/فعله، وألغِ ما لا يجوز. يُطبّق فوراً عند الحفظ.</small></p>
      <div class="filters" style="margin:8px 0"><button type="button" class="btn btn-line btn-sm" id="pm-all">تحديد الكل</button><button type="button" class="btn btn-line btn-sm" id="pm-none">إلغاء الكل</button></div>
      <div class="p4-perm-grid">${GROUPS.map((g, gi) => { const it = av.filter((x) => x[2] === gi); return it.length ? `<fieldset class="p4-pg"><legend>${g}</legend>${it.map((x) => `<label class="p4-pc"><input type="checkbox" data-k="${x[0]}" ${den.has(x[0]) ? "" : "checked"}> ${esc(x[1])}</label>`).join("")}</fieldset>` : ""; }).join("")}</div>`;
    const ov = C.modal("الصلاحيات الفرعية — " + esc(p.full_name), body, `<button class="btn btn-primary" id="pm-save">حفظ</button><button class="btn btn-line" data-close>إلغاء</button>`);
    ov.querySelector(".modal").classList.add("modal-wide");
    ov.querySelector("#pm-all").onclick = () => ov.querySelectorAll("[data-k]").forEach((c) => (c.checked = true));
    ov.querySelector("#pm-none").onclick = () => ov.querySelectorAll("[data-k]").forEach((c) => (c.checked = false));
    ov.querySelector("#pm-save").onclick = async () => {
      const denied = Array.from(ov.querySelectorAll("[data-k]")).filter((c) => !c.checked).map((c) => c.dataset.k);
      const r = await C.sb.from("hm_user_perms").upsert({ user_id: uid, denied, updated_by: C.S.user.id, updated_at: new Date().toISOString() });
      if (r.error) return C.toast(C.errMsg(r.error), "err");
      C.closeModal(); C.toast("تم حفظ الصلاحيات الفرعية ✓", "ok"); await C.refresh();
    };
  }

  // ---------------------------------------------------------------- ملحوظات العملاء
  const dt = (t) => (t ? new Date(t).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const canAddNote = () => ok("notes.add");
  function notesFor(cid) {
    const out = []; const c = C.cust(cid);
    if (c.notes && String(c.notes).trim()) out.push({ at: c.updated_at || c.created_at, who: "بيانات العميل", src: "ملاحظات العميل", text: c.notes });
    C.S.orders.filter((o) => o.customer_id === cid && o.description && String(o.description).trim()).forEach((o) => out.push({ at: o.updated_at || o.created_at, who: "طلب #" + o.order_no, src: "وصف الطلب", text: o.description }));
    P4.notes.filter((n) => n.customer_id === cid).forEach((n) => out.push({ id: n.id, at: n.created_at, who: n.author_name || "—", src: n.source === "factory" ? "المصنع" : n.source === "sales" ? "المبيعات" : "ملحوظة", text: n.body, order_id: n.order_id, author_id: n.author_id }));
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  const noteHtml = (n) => `<div class="p4-note"><div class="p4-note-h"><b>${esc(n.src)}</b><span>${esc(n.who)}${n.order_id ? " · طلب #" + esc((C.S.orders.find((o) => o.id === n.order_id) || {}).order_no || "") : ""}</span><time>${esc(dt(n.at))}</time>${n.id && (isMgr() || n.author_id === C.S.user.id) ? `<button class="btn btn-sm btn-danger" data-act="p4-note-del" data-id="${n.id}" title="حذف">×</button>` : ""}</div><div class="p4-note-b">${esc(n.text)}</div></div>`;
  const missBanner = () => (P4.missing.notes ? `<div class="p2-info">${C.icon("alert", 18)} إضافة ملحوظات جديدة تحتاج تحديث قاعدة البيانات (يظهر زر التحديث للمدير أعلى الصفحة). المعروض هنا هو ملاحظات العميل ووصف الطلبات فقط.</div>` : "");

  function pageNotes() {
    if (!ok("notes.view")) return '<div class="empty">لا تملك صلاحية</div>';
    const q = (C.S.nq || "").toLowerCase(); const cf = C.S.ncust || "";
    const custs = C.S.customers.filter((c) => (!cf || c.id === cf) && (!q || (c.name + " " + (c.phone || "")).toLowerCase().includes(q) || notesFor(c.id).some((n) => String(n.text).toLowerCase().includes(q))));
    const withNotes = custs.map((c) => ({ c, n: notesFor(c.id) })).filter((x) => x.n.length).sort((a, b) => (a.n[0].at < b.n[0].at ? 1 : -1));
    return `<div class="page-head"><div><h1>ملحوظات العملاء</h1><div class="sub">كل ملحوظات العميل في مكان واحد — من بيانات العميل والطلبات وما يضيفه المصنع والمبيعات</div></div>
      <div class="filters"><input class="input" id="p4-nq" placeholder="بحث بالعميل أو نص الملحوظة" value="${esc(C.S.nq || "")}"><select class="input" id="p4-nc"><option value="">كل العملاء</option>${C.S.customers.map((c) => `<option value="${c.id}" ${cf === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${canAddNote() ? `<button class="btn btn-primary" data-act="p4-note-add" data-cust="${esc(cf)}">${C.icon("plus", 18)} ملحوظة جديدة</button>` : ""}</div></div>
      ${missBanner()}${withNotes.length ? withNotes.map((x) => `<div class="card mt"><div class="card-head"><h3><a href="#/customer/${x.c.id}">${esc(x.c.name)}</a></h3><span class="badge b-gray">${x.n.length} ملحوظة</span>${canAddNote() ? `<button class="btn btn-ghost btn-sm" data-act="p4-note-add" data-cust="${x.c.id}">+ ملحوظة</button>` : ""}</div>${x.n.map(noteHtml).join("")}</div>`).join("") : '<div class="card mt"><div class="empty">لا توجد ملحوظات</div></div>'}`;
  }
  function noteModal(cid, oid) {
    if (!canAddNote()) return deny("notes.add");
    if (P4.missing.notes) { P4.miss = ["ملحوظات العملاء"]; return sqlModal(); }
    const custs = C.S.customers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
    const ov = C.modal("ملحوظة جديدة على عميل", `<form id="mf" onsubmit="return false"><div class="grid2"><div class="field"><label>العميل *</label><select class="input" name="customer_id" required><option value="">— اختر —</option>${custs.map((c) => `<option value="${c.id}" ${cid === c.id ? "selected" : ""}>${esc(c.name)}${c.phone ? " — " + esc(c.phone) : ""}</option>`).join("")}</select></div><div class="field"><label>الطلب (اختياري)</label><select class="input" name="order_id"></select></div></div><div class="field"><label>الملحوظة *</label><textarea class="input" name="body" rows="5" required placeholder="اكتب ملحوظات العميل: طلباته الخاصة، مواعيد، تحذيرات للتصنيع..."></textarea></div></form>`, `<button class="btn btn-primary" id="save">حفظ الملحوظة</button><button class="btn btn-line" data-close>إلغاء</button>`);
    const cs = ov.querySelector("[name=customer_id]"), os = ov.querySelector("[name=order_id]");
    const fill = () => { os.innerHTML = '<option value="">— بدون —</option>' + C.S.orders.filter((o) => o.customer_id === cs.value).map((o) => `<option value="${o.id}" ${oid === o.id ? "selected" : ""}>#${o.order_no} — ${esc(o.work_type)}</option>`).join(""); };
    cs.onchange = fill; fill();
    ov.querySelector("#save").onclick = async () => {
      const f = ov.querySelector("#mf"); if (!f.reportValidity()) return;
      const v = C.formData(f); const fac = myRoles().some((r) => L(FAC).includes(r));
      const r = await C.sb.from("hm_notes").insert({ customer_id: v.customer_id, order_id: v.order_id || null, body: v.body.trim(), source: fac ? "factory" : "sales", author_id: C.S.user.id, author_name: (C.S.profile && C.S.profile.full_name) || C.S.user.email });
      if (r.error) return C.toast(C.errMsg(r.error), "err");
      C.closeModal(); C.toast("تمت إضافة الملحوظة ✓", "ok"); await C.refresh();
    };
  }

  // بطاقة الملحوظات داخل صفحات المصنع
  function factoryCard(route) {
    const [r, id] = route.split("/");
    let list, head, cid = "", oid = "";
    if (r === "factory-order") { const o = C.S.orders.find((x) => x.id === id); if (!o) return ""; cid = o.customer_id; oid = o.id; list = notesFor(cid); head = "ملحوظات العميل — " + (C.cust(cid).name || ""); }
    else { list = []; C.S.customers.forEach((c) => notesFor(c.id).forEach((n) => list.push(Object.assign({ cname: c.name }, n)))); list = list.filter((n) => n.id).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8); head = "آخر ملحوظات العملاء"; }
    return `<div class="card mt" id="p4-fcard"><div class="card-head"><h3>${C.icon("clipboard")} ${esc(head)}</h3><div class="filters">${canAddNote() ? `<button class="btn btn-primary btn-sm" data-p4="add" data-cust="${esc(cid)}" data-order="${esc(oid)}">${C.icon("plus", 16)} إضافة ملحوظة</button>` : ""}<a class="btn btn-ghost btn-sm" href="#/notes">كل الملحوظات</a></div></div>${missBanner()}${list.length ? list.map((n) => (n.cname ? `<div style="font-size:12px;color:var(--brand);font-weight:700;margin-top:6px">${esc(n.cname)}</div>` : "") + noteHtml(n)).join("") : '<div class="empty">لا توجد ملحوظات بعد</div>'}</div>`;
  }


  // ---------------------------------------------------------------- زر «ملاحظات العملاء» في لوحة المصنع
  function factoryCustomers() {
    const inFac = (o) => o.sent_to_factory_at || o.status === "manufacturing";
    const rows = [];
    C.S.customers.forEach((c) => {
      const ords = C.S.orders.filter((o) => o.customer_id === c.id && inFac(o));
      const nts = notesFor(c.id);
      if (ords.length || nts.length) rows.push({ c, ords, nts });
    });
    return rows.filter((x) => x.nts.length || x.ords.length).sort((a, b) => ((b.nts[0] || {}).at || "") > ((a.nts[0] || {}).at || "") ? 1 : -1);
  }
  function factoryNotesCount() { return factoryCustomers().reduce((n, x) => n + x.nts.length, 0); }
  function factoryNotesModal() {
    if (!ok("notes.view")) return deny("notes.view");
    const rows = factoryCustomers();
    const body = `<div class="p4-fn-tools"><input class="input" id="p4-fn-q" placeholder="بحث باسم العميل أو نص الملحوظة"></div>
      <div id="p4-fn-list">${rows.length ? rows.map((x) => `<section class="card p4-fn-row" data-s="${esc((x.c.name + " " + x.nts.map((n) => n.text).join(" ")).toLowerCase())}">
        <div class="card-head"><h3><a href="#/customer/${x.c.id}" data-close>${esc(x.c.name)}</a></h3><span class="badge b-gray">${x.nts.length} ملحوظة</span>${canAddNote() ? `<button class="btn btn-ghost btn-sm" data-p4="fn-add" data-cust="${x.c.id}">+ ملحوظة</button>` : ""}</div>
        <div class="p4-fn-grid"><div class="p4-fn-orders"><b>طلبات العميل في المصنع</b>${x.ords.length ? x.ords.map((o) => `<a class="p4-fn-ord" href="#/factory-order/${o.id}" data-close><span>#${esc(o.order_no)} — ${esc(o.work_type || "")}</span>${C.badge(o.status)}</a>`).join("") : '<div class="p2-muted">لا طلبات في المصنع</div>'}</div>
        <div class="p4-fn-notes"><b>ملاحظات العميل</b>${x.nts.length ? x.nts.map(noteHtml).join("") : '<div class="p2-muted">لا توجد ملحوظات</div>'}</div></div></section>`).join("") : '<div class="empty">لا توجد طلبات أو ملحوظات بعد</div>'}</div>`;
    const ov = C.modal("ملاحظات العملاء — لوحة المصنع", (P4.missing.notes ? missBanner() : "") + body,
      `${canAddNote() ? '<button class="btn btn-primary" data-p4="fn-add">+ إضافة ملحوظة</button>' : ""}<a class="btn btn-ghost" href="#/notes" data-close>كل الملحوظات</a><button class="btn btn-line" data-close>إغلاق</button>`);
    ov.querySelector(".modal").classList.add("modal-wide");
    const q = ov.querySelector("#p4-fn-q");
    q.oninput = () => { const v = q.value.trim().toLowerCase(); ov.querySelectorAll(".p4-fn-row").forEach((r) => (r.style.display = !v || r.dataset.s.includes(v) ? "" : "none")); };
    ov.querySelectorAll("[data-p4=fn-add]").forEach((b) => (b.onclick = () => { C.closeModal(); noteModal(b.dataset.cust || "", ""); }));
    ov.querySelectorAll("[data-act=p4-note-del]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); C.closeModal(); handle("p4-note-del", b); }));
  }

  // ---------------------------------------------------------------- الأحداث
  function handle(a, el) {
    if (a === "p4-sql") { sqlModal(); return true; }
    if (a === "p4-fnotes") { factoryNotesModal(); return true; }
    if (a === "p4-perm-edit") { permModal(el.dataset.uid); return true; }
    if (a === "p4-note-add") { noteModal(el.dataset.cust, el.dataset.order); return true; }
    if (a === "p4-note-del") { if (confirm("حذف هذه الملحوظة؟")) C.sb.from("hm_notes").delete().eq("id", el.dataset.id).then((r) => { if (r.error) C.toast(C.errMsg(r.error), "err"); else { C.toast("تم الحذف", "ok"); C.refresh(); } }); return true; }
    return false;
  }
  function action(a, el) {
    if (handle(a, el)) return true;
    return undefined;
  }
  function bind(route) {
    const root = document.getElementById("app");
    const r0 = (route || "").split("/")[0];
    if (!isMgr()) {
      root.querySelectorAll("[data-act]").forEach((b) => { if (blocked(b.dataset.act, b)) b.remove(); });
      if (!ok("orders.send_factory")) { const s = root.querySelector("#send-factory"); if (s) s.remove(); }
      if (!ok("orders.contract_approve")) root.querySelectorAll('[data-toggle="contract_approved"]').forEach((b) => b.remove());
      if (!ok("orders.status")) { const s = root.querySelector("#ost"); if (s) { const f = s.closest(".field"); (f || s).remove(); } }
    }
    if ((r0 === "factory" || r0 === "factory-order") && ok("notes.view")) {
      const hd = root.querySelector(".page-head");
      if (hd && !hd.querySelector("#p4-fn-btn")) {
        const n = factoryNotesCount();
        const holder = hd.querySelector(".filters") || hd;
        holder.insertAdjacentHTML("afterbegin", `<button class="btn btn-primary" id="p4-fn-btn" data-p4="fnotes" title="كل ملاحظات العملاء بجانب طلباتهم">${C.icon("clipboard", 18)} ملاحظات العملاء${n ? ` (${n})` : ""}</button>`);
        hd.querySelector("#p4-fn-btn").onclick = (e) => { e.preventDefault(); e.stopPropagation(); factoryNotesModal(); };
      }

      const host = root.querySelector(".content");
      if (host && !host.querySelector("#p4-fcard")) {
        host.insertAdjacentHTML("beforeend", factoryCard(route));
        host.querySelectorAll("#p4-fcard [data-p4=add]").forEach((b) => (b.onclick = () => noteModal(b.dataset.cust, b.dataset.order)));
        host.querySelectorAll("#p4-fcard [data-act=p4-note-del]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); handle("p4-note-del", b); }));
      }
    }
    if (r0 === "notes") {
      const q = root.querySelector("#p4-nq"), c = root.querySelector("#p4-nc");
      if (q) q.oninput = () => { C.S.nq = q.value; C.render(true); const n = document.getElementById("p4-nq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
      if (c) c.onchange = () => { C.S.ncust = c.value; C.render(true); };
    }
  }

  function nav(n) {
    if (!C.S.user || !C.S.roles.length) return;
    const add = [];
    if (ok("notes.view") && (isMgr() || myRoles().some((r) => L(SAL + "," + FAC).includes(r)))) add.push(["notes", "ملحوظات العملاء", "clipboard"]);
    if (ok("templates.view") && (isMgr() || has("sales"))) add.push(["templates", "قوالب العقود", "contract"]);
    if (!add.length) return;
    const at = n.findIndex((x) => x[0] === "sep");
    if (at === -1) n.push(["sep"], ...add); else n.splice(at, 0, ...add);
  }
  const has = (...r) => C.has(...r);

  // مساعد: أنماط
  (function () {
    const s = document.createElement("style"); s.id = "p4-css";
    s.textContent = `.p4-perm-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-height:56vh;overflow:auto}
    .p4-pg{border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:0}.p4-pg legend{font-weight:800;color:var(--brand-dark);padding:0 6px;font-size:13px}
    .p4-pc{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:14px;cursor:pointer}.p4-pc input{width:18px;height:18px;accent-color:var(--brand)}
    .p4-note{border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-top:8px;background:#fff}.p4-note-h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px}.p4-note-h span{color:var(--muted)}.p4-note-h time{margin-inline-start:auto;color:var(--muted);font-size:12px}
    .p4-note-b{white-space:pre-wrap;margin-top:4px;line-height:1.8}
    .p4-fn-tools{margin-bottom:10px}.p4-fn-grid{display:grid;grid-template-columns:1fr 2fr;gap:14px}.p4-fn-orders,.p4-fn-notes{display:flex;flex-direction:column;gap:6px}
    .p4-fn-ord{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:inherit}
    @media(max-width:760px){.p4-perm-grid,.p4-fn-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  })();

  window.HM_P4 = { sql(miss) { if (miss && miss.length) P4.miss = miss.slice(); sqlModal(); } };
  window.HM_PERM = { ok, routeOk, navOk, blockAction: (a, el) => { if (isMgr() || !blocked(a, el)) return false; deny(actKey(a, el)); return true; }, userCell, keys: () => PERMS.slice() };

  window.HM_EXT = window.HM_EXT || [];
  window.HM_EXT.push({
    name: "phase4",
    init(ctx) { C = ctx; },
    load,
    realtimeTables: () => [].concat(P4.missing.perms ? [] : ["hm_user_perms"], P4.missing.notes ? [] : ["hm_notes"]),
    nav, bind, action,
    topbar: () => (C && C.S.user && isMgr() && P4.miss.length ? `<button class="btn btn-sm btn-danger" data-act="p4-sql" title="يلزم تشغيل ملف التحديث مرة واحدة">${C.icon("alert", 16)} تحديث القاعدة مطلوب</button>` : ""),
    customerSection: (c) => (ok("notes.view") && (notesFor(c.id).length || canAddNote()) ? `<div class="card mt"><div class="card-head"><h3>${C.icon("clipboard")} ملحوظات العميل</h3>${canAddNote() ? `<button class="btn btn-ghost btn-sm" data-act="p4-note-add" data-cust="${c.id}">+ ملحوظة</button>` : ""}</div>${notesFor(c.id).map(noteHtml).join("") || '<div class="empty">لا توجد ملحوظات</div>'}</div>` : ""),
    auditLabels: () => ({ hm_user_perms: "الصلاحيات الفرعية", hm_templates: "قوالب العقود", hm_notes: "ملحوظات العملاء" }),
    pages: { notes: pageNotes },
  });
})();
