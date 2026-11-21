/* هوم ماربل v5.5 — قوالب العقود: رفع قالب من الجهاز (صورة / PDF / Word) ثم تعديله داخل النظام كأنه برنامج تصميم
   (كتابة، حذف، إضافة، سحب وتحريك وتغيير حجم، حقول تُملأ تلقائياً من العقد، صور، جدول بنود) ثم طباعته.
   ملف إضافي عبر window.HM_EXT. */
(function () {
  "use strict";
  let C = null;
  const TP = { list: [], missing: false, urls: {} };
  const PW = { landscape: [1123, 794], portrait: [794, 1123] };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (v) => C.esc(v);
  const FILES = () => window.HM_FILES;
  const canEdit = () => !window.HM_PERM || window.HM_PERM.ok("templates.edit");
  const CT_KEYS = [["material", "نوع الخامة / الرخام"], ["color", "اللون"], ["thickness", "السماكة"], ["finish", "التشطيب"], ["dimensions", "الأبعاد / المقاسات"], ["area", "المساحة الإجمالية"], ["delivery", "مدة التنفيذ / التسليم"], ["install", "ملاحظات التركيب"]];
  const TOKENS = [["customer_name", "اسم العميل"], ["customer_phone", "جوال العميل"], ["customer_city", "مدينة العميل"], ["customer_address", "عنوان العميل"], ["customer_type", "نوع العميل (فرد/شركة)"], ["customer_contact", "الشخص المسؤول (شركة)"], ["customer_cr", "السجل التجاري"], ["customer_tax", "الرقم الضريبي"], ["contract_no", "رقم العقد"], ["date", "تاريخ العقد"], ["title", "عنوان العقد"], ["order_no", "رقم الطلب"], ["work_type", "نوع العمل"], ["branch", "الفرع"], ["total", "إجمالي العقد"], ["deposit", "الدفعة المقدمة"], ["remaining", "المتبقي"], ["payment_terms", "شروط الدفع"], ["terms", "الشروط والأحكام"]].concat(CT_KEYS);

  const blankPage = (o) => ({ id: uid(), w: PW[o || "landscape"][0], h: PW[o || "landscape"][1], bg: "", items: [] });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------------ بيانات العقد
  function buildCtx(x) {
    const c = C.cust(x.customer_id) || {}; const o = C.S.orders.find((y) => y.id === x.order_id); const m = x.meta || {}; const f = m.fields || {};
    const total = Number(x.amount || 0); const dep = Number(m.deposit != null && m.deposit !== "" ? m.deposit : o ? o.required_deposit : 0);
    const v = { customer_name: c.name || "", customer_phone: c.phone || "", customer_city: c.city || "", customer_address: c.address || "", customer_type: c.customer_type === "company" ? "شركة" : "فرد", customer_contact: c.contact_person || "", customer_cr: c.cr_no || "", customer_tax: c.tax_no || "", contract_no: x.doc_no || "", date: C.d(x.created_at || new Date()), title: x.title || "", order_no: o ? o.order_no : "", work_type: o ? o.work_type : "", branch: C.branchName(o ? o.branch_id : c.branch_id), total: C.money(total), deposit: C.money(dep), remaining: C.money(Math.max(0, total - dep)), payment_terms: m.payment_terms || "", terms: x.details || "" };
    CT_KEYS.forEach((k) => (v[k[0]] = f[k[0]] || ""));
    return { vals: v, items: Array.isArray(x.items) ? x.items : [], design: m.design_images || [], drawing: m.drawing_images || [] };
  }
  const SAMPLE = { vals: Object.fromEntries(TOKENS.map((t) => [t[0], "‹" + t[1] + "›"])), items: [{ name: "بند تجريبي", qty: 2, price: 1500, sale_type: "meter" }, { name: "بند آخر", qty: 1, price: 800, sale_type: "piece" }], design: [], drawing: [] };
  const fill = (t, ctx) => String(t == null ? "" : t).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (ctx.vals[k] != null ? ctx.vals[k] : ""));

  // ------------------------------------------------------------------ الصور (Storage)
  const isPath = (p) => p && !/^(data:|https?:|blob:)/.test(p);
  async function ensureUrls(paths) {
    const need = [...new Set(paths.filter((p) => isPath(p) && !TP.urls[p]))];
    if (need.length) { try { const r = await C.sb.storage.from("hm-files").createSignedUrls(need, 3600); (r.data || []).forEach((u) => { if (u.signedUrl) TP.urls[u.path] = u.signedUrl; }); } catch (e) { console.error(e); } }
  }
  const urlOf = (p) => (isPath(p) ? TP.urls[p] || "" : p || "");
  const pagePaths = (pages, ctx) => { const a = []; pages.forEach((pg) => { a.push(pg.bg); pg.items.forEach((i) => { if (i.t === "img") a.push(i.src); }); }); if (ctx) a.push(...(ctx.design || []), ...(ctx.drawing || [])); return a.filter(Boolean); };
  async function uploadFile(file, folder) { const F = FILES(); if (!F) { C.toast("رفع الملفات غير متاح", "err"); return null; } const r = await F.upload([file], folder || "templates"); return r && r[0] ? r[0] : null; }

  // ------------------------------------------------------------------ رسم عنصر (للمحرر وللطباعة)
  function itemStyle(i) { return `left:${i.x}px;top:${i.y}px;width:${i.w}px;${i.t === "items" || i.t === "text" && i.auto ? "" : "height:" + i.h + "px;"}`; }
  function itemInner(i, ctx, edit, showData) {
    const data = !edit || showData;
    if (i.t === "text") { const tx = data ? fill(i.text, ctx) : i.text; return `<div class="tp-tx" style="font-size:${i.fs || 16}px;color:${esc(i.color || "#2a1a1b")};font-weight:${i.b ? 800 : 400};font-style:${i.i ? "italic" : "normal"};text-decoration:${i.u ? "underline" : "none"};text-align:${i.al || "right"};line-height:${i.lh || 1.5}">${esc(tx)}</div>`; }
    if (i.t === "img") return `<img src="${esc(urlOf(i.src))}" alt="" style="width:100%;height:100%;object-fit:${i.fit || "contain"}">`;
    if (i.t === "design" || i.t === "drawing") { const arr = i.t === "design" ? ctx.design : ctx.drawing; if (!data || !arr.length) return `<div class="tp-ph">${i.t === "design" ? "صورة التصميم" : "الرسم الهندسي"}</div>`; return `<div class="tp-gal ${arr.length > 1 ? "many" : ""}">${arr.map((p) => `<img src="${esc(urlOf(p))}" alt="">`).join("")}</div>`; }
    if (i.t === "items") { const rows = (data ? ctx.items : SAMPLE.items); const fs = i.fs || 13; return `<table class="tp-tb" style="font-size:${fs}px"><thead><tr><th>#</th><th>البند</th><th>النوع</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows.map((r, n) => `<tr><td>${n + 1}</td><td>${esc(r.name)}</td><td>${r.sale_type === "meter" ? "بالمتر" : "بالقطعة"}</td><td>${esc(r.qty)}</td><td>${C.money(r.price)}</td><td>${C.money(Number(r.qty) * Number(r.price))}</td></tr>`).join("")}</tbody></table>`; }
    return "";
  }
  function itemBox(i, ctx, edit, showData) {
    const box = i.t === "rect" ? `background:${esc(i.bg || "transparent")};border:${i.bw || 1}px solid ${esc(i.bd || "#7e1416")};border-radius:${i.r || 0}px;` : i.t === "line" ? `border-top:${i.bw || 2}px solid ${esc(i.bd || "#2a1a1b")};height:0;` : `background:${esc(i.bg || "transparent")};${i.bw ? `border:${i.bw}px solid ${esc(i.bd || "#999")};` : ""}`;
    return `<div class="tp-it ${edit ? "tp-edit" : ""}" data-id="${i.id}" style="${itemStyle(i)}${box}">${itemInner(i, ctx, edit, showData)}</div>`;
  }
  function pageHtml(pg, ctx, edit, showData) {
    return `<div class="tp-page" style="width:${pg.w}px;height:${pg.h}px;${pg.bg ? `background-image:url('${esc(urlOf(pg.bg))}');` : ""}">${pg.items.map((i) => itemBox(i, ctx, edit, showData)).join("")}</div>`;
  }
  const PAGE_CSS = `.tp-page{position:relative;background:#fff center/100% 100% no-repeat;overflow:hidden;font-family:Tajawal,Tahoma,sans-serif;direction:rtl;box-sizing:border-box}
  .tp-it{position:absolute;box-sizing:border-box}.tp-tx{white-space:pre-wrap;word-break:break-word}
  .tp-gal{display:flex;flex-wrap:wrap;gap:4px;width:100%;height:100%}.tp-gal img{max-width:100%;max-height:100%;object-fit:contain;flex:1 1 45%;min-width:0}.tp-gal:not(.many) img{flex:1 1 100%}
  .tp-ph{width:100%;height:100%;display:grid;place-items:center;border:2px dashed #c9b6b5;color:#9a8b8c;font-size:14px;background:rgba(250,245,244,.6)}
  .tp-tb{width:100%;border-collapse:collapse;background:rgba(255,255,255,.85)}.tp-tb th{background:#7e1416;color:#fff;padding:4px 6px;text-align:right}.tp-tb td{border-bottom:1px solid #ddd;padding:3px 6px}`;

  // ------------------------------------------------------------------ المحرر
  function openEditor(opt) {
    const ctxReal = opt.ctx || null;
    const pages = clone(opt.pages && opt.pages.length ? opt.pages : [blankPage()]);
    let cur = 0, sel = null, zoom = 0.75, showData = false, hist = [], dirty = false, drag = null;
    const root = document.createElement("div"); root.className = "tpe"; root.dir = "rtl";
    document.body.appendChild(root); document.body.style.overflow = "hidden";
    const ctx = () => (showData ? (ctxReal || SAMPLE) : SAMPLE);
    const item = () => (sel ? pages[cur].items.find((i) => i.id === sel) : null);
    const snap = () => { hist.push(JSON.stringify(pages)); if (hist.length > 60) hist.shift(); dirty = true; };
    const undo = () => { const h = hist.pop(); if (!h) return; const p = JSON.parse(h); pages.length = 0; pages.push(...p); cur = Math.min(cur, pages.length - 1); if (!item()) sel = null; paint(); };

    root.innerHTML = `<div class="tpe-bar">
        <b class="tpe-t">${esc(opt.title || "محرر القالب")}</b>
        <button data-a="text" title="إضافة نص">＋ نص</button>
        <select data-a="token"><option value="">＋ حقل تلقائي…</option>${TOKENS.map((t) => `<option value="${t[0]}">${esc(t[1])}</option>`).join("")}</select>
        <button data-a="img">صورة</button><button data-a="rect">مستطيل</button><button data-a="line">خط</button>
        <button data-a="items">جدول البنود</button><button data-a="design">صورة التصميم</button><button data-a="drawing">الرسم الهندسي</button>
        <span class="tpe-sp"></span>
        <button data-a="undo" title="Ctrl+Z">↶ تراجع</button><button data-a="dup" title="Ctrl+D">تكرار</button><button data-a="del" title="Delete">حذف</button>
        <label class="tpe-chk"><input type="checkbox" id="tpe-data"> معاينة بالبيانات</label>
        <button data-a="zout">−</button><span id="tpe-z"></span><button data-a="zin">＋</button><button data-a="zfit">ملاءمة</button>
        <button class="tpe-save" data-a="save">حفظ</button><button data-a="close">إغلاق</button></div>
      <div class="tpe-body"><div class="tpe-stagewrap" id="tpe-sw"><div id="tpe-stage"></div></div>
      <aside class="tpe-side" id="tpe-side"></aside></div>
      <div class="tpe-pages" id="tpe-pg"></div><input type="file" id="tpe-file" hidden>`;
    const $ = (s) => root.querySelector(s);

    function paint() {
      const pg = pages[cur];
      $("#tpe-stage").innerHTML = `<div class="tpe-scale" style="width:${pg.w * zoom}px;height:${pg.h * zoom}px"><div style="transform:scale(${zoom});transform-origin:top right;width:${pg.w}px;height:${pg.h}px;position:absolute;right:0;top:0">${pageHtml(pg, ctx(), true, showData)}</div></div>`;
      $("#tpe-z").textContent = Math.round(zoom * 100) + "%";
      ensureUrls(pagePaths(pages, ctxReal)).then(() => { const ph = $("#tpe-stage .tp-page"); if (!ph) return; if (pg.bg) ph.style.backgroundImage = `url('${urlOf(pg.bg)}')`; ph.querySelectorAll(".tp-it img").forEach((im) => { const it = pg.items.find((i) => i.id === im.closest(".tp-it").dataset.id); if (it) { const arr = it.t === "img" ? [it.src] : []; if (arr.length) im.src = urlOf(it.src); } }); });
      if (sel) { const el = $(`.tp-it[data-id="${sel}"]`); if (el) { el.classList.add("sel"); el.insertAdjacentHTML("beforeend", '<i class="tpe-rs" data-rs="1"></i>'); } }
      $("#tpe-pg").innerHTML = pages.map((p, n) => `<button class="${n === cur ? "on" : ""}" data-pg="${n}">صفحة ${n + 1}</button>`).join("") + `<button data-a="addpg">＋ صفحة</button>${pages.length > 1 ? '<button data-a="delpg">حذف الصفحة</button>' : ""}`;
      side();
    }
    function side() {
      const i = item(); const pg = pages[cur];
      if (!i) { $("#tpe-side").innerHTML = `<h4>الصفحة ${cur + 1}</h4><p class="tpe-hint">اضغط على أي عنصر لتحديده، اسحبه لتحريكه، واسحب المربع في زاويته لتغيير الحجم. انقر مرتين على أي نص لتعديله مباشرة.</p>
        <div class="tpe-row"><button data-a="bgup">رفع خلفية القالب</button>${pg.bg ? '<button data-a="bgdel">إزالة الخلفية</button>' : ""}</div>
        <div class="tpe-row"><button data-a="orient">تبديل (أفقي/عمودي)</button></div><p class="tpe-hint">الخلفية = صورة القالب الأصلي (يمكن رفع JPG/PNG/PDF/Word). كل ما يُضاف فوقها قابل للتعديل.</p>`; return; }
      const num = (k, l) => `<label>${l}<input type="number" data-k="${k}" value="${Math.round(i[k] || 0)}"></label>`;
      let h = `<h4>${{ text: "نص", img: "صورة", rect: "مستطيل", line: "خط", items: "جدول البنود", design: "صورة التصميم", drawing: "الرسم الهندسي" }[i.t]}</h4><div class="tpe-grid">${num("x", "س")}${num("y", "ص")}${num("w", "العرض")}${i.t === "line" || i.t === "items" ? "" : num("h", "الارتفاع")}</div>`;
      if (i.t === "text") h += `<label>النص <small>(يمكن كتابة {{customer_name}} مثلاً)</small><textarea id="tpe-tx" rows="6">${esc(i.text)}</textarea></label>
        <div class="tpe-grid">${num("fs", "حجم الخط")}<label>لون الخط<input type="color" data-k="color" value="${esc(i.color || "#2a1a1b")}"></label></div>
        <div class="tpe-row"><button data-t="b" class="${i.b ? "on" : ""}"><b>B</b></button><button data-t="i" class="${i.i ? "on" : ""}"><i>I</i></button><button data-t="u" class="${i.u ? "on" : ""}"><u>U</u></button><button data-al="right" class="${(i.al || "right") === "right" ? "on" : ""}">يمين</button><button data-al="center" class="${i.al === "center" ? "on" : ""}">وسط</button><button data-al="left" class="${i.al === "left" ? "on" : ""}">يسار</button></div>
        <label>لون الخلفية<input type="color" data-k="bg" value="${/^#/.test(i.bg || "") ? i.bg : "#ffffff"}"> <button data-a="nobg" class="tpe-mini">بدون</button></label>`;
      if (i.t === "items") h += num("fs", "حجم الخط");
      if (i.t === "img") h += `<div class="tpe-row"><button data-a="imgrep">استبدال الصورة</button><button data-a="fit">${i.fit === "cover" ? "ملاءمة: تغطية" : "ملاءمة: احتواء"}</button></div>`;
      if (i.t === "rect") h += `<div class="tpe-grid"><label>لون الحد<input type="color" data-k="bd" value="${esc(i.bd || "#7e1416")}"></label><label>لون التعبئة<input type="color" data-k="bg" value="${/^#/.test(i.bg || "") ? i.bg : "#ffffff"}"></label></div><button data-a="nobg" class="tpe-mini">بدون تعبئة</button>${num("bw", "سمك الحد")}`;
      if (i.t === "line") h += `<label>اللون<input type="color" data-k="bd" value="${esc(i.bd || "#2a1a1b")}"></label>${num("bw", "السمك")}`;
      h += `<div class="tpe-row"><button data-a="front">للأمام</button><button data-a="back">للخلف</button><button data-a="dup">تكرار</button><button data-a="del" class="tpe-danger">حذف</button></div>`;
      $("#tpe-side").innerHTML = h;
    }
    const add = (o) => { snap(); const i = Object.assign({ id: uid(), x: 80, y: 80, w: 240, h: 60 }, o); pages[cur].items.push(i); sel = i.id; paint(); return i; };
    const fitZoom = () => { const sw = $("#tpe-sw"); const pg = pages[cur]; zoom = Math.max(0.25, Math.min(1.5, Math.min((sw.clientWidth - 40) / pg.w, (sw.clientHeight - 40) / pg.h))); paint(); };
    const pickFile = (accept, cb) => { const f = $("#tpe-file"); f.accept = accept; f.value = ""; f.onchange = () => f.files[0] && cb(f.files[0]); f.click(); };
    async function setBackground(file) {
      C.toast("جارٍ تجهيز القالب...", "ok");
      try {
        const imgs = await fileToImages(file);
        if (!imgs.length) return;
        snap();
        for (let n = 0; n < imgs.length; n++) {
          const p = await uploadFile(imgs[n].file, "templates"); if (!p) return;
          const o = imgs[n].w > imgs[n].h ? "landscape" : "portrait";
          const pg = n === 0 && !pages[cur].bg && !pages[cur].items.length ? pages[cur] : (n === 0 ? pages[cur] : (pages[cur + n] = pages[cur + n] || blankPage(o)));
          if (n === 0 && !pages[cur].items.length) { pages[cur].w = PW[o][0]; pages[cur].h = PW[o][1]; }
          pg.bg = p;
          if (n > 0) { pg.w = PW[o][0]; pg.h = PW[o][1]; }
          if (imgs[n].text && imgs[n].text.length) imgs[n].text.forEach((tx) => pg.items.push(tx));
        }
        await ensureUrls(pagePaths(pages, ctxReal)); paint(); fitZoom();
      } catch (e) { console.error(e); C.toast("تعذّر قراءة الملف: " + (e.message || e), "err"); }
    }

    // ---- أحداث الأزرار
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-a],[data-pg],[data-t],[data-al]"); if (!b || b.tagName === "SELECT") return;
      if (b.dataset.pg != null) { cur = +b.dataset.pg; sel = null; paint(); fitZoom(); return; }
      const i = item();
      if (b.dataset.t && i) { snap(); i[b.dataset.t] = !i[b.dataset.t]; paint(); return; }
      if (b.dataset.al && i) { snap(); i.al = b.dataset.al; paint(); return; }
      const a = b.dataset.a;
      if (a === "text") add({ t: "text", text: "نص جديد", fs: 18, w: 260, h: 40 });
      else if (a === "img") pickFile("image/*", async (f) => { const p = await uploadFile(f, "templates"); if (!p) return; await ensureUrls([p]); add({ t: "img", src: p, w: 200, h: 150 }); });
      else if (a === "rect") add({ t: "rect", w: 300, h: 120, bd: "#7e1416", bw: 2 });
      else if (a === "line") add({ t: "line", w: 300, h: 0, bd: "#2a1a1b", bw: 2 });
      else if (a === "items") add({ t: "items", w: pages[cur].w - 160, h: 160, x: 80, y: 360, fs: 13 });
      else if (a === "design") add({ t: "design", w: 360, h: 260 });
      else if (a === "drawing") add({ t: "drawing", w: 380, h: 280, x: 500 });
      else if (a === "undo") undo();
      else if (a === "dup" && i) { snap(); const c2 = Object.assign(clone(i), { id: uid(), x: i.x + 20, y: i.y + 20 }); pages[cur].items.push(c2); sel = c2.id; paint(); }
      else if (a === "del" && i) { snap(); pages[cur].items = pages[cur].items.filter((z) => z.id !== i.id); sel = null; paint(); }
      else if (a === "front" && i) { snap(); const arr = pages[cur].items; arr.push(arr.splice(arr.indexOf(i), 1)[0]); paint(); }
      else if (a === "back" && i) { snap(); const arr = pages[cur].items; arr.unshift(arr.splice(arr.indexOf(i), 1)[0]); paint(); }
      else if (a === "nobg" && i) { snap(); i.bg = ""; paint(); }
      else if (a === "fit" && i) { snap(); i.fit = i.fit === "cover" ? "contain" : "cover"; paint(); }
      else if (a === "imgrep" && i) pickFile("image/*", async (f) => { const p = await uploadFile(f, "templates"); if (!p) return; snap(); i.src = p; await ensureUrls([p]); paint(); });
      else if (a === "zin") { zoom = Math.min(2, zoom + 0.1); paint(); }
      else if (a === "zout") { zoom = Math.max(0.25, zoom - 0.1); paint(); }
      else if (a === "zfit") fitZoom();
      else if (a === "bgup") pickFile("image/*,.pdf,.docx,application/pdf", setBackground);
      else if (a === "bgdel") { snap(); pages[cur].bg = ""; paint(); }
      else if (a === "orient") { snap(); const p = pages[cur]; [p.w, p.h] = [p.h, p.w]; paint(); fitZoom(); }
      else if (a === "addpg") { snap(); pages.push(blankPage(pages[cur].w > pages[cur].h ? "landscape" : "portrait")); cur = pages.length - 1; sel = null; paint(); fitZoom(); }
      else if (a === "delpg") { if (confirm("حذف هذه الصفحة؟")) { snap(); pages.splice(cur, 1); cur = Math.max(0, cur - 1); sel = null; paint(); fitZoom(); } }
      else if (a === "save") { b.disabled = true; try { await opt.onSave(clone(pages)); dirty = false; C.toast("تم حفظ القالب ✓", "ok"); } catch (er) { C.toast(C.errMsg(er), "err"); } b.disabled = false; }
      else if (a === "close") { if (!dirty || confirm("توجد تعديلات غير محفوظة. إغلاق بدون حفظ؟")) close(); }
    });
    root.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.a === "token" && t.value) { const tk = "{{" + t.value + "}}"; const i = item(); const ta = $("#tpe-tx"); if (i && i.t === "text" && ta) { snap(); const s = ta.selectionStart == null ? ta.value.length : ta.selectionStart; ta.value = ta.value.slice(0, s) + tk + ta.value.slice(ta.selectionEnd == null ? s : ta.selectionEnd); i.text = ta.value; paint(); } else add({ t: "text", text: tk, fs: 18, w: 220, h: 36 }); t.value = ""; return; }
      if (t.id === "tpe-data") { showData = t.checked; paint(); return; }
      const i = item(); if (!i || !t.dataset.k) return;
      snap(); const v = t.type === "number" ? Number(t.value) : t.value; i[t.dataset.k] = v; paint();
    });
    root.addEventListener("input", (e) => { const t = e.target; if (t.id === "tpe-tx") { const i = item(); if (i) { if (!t._s) { snap(); t._s = 1; } i.text = t.value; const el = $(`.tp-it[data-id="${i.id}"] .tp-tx`); if (el) el.textContent = showData ? fill(i.text, ctx()) : i.text; dirty = true; } } });

    // ---- السحب والتحريك وتغيير الحجم
    const stage = $("#tpe-stage");
    stage.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".tp-it"); if (!el) { if (sel) { sel = null; paint(); } return; }
      if (el.isContentEditable) return;
      const i = pages[cur].items.find((z) => z.id === el.dataset.id); if (!i) return;
      if (sel !== i.id) { sel = i.id; paint(); }
      const rs = !!e.target.closest("[data-rs]");
      drag = { id: i.id, mode: rs ? "rs" : "mv", sx: e.clientX, sy: e.clientY, ox: i.x, oy: i.y, ow: i.w, oh: i.h, moved: false };
      e.preventDefault();
    });
    const onMove = (e) => {
      if (!drag) return; const i = pages[cur].items.find((z) => z.id === drag.id); if (!i) return;
      const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      if (!drag.moved) { snap(); drag.moved = true; }
      if (drag.mode === "mv") { i.x = Math.round(drag.ox + dx); i.y = Math.round(drag.oy + dy); }
      else { i.w = Math.max(10, Math.round(drag.ow + dx)); i.h = Math.max(i.t === "line" ? 0 : 10, Math.round(drag.oh + dy)); }
      const el = $(`.tp-it[data-id="${i.id}"]`); if (el) { el.style.left = i.x + "px"; el.style.top = i.y + "px"; el.style.width = i.w + "px"; if (i.t !== "items" && i.t !== "line") el.style.height = i.h + "px"; }
    };
    const onUp = () => { if (drag && drag.moved) side(); drag = null; };
    document.addEventListener("pointermove", onMove); document.addEventListener("pointerup", onUp);
    stage.addEventListener("dblclick", (e) => {
      const el = e.target.closest(".tp-it"); if (!el) return; const i = pages[cur].items.find((z) => z.id === el.dataset.id); if (!i || i.t !== "text") return;
      const tx = el.querySelector(".tp-tx"); tx.textContent = i.text; tx.contentEditable = "true"; el.style.cursor = "text"; tx.focus();
      const rg = document.createRange(); rg.selectNodeContents(tx); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
      tx.onblur = () => { const v = tx.innerText.replace(/\n$/, ""); if (v !== i.text) { snap(); i.text = v; } paint(); };
    });
    const onKey = (e) => {
      if (!document.body.contains(root)) return;
      const ed = e.target.closest && e.target.closest("input,textarea,select,[contenteditable=true]");
      if (e.ctrlKey && (e.key === "z" || e.key === "Z") && !ed) { e.preventDefault(); undo(); return; }
      if (ed) return; const i = item(); if (!i) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); snap(); pages[cur].items = pages[cur].items.filter((z) => z.id !== i.id); sel = null; paint(); }
      else if (e.ctrlKey && (e.key === "d" || e.key === "D")) { e.preventDefault(); snap(); const c2 = Object.assign(clone(i), { id: uid(), x: i.x + 20, y: i.y + 20 }); pages[cur].items.push(c2); sel = c2.id; paint(); }
      else if (e.key.startsWith("Arrow")) { e.preventDefault(); snap(); const st = e.shiftKey ? 10 : 1; if (e.key === "ArrowLeft") i.x -= st; if (e.key === "ArrowRight") i.x += st; if (e.key === "ArrowUp") i.y -= st; if (e.key === "ArrowDown") i.y += st; paint(); }
    };
    document.addEventListener("keydown", onKey);
    function close() { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); document.removeEventListener("keydown", onKey); root.remove(); document.body.style.overflow = ""; if (opt.onClose) opt.onClose(); }
    paint(); setTimeout(fitZoom, 60);
    return { close };
  }

  // ------------------------------------------------------------------ تحويل الملفات المرفوعة إلى صفحات
  const loadScript = (src) => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("تعذّر تحميل مكتبة القراءة (تحتاج اتصال إنترنت)")); document.head.appendChild(s); });
  const imgFromFile = (file) => new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => res({ im, u }); im.onerror = () => rej(new Error("صورة غير صالحة")); im.src = u; });
  async function canvasToFile(cv, name) { const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.88)); return new File([b], name, { type: "image/jpeg" }); }
  async function fileToImages(file) {
    const name = (file.name || "").toLowerCase();
    if (file.type.startsWith("image/")) {
      const { im, u } = await imgFromFile(file); const mx = 2400; const k = Math.min(1, mx / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u);
      return [{ file: await canvasToFile(cv, "tpl.jpg"), w: cv.width, h: cv.height }];
    }
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
      const lib = window.pdfjsLib; if (!lib) throw new Error("مكتبة PDF غير متاحة");
      try { const wt = await (await fetch("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js")).text(); lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([wt], { type: "text/javascript" })); } catch (e) { lib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"; }
      const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise; const out = [];
      for (let n = 1; n <= Math.min(pdf.numPages, 12); n++) {
        const pg = await pdf.getPage(n); const v1 = pg.getViewport({ scale: 1 }); const sc = 1700 / Math.max(v1.width, v1.height); const vp = pg.getViewport({ scale: sc });
        const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        out.push({ file: await canvasToFile(cv, `tpl-p${n}.jpg`), w: cv.width, h: cv.height });
      }
      return out;
    }
    if (name.endsWith(".docx")) {
      await loadScript("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js");
      const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      const paras = String(r.value || "").split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
      const W = 1123, H = 794, fs = 15, lh = 1.6, per = Math.floor((W - 160) / (fs * 0.52)); const pagesTx = []; let y = 60, cur = [];
      paras.forEach((p) => { const lines = Math.max(1, Math.ceil(p.length / per)); const h = Math.round(lines * fs * lh) + 8; if (y + h > H - 50 && cur.length) { pagesTx.push(cur); cur = []; y = 60; } cur.push({ id: uid(), t: "text", x: 80, y, w: W - 160, h, text: p, fs, al: "right", lh }); y += h + 6; });
      if (cur.length) pagesTx.push(cur);
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      const wf = await canvasToFile(cv, "blank.jpg");
      return pagesTx.map((t) => ({ file: wf, w: W, h: H, text: t }));
    }
    throw new Error("نوع الملف غير مدعوم. ارفع صورة (JPG/PNG) أو PDF أو Word (.docx)");
  }

  // ------------------------------------------------------------------ تحميل + حفظ القوالب
  async function load() {
    const r = await C.sb.from("hm_templates").select("*").order("created_at", { ascending: false });
    if (r.error) { TP.missing = true; TP.list = []; } else { TP.missing = false; TP.list = r.data || []; }
  }
  const byId = (id) => TP.list.find((t) => t.id === id);
  const defTpl = () => TP.list.find((t) => t.is_default && t.kind === "contract");
  function effective(x) {
    const m = x.meta || {};
    if (m.tpl_pages && m.tpl_pages.length) return { pages: m.tpl_pages, src: "custom" };
    if (m.template_id && m.template_id !== "auto") { const t = byId(m.template_id); if (t) return { pages: t.pages, src: "tpl", tpl: t }; }
    if (!m.template_id) { const t = defTpl(); if (t && t.pages && t.pages.length) return { pages: t.pages, src: "default", tpl: t }; }
    return null;
  }
  async function saveTpl(t, pages) {
    const r = await C.sb.from("hm_templates").update({ pages }).eq("id", t.id).select().single();
    if (r.error) throw r.error; Object.assign(t, r.data);
  }
  async function newTpl(name, pages) {
    const r = await C.sb.from("hm_templates").insert({ name, kind: "contract", pages, is_default: !defTpl(), created_by: C.S.user.id }).select().single();
    if (r.error) throw r.error; TP.list.unshift(r.data); return r.data;
  }
  function needSql() { if (window.HM_P4) window.HM_P4.sql(["قوالب العقود"]); else C.toast("شغّل ملف التحديث UPDATE_v5.5_RUN_THIS.sql في Supabase", "err"); }

  // ------------------------------------------------------------------ صفحة القوالب
  function pageTemplates() {
    if (window.HM_PERM && !window.HM_PERM.ok("templates.view")) return '<div class="empty">لا تملك صلاحية</div>';
    const ed = canEdit();
    return `<div class="page-head"><div><h1>قوالب العقود</h1><div class="sub">ارفع قالب العقد من جهازك (صورة / PDF / Word) ثم عدّل كل بياناته داخل النظام: كتابة وحذف وإضافة وتحريك — وسيُستخدم تلقائياً في العقود</div></div>
      ${ed ? `<div class="filters"><button class="btn btn-primary" data-act="tpl-upload">${C.icon("plus", 18)} رفع قالب من الجهاز</button><button class="btn btn-ghost" data-act="tpl-blank">قالب فارغ</button></div>` : ""}</div>
      ${TP.missing ? `<div class="p2-info">${C.icon("alert", 18)} جدول القوالب غير موجود في قاعدة البيانات بعد. <button class="btn btn-sm btn-danger" data-act="p4-sql">تحديث القاعدة</button></div>` : ""}
      <div class="grid g3">${TP.list.map((t) => `<div class="card"><div class="card-head"><h3>${esc(t.name)}</h3>${t.is_default ? '<span class="badge b-green">الافتراضي للعقود</span>' : ""}</div>
        <div class="tpl-thumb" data-tpl-thumb="${t.id}"></div><p class="p2-muted">${(t.pages || []).length} صفحة</p>
        <div class="filters"><button class="btn btn-primary btn-sm" data-act="tpl-edit" data-id="${t.id}">${ed ? "تعديل" : "عرض"}</button>${ed && !t.is_default ? `<button class="btn btn-ghost btn-sm" data-act="tpl-default" data-id="${t.id}">اجعله الافتراضي</button>` : ""}${ed ? `<button class="btn btn-line btn-sm" data-act="tpl-dup" data-id="${t.id}">نسخ</button><button class="btn btn-line btn-sm" data-act="tpl-rename" data-id="${t.id}">اسم</button>` : ""}${C.isMgr() ? `<button class="btn btn-danger btn-sm" data-act="tpl-del" data-id="${t.id}">${C.icon("trash", 16)}</button>` : ""}</div></div>`).join("") || '<div class="card"><div class="empty">لا توجد قوالب. اضغط «رفع قالب من الجهاز».</div></div>'}</div>
      <div class="card mt"><div class="card-head"><h3>الحقول التلقائية المتاحة داخل القالب</h3></div><p class="p2-muted" style="line-height:2">اكتب أي حقل بين قوسين مزدوجين داخل أي نص فيُستبدل ببيانات العقد عند الطباعة، مثل: ${TOKENS.map((t) => `<code dir="ltr">{{${t[0]}}}</code> ${esc(t[1])}`).join(" · ")}</p></div>`;
  }
  function thumbs(root) {
    (root || document).querySelectorAll("[data-tpl-thumb]").forEach(async (h) => {
      const t = byId(h.dataset.tplThumb); if (!t || !t.pages || !t.pages[0]) return; const pg = t.pages[0];
      await ensureUrls(pagePaths(t.pages)); const k = 260 / pg.w;
      h.innerHTML = `<div style="width:${pg.w * k}px;height:${pg.h * k}px;position:relative;margin:auto;border:1px solid var(--line)"><div style="transform:scale(${k});transform-origin:top right;position:absolute;right:0;top:0;width:${pg.w}px">${pageHtml(pg, SAMPLE, false, true)}</div></div>`;
    });
  }
  async function editTpl(t) {
    await ensureUrls(pagePaths(t.pages));
    openEditor({ title: "تعديل القالب: " + t.name, pages: t.pages, ctx: null, onSave: (p) => saveTpl(t, p).then(() => C.refresh()), onClose: () => C.refresh() });
  }
  function upload() {
    if (TP.missing) return needSql();
    const f = document.createElement("input"); f.type = "file"; f.accept = "image/*,.pdf,.docx,application/pdf";
    f.onchange = async () => {
      const file = f.files[0]; if (!file) return;
      try {
        C.toast("جارٍ قراءة القالب...", "ok");
        const imgs = await fileToImages(file); const pages = [];
        for (const im of imgs) { const p = await uploadFile(im.file, "templates"); if (!p) return; const o = im.w > im.h ? "landscape" : "portrait"; const pg = blankPage(o); pg.bg = p; if (im.text) pg.items.push(...im.text); pages.push(pg); }
        const t = await newTpl(file.name.replace(/\.[^.]+$/, ""), pages); C.toast("تم رفع القالب — عدّله الآن", "ok"); await C.refresh(); editTpl(t);
      } catch (e) { console.error(e); C.toast(C.errMsg(e), "err"); }
    };
    f.click();
  }

  // ------------------------------------------------------------------ داخل صفحة العقد: اختيار القالب + معاينة + تحرير نسخة العقد + طباعة
  function docSection(x) {
    if (x.kind !== "contract") return "";
    const m = x.meta || {}; const eff = effective(x);
    const opts = `<option value="auto" ${m.template_id === "auto" ? "selected" : ""}>العقد الموحد التلقائي (بدون قالب)</option>` + TP.list.map((t) => `<option value="${t.id}" ${(m.template_id === t.id || (!m.template_id && t.is_default)) && !(m.tpl_pages && m.tpl_pages.length) ? "selected" : ""}>${esc(t.name)}${t.is_default ? " (افتراضي)" : ""}</option>`).join("");
    const ed = !window.HM_PERM || window.HM_PERM.ok("contracts.edit");
    return `<div class="card mt" id="tpl-doc" data-doc="${x.id}"><div class="card-head"><h3>${C.icon("contract")} قالب العقد</h3><span class="badge ${eff ? "b-green" : "b-gray"}">${eff ? (eff.src === "custom" ? "نسخة معدّلة لهذا العقد" : "يُطبع على قالب") : "العقد الموحد التلقائي"}</span></div>
      ${TP.missing ? `<div class="p2-info">${C.icon("alert", 18)} لتفعيل القوالب شغّل ملف التحديث مرة واحدة. <button class="btn btn-sm btn-danger" data-act="p4-sql">تحديث القاعدة</button></div>` : ""}
      <div class="filters"><select class="input" id="tpl-pick" style="min-width:240px" ${ed ? "" : "disabled"}>${opts}</select>
        ${ed ? `<button class="btn btn-primary" data-act="tpl-doc-edit" data-id="${x.id}">تعديل هذا العقد على القالب</button>` : ""}
        ${m.tpl_pages && m.tpl_pages.length && ed ? `<button class="btn btn-line" data-act="tpl-doc-reset" data-id="${x.id}">إلغاء التعديلات والعودة للقالب</button>` : ""}
        <button class="btn btn-ghost" data-act="tpl-doc-print" data-id="${x.id}">${C.icon("print", 18)} طباعة العقد</button></div>
      ${eff ? '<div class="tpl-prev" id="tpl-prev"></div>' : '<p class="p2-muted mt">لم يُحدّد قالب. ارفع قالباً من «قوالب العقود» أو اختر واحداً من القائمة.</p>'}</div>`;
  }
  async function hydrateDoc(root) {
    const host = (root || document).querySelector("#tpl-doc"); if (!host) return;
    const x = C.S.documents.find((y) => y.id === host.dataset.doc); if (!x) return;
    const sel = host.querySelector("#tpl-pick");
    if (sel) sel.onchange = async () => { const meta = Object.assign({}, x.meta || {}, { template_id: sel.value }); delete meta.tpl_pages; const r = await C.sb.from("documents").update({ meta }).eq("id", x.id); if (r.error) { if (/meta/.test(r.error.message || "")) { needSql(); } return C.toast(C.errMsg(r.error), "err"); } C.toast("تم اختيار القالب", "ok"); C.refresh(); };
    const pv = host.querySelector("#tpl-prev"); const eff = effective(x); if (!pv || !eff) return;
    const ctx = buildCtx(x); await ensureUrls(pagePaths(eff.pages, ctx));
    const w = Math.min(pv.clientWidth || 800, 900);
    pv.innerHTML = eff.pages.map((pg) => { const k = w / pg.w; return `<div class="tpl-pv" style="width:${pg.w * k}px;height:${pg.h * k}px"><div style="transform:scale(${k});transform-origin:top right;position:absolute;right:0;top:0;width:${pg.w}px;height:${pg.h}px">${pageHtml(pg, ctx, false, true)}</div></div>`; }).join("");
  }
  async function editDoc(x) {
    if (TP.missing) return needSql();
    let eff = effective(x);
    if (!eff) { const t = defTpl() || TP.list[0]; if (!t) { C.toast("ارفع قالباً أولاً من صفحة «قوالب العقود»", "err"); return; } eff = { pages: t.pages }; }
    const ctx = buildCtx(x); await ensureUrls(pagePaths(eff.pages, ctx));
    openEditor({ title: `تعديل العقد #${x.doc_no} على القالب`, pages: eff.pages, ctx, onSave: async (p) => {
      const meta = Object.assign({}, x.meta || {}, { tpl_pages: p, template_id: (x.meta && x.meta.template_id) || (eff.tpl && eff.tpl.id) || "auto" });
      const r = await C.sb.from("documents").update({ meta }).eq("id", x.id).select().single();
      if (r.error) { if (/meta/.test(r.error.message || "")) needSql(); throw r.error; } x.meta = r.data.meta;
    }, onClose: () => C.refresh() });
  }
  async function printDoc(x) {
    const eff = effective(x); if (!eff) return false;
    const w = window.open("", "_blank"); if (!w) { C.toast("اسمح بالنوافذ المنبثقة للطباعة", "err"); return true; }
    const ctx = buildCtx(x); await ensureUrls(pagePaths(eff.pages, ctx));
    const p0 = eff.pages[0];
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عقد ${esc(x.doc_no || "")}</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>@page{size:${p0.w >= p0.h ? "A4 landscape" : "A4 portrait"};margin:0}html,body{margin:0;padding:0;background:#fff}${PAGE_CSS}.tp-page{page-break-after:always;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tp-page:last-child{page-break-after:auto}@media screen{body{background:#ddd;padding:10px}.tp-page{margin:0 auto 12px;box-shadow:0 2px 10px #0004}}</style></head><body>${eff.pages.map((pg) => pageHtml(pg, ctx, false, true)).join("")}<script>var im=[].slice.call(document.images);var n=im.length;function go(){setTimeout(function(){window.print()},500)}if(!n)go();else im.forEach(function(i){if(i.complete){if(!--n)go()}else{i.onload=i.onerror=function(){if(!--n)go()}}});setTimeout(function(){if(n>0)go()},6000)<\/script></body></html>`);
    w.document.close(); return true;
  }

  // ------------------------------------------------------------------ الأحداث
  async function actionAsync(a, el) {
    const id = el && el.dataset && el.dataset.id;
    if (a === "tpl-upload") { upload(); return true; }
    if (a === "tpl-blank") { if (TP.missing) { needSql(); return true; } const nm = prompt("اسم القالب:", "قالب عقد جديد"); if (nm) newTpl(nm, [blankPage()]).then((t) => { C.refresh(); editTpl(t); }).catch((e) => C.toast(C.errMsg(e), "err")); return true; }
    if (a === "tpl-edit") { const t = byId(id); if (t) editTpl(t); return true; }
    if (a === "tpl-default") { const r1 = await C.sb.from("hm_templates").update({ is_default: false }).eq("kind", "contract"); const r2 = await C.sb.from("hm_templates").update({ is_default: true }).eq("id", id); if (r1.error || r2.error) C.toast(C.errMsg(r1.error || r2.error), "err"); else { C.toast("تم تعيين القالب الافتراضي", "ok"); C.refresh(); } return true; }
    if (a === "tpl-dup") { const t = byId(id); if (t) { const r = await C.sb.from("hm_templates").insert({ name: t.name + " (نسخة)", kind: t.kind, pages: t.pages, is_default: false }); if (r.error) C.toast(C.errMsg(r.error), "err"); else { C.toast("تم النسخ", "ok"); C.refresh(); } } return true; }
    if (a === "tpl-rename") { const t = byId(id); const nm = t && prompt("اسم القالب:", t.name); if (nm) { const r = await C.sb.from("hm_templates").update({ name: nm }).eq("id", id); if (r.error) C.toast(C.errMsg(r.error), "err"); else C.refresh(); } return true; }
    if (a === "tpl-del") { if (confirm("حذف هذا القالب؟ العقود التي تستخدمه ستعود للعقد الموحد.")) { const r = await C.sb.from("hm_templates").delete().eq("id", id); if (r.error) C.toast(C.errMsg(r.error), "err"); else { C.toast("تم الحذف", "ok"); C.refresh(); } } return true; }
    if (a === "tpl-doc-edit") { const x = C.S.documents.find((y) => y.id === id); if (x) editDoc(x); return true; }
    if (a === "tpl-doc-reset") { const x = C.S.documents.find((y) => y.id === id); if (x && confirm("إلغاء كل تعديلات هذا العقد والعودة للقالب الأصلي؟")) { const meta = Object.assign({}, x.meta || {}); delete meta.tpl_pages; const r = await C.sb.from("documents").update({ meta }).eq("id", id); if (r.error) C.toast(C.errMsg(r.error), "err"); else C.refresh(); } return true; }
    if (a === "tpl-doc-print") { const x = C.S.documents.find((y) => y.id === id); if (x) { if (!(await printDoc(x))) document.querySelector('[data-act="print"]') && document.querySelector('[data-act="print"]').click(); } return true; }
    return undefined;
  }
  // يجب أن تكون متزامنة: فقط true المتزامنة توقف المعالج الافتراضي
  function action(a, el) {
    if (typeof a === "string" && a.indexOf("tpl-") === 0) {
      actionAsync(a, el).catch((e) => C.toast(C.errMsg(e), "err"));
      return true;
    }
    if (a === "print") {
      const id = el && el.dataset && el.dataset.id;
      const x = C.S.documents.find((y) => y.id === id);
      if (x && x.kind === "contract" && effective(x)) { printDoc(x); return true; }
    }
    return undefined;
  }
  function bind() { thumbs(document); hydrateDoc(document); }

  (function () { const s = document.createElement("style"); s.id = "tpl-css"; s.textContent = PAGE_CSS + `
  .tpe{position:fixed;inset:0;z-index:5000;background:#2b2425;display:flex;flex-direction:column;font-family:Tajawal,sans-serif;color:#2a1a1b}
  .tpe-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:#fff;padding:8px 12px;border-bottom:1px solid #ddd}
  .tpe-bar button,.tpe-bar select,.tpe-pages button,.tpe-side button{border:1px solid #cdbbba;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-size:13px;color:#4a1416}
  .tpe-bar button:hover,.tpe-pages button:hover,.tpe-side button:hover{background:#f6eceb}.tpe-bar .tpe-save{background:#7e1416;color:#fff;border-color:#7e1416}
  .tpe-t{margin-inline-end:10px;color:#7e1416}.tpe-sp{flex:1}.tpe-chk{font-size:13px;display:flex;gap:4px;align-items:center}
  .tpe-body{flex:1;display:flex;min-height:0}.tpe-stagewrap{flex:1;overflow:auto;padding:20px;background:#555}
  .tpe-scale{position:relative;margin:0 auto;background:#fff;box-shadow:0 4px 20px #0008}
  .tpe-side{width:300px;background:#fff;border-right:1px solid #ddd;padding:12px;overflow:auto;font-size:13px}.tpe-side h4{margin:0 0 8px;color:#7e1416}
  .tpe-side label{display:block;margin:6px 0;font-weight:700}.tpe-side input[type=number],.tpe-side textarea{width:100%;box-sizing:border-box;border:1px solid #cdbbba;border-radius:6px;padding:5px;font:inherit}
  .tpe-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.tpe-row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.tpe-side button.on{background:#7e1416;color:#fff}.tpe-danger{color:#b42318!important}
  .tpe-hint{color:#7b6b6c;font-size:12px;line-height:1.7}.tpe-mini{padding:2px 8px!important;font-size:12px!important}
  .tpe-pages{display:flex;gap:6px;background:#fff;padding:6px 12px;border-top:1px solid #ddd;overflow:auto}.tpe-pages button.on{background:#7e1416;color:#fff}
  .tp-edit{cursor:move;outline:1px dashed rgba(126,20,22,.25)}.tp-edit:hover{outline:1px dashed #7e1416}.tp-edit.sel{outline:2px solid #1d6fe0}
  .tpe-rs{position:absolute;left:-6px;bottom:-6px;width:12px;height:12px;background:#1d6fe0;border:2px solid #fff;border-radius:3px;cursor:nwse-resize}
  .tp-edit .tp-tx[contenteditable=true]{outline:2px solid #1d6fe0;background:#fff8}
  .tpl-thumb{min-height:120px;display:grid;place-items:center;background:#faf5f4;border-radius:8px;padding:8px;overflow:hidden;margin-bottom:8px}
  .tpl-prev{margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center}.tpl-pv{position:relative;border:1px solid var(--line);background:#fff;overflow:hidden}
  @media(max-width:900px){.tpe-side{width:220px}}`; document.head.appendChild(s); })();

  window.HM_TPL = { print: printDoc, effective, openEditor };
  window.HM_EXT = window.HM_EXT || [];
  window.HM_EXT.push({
    name: "tpl",
    init(ctx) { C = ctx; },
    load, action, bind, docSection,
    realtimeTables: () => (TP.missing ? [] : ["hm_templates"]),
    pages: { templates: pageTemplates },
  });
})();
