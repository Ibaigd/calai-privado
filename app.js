// ===== Storage keys
const LS_MEALS = "calai_private_v2_meals";   // { "YYYY-MM-DD": [ meal, ... ] }
const LS_BASE  = "calai_private_v2_base";
const LS_CFG   = "calai_private_v2_cfg";     // goals, pin, keepPhotos, ui
const $ = (id) => document.getElementById(id);

// ===== Defaults
const defaultsBase = () => ([
  { name:"Pollo + arroz", kcal:650, p:45, c:70, g:18 },
  { name:"Pasta boloñesa", kcal:780, p:30, c:95, g:25 },
  { name:"Pizza (2 porciones)", kcal:620, p:22, c:70, g:24 },
  { name:"Bocata lomo", kcal:560, p:30, c:55, g:22 },
  { name:"Ensalada completa", kcal:430, p:25, c:25, g:22 },
  { name:"Hamburguesa + patatas", kcal:980, p:35, c:95, g:45 },
]);

const defaultsCfg = () => ({
  goals: { kcal: 2300, p: 160, c: 250, g: 70 },
  pin: "", // "" = desactivado
  keepPhotos: true,
  chartsOpen: true,
});

// ===== Helpers
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function round(n){ return Math.round(Number(n || 0)); }
function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function pad2(n){ return String(n).padStart(2,"0"); }
function dateToKey(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function keyToDate(key){
  const [y,m,da] = key.split("-").map(Number);
  return new Date(y, (m-1), da);
}
function todayKey(){ return dateToKey(new Date()); }
function nowTime(){
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function uuid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  // fallback
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now();
}

// ===== Load/Save
function loadMeals(){
  try{ return JSON.parse(localStorage.getItem(LS_MEALS) || "{}"); } catch { return {}; }
}
function saveMeals(data){ localStorage.setItem(LS_MEALS, JSON.stringify(data)); }

function loadBase(){
  try{
    const x = JSON.parse(localStorage.getItem(LS_BASE) || "null");
    if (Array.isArray(x) && x.length) return x;
  } catch {}
  const def = defaultsBase();
  localStorage.setItem(LS_BASE, JSON.stringify(def));
  return def;
}
function saveBase(base){ localStorage.setItem(LS_BASE, JSON.stringify(base)); }

function loadCfg(){
  try{
    const x = JSON.parse(localStorage.getItem(LS_CFG) || "null");
    if (x && typeof x === "object") return { ...defaultsCfg(), ...x, goals: { ...defaultsCfg().goals, ...(x.goals||{}) } };
  } catch {}
  const def = defaultsCfg();
  localStorage.setItem(LS_CFG, JSON.stringify(def));
  return def;
}
function saveCfg(cfg){ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }

// ===== Compute
function computeFromBase(baseItem, portion, extraKcal){
  const mult = Number(portion || 1);
  const extra = Number(extraKcal || 0);
  return {
    kcal: round(baseItem.kcal * mult + extra),
    p: round(baseItem.p * mult),
    c: round(baseItem.c * mult),
    g: round(baseItem.g * mult),
  };
}

// ===== State
let state = {
  dayKey: todayKey(),
  photoDataUrl: null,
  baseFilter: "",
  baseFull: [],
  baseFiltered: [],
  cfg: loadCfg(),
};

// ===== UI: base select
function populateFoodSelect(base, selectedIdx=0){
  const sel = $("foodBase");
  sel.innerHTML = "";
  base.forEach((b, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${b.name} — ${b.kcal} kcal`;
    sel.appendChild(opt);
  });
  sel.value = String(clamp(selectedIdx, 0, Math.max(0, base.length-1)));
}

function applyBaseFilter(){
  const f = state.baseFilter.trim().toLowerCase();
  state.baseFiltered = !f
    ? state.baseFull
    : state.baseFull.filter(x => x.name.toLowerCase().includes(f));
  populateFoodSelect(state.baseFiltered, 0);
}

// ===== Totals + goals
function dayMeals(){
  const all = loadMeals();
  return all[state.dayKey] || [];
}
function daySums(meals){
  return meals.reduce((acc,m)=>({
    kcal: acc.kcal + m.kcal,
    p: acc.p + m.p,
    c: acc.c + m.c,
    g: acc.g + m.g,
  }), {kcal:0,p:0,c:0,g:0});
}

function renderGoalSummary(sum){
  const g = state.cfg.goals;
  const items = [
    { key:"kcal", label:"kcal", val: sum.kcal, goal: g.kcal },
    { key:"p", label:"proteína (g)", val: sum.p, goal: g.p },
    { key:"c", label:"carbohidratos (g)", val: sum.c, goal: g.c },
    { key:"g", label:"grasa (g)", val: sum.g, goal: g.g },
  ];

  const html = items.map(it=>{
    const pct = it.goal > 0 ? clamp((it.val/it.goal)*100, 0, 250) : 0;
    const showPct = it.goal > 0 ? `${round((it.val/it.goal)*100)}%` : "-";
    return `
      <div class="goalRow">
        <div>
          <div class="label">${it.label}</div>
          <div class="value">${round(it.val)} / ${round(it.goal)} <span class="muted">(${showPct})</span></div>
        </div>
        <div class="progress" title="${showPct}">
          <div style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  }).join("");

  $("goalSummary").innerHTML = html;
}

function renderTotals(sum){
  $("totals").innerHTML = `
    <div class="pill"><strong>${round(sum.kcal)}</strong><span>kcal</span></div>
    <div class="pill"><strong>${round(sum.p)} g</strong><span>proteína</span></div>
    <div class="pill"><strong>${round(sum.c)} g</strong><span>carbohidratos</span></div>
    <div class="pill"><strong>${round(sum.g)} g</strong><span>grasa</span></div>
  `;
}

// ===== List (edit/dup/delete)
function renderList(meals){
  const list = $("list");
  if (!meals.length){
    list.innerHTML = `<div class="muted">Aún no has añadido comidas este día.</div>`;
    return;
  }

  list.innerHTML = meals.map(m => `
    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(m.name || m.baseName)}</div>
          <div class="itemMeta">${escapeHtml(m.time)} · ${escapeHtml(m.baseName)} · porción x${m.portion}</div>
          ${m.note ? `<div class="itemMeta">Nota: ${escapeHtml(m.note)}</div>` : ""}
        </div>
        <div class="itemTitle">${m.kcal} kcal</div>
      </div>

      <div class="itemMacros">
        <span>P ${m.p}g</span>
        <span>C ${m.c}g</span>
        <span>G ${m.g}g</span>
      </div>

      <div class="itemBtns">
        <button class="ghost" data-dup="${m.id}">Duplicar</button>
        <button class="ghost" data-edit="${m.id}">Editar</button>
        <button class="ghost danger" data-del="${m.id}">Eliminar</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=> deleteMeal(btn.getAttribute("data-del")));
  });

  list.querySelectorAll("button[data-dup]").forEach(btn=>{
    btn.addEventListener("click", ()=> duplicateMeal(btn.getAttribute("data-dup")));
  });

  list.querySelectorAll("button[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> editMealPrompt(btn.getAttribute("data-edit")));
  });
}

function deleteMeal(id){
  const all = loadMeals();
  all[state.dayKey] = (all[state.dayKey] || []).filter(x => x.id !== id);
  saveMeals(all);
  refresh();
}
function duplicateMeal(id){
  const all = loadMeals();
  const meals = all[state.dayKey] || [];
  const m = meals.find(x => x.id === id);
  if (!m) return;
  const copy = { ...m, id: uuid(), time: nowTime() };
  all[state.dayKey] = [copy, ...meals];
  saveMeals(all);
  refresh();
}

function editAvoidEmpty(v){ return (v == null) ? "" : String(v); }

function editMealPrompt(id){
  const all = loadMeals();
  const meals = all[state.dayKey] || [];
  const idx = meals.findIndex(x => x.id === id);
  if (idx < 0) return;
  const m = meals[idx];

  // edición rápida por prompts (simple y gratis)
  const name = prompt("Nombre:", editAvoidEmpty(m.name || m.baseName));
  if (name === null) return;

  const kcal = prompt("kcal:", editAvoidEmpty(m.kcal));
  if (kcal === null) return;

  const p = prompt("Proteína (g):", editAvoidEmpty(m.p));
  if (p === null) return;

  const c = prompt("Carbohidratos (g):", editAvoidEmpty(m.c));
  if (c === null) return;

  const g = prompt("Grasa (g):", editAvoidEmpty(m.g));
  if (g === null) return;

  const note = prompt("Nota:", editAvoidEmpty(m.note || ""));
  if (note === null) return;

  meals[idx] = {
    ...m,
    name: name.trim() || m.name,
    kcal: round(kcal),
    p: round(p),
    c: round(c),
    g: round(g),
    note: note.trim(),
  };

  all[state.dayKey] = meals;
  saveMeals(all);
  refresh();
}

// ===== Day navigation
function setDay(key){
  state.dayKey = key;
  const d = keyToDate(key);
  const t = todayKey();
  $("dayTitle").textContent = (key === t) ? "Hoy" : d.toLocaleDateString("es-ES", { weekday:"long", day:"2-digit", month:"2-digit" });
  $("dayKeyLabel").textContent = key;
  refresh();
}
function moveDay(delta){
  const d = keyToDate(state.dayKey);
  d.setDate(d.getDate() + delta);
  setDay(dateToKey(d));
}

// ===== Photo
function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$("photo").addEventListener("change", async (e)=>{
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const url = await fileToDataUrl(file);
  state.photoDataUrl = url;
  $("previewImg").src = url;
  $("preview").classList.remove("hidden");
});
$("clearPhotoBtn").addEventListener("click", ()=>{
  $("photo").value = "";
  state.photoDataUrl = null;
  $("preview").classList.add("hidden");
});

// ===== Add meal
$("addBtn").addEventListener("click", ()=>{
  const base = state.baseFiltered.length ? state.baseFiltered : state.baseFull;
  const idx = Number($("foodBase").value || 0);
  const portion = Number($("portion").value || 1);
  const extraKcal = Number($("extraKcal").value || 0);
  const baseItem = base[idx] || base[0];
  if (!baseItem) return;

  const macros = computeFromBase(baseItem, portion, extraKcal);
  const name = $("name").value.trim();
  const note = $("note").value.trim();

  const all = loadMeals();
  const meals = all[state.dayKey] || [];

  meals.unshift({
    id: uuid(),
    time: nowTime(),
    name: name || baseItem.name,
    baseName: baseItem.name,
    portion,
    note,
    photo: state.cfg.keepPhotos ? state.photoDataUrl : null,
    ...macros
  });

  all[state.dayKey] = meals;
  saveMeals(all);

  // reset
  $("name").value = "";
  $("note").value = "";
  $("extraKcal").value = "";
  refresh();
});

$("dupLastBtn").addEventListener("click", ()=>{
  const meals = dayMeals();
  if (!meals.length) return;
  duplicateMeal(meals[0].id);
});

// ===== Reset day / all
$("resetDayBtn").addEventListener("click", ()=>{
  if (!confirm("¿Borrar todas las comidas de este día?")) return;
  const all = loadMeals();
  delete all[state.dayKey];
  saveMeals(all);
  refresh();
});
$("resetAllBtn").addEventListener("click", ()=>{
  if (!confirm("¿Reset TOTAL? Se borran comidas, base y ajustes.")) return;
  localStorage.removeItem(LS_MEALS);
  localStorage.removeItem(LS_BASE);
  localStorage.removeItem(LS_CFG);
  location.reload();
});

// ===== Base table
function renderBaseTable(base){
  const tbody = $("baseTable").querySelector("tbody");
  tbody.innerHTML = "";
  base.forEach((b, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="name" data-i="${idx}" value="${escapeHtml(b.name)}"></td>
      <td><input data-k="kcal" data-i="${idx}" inputmode="numeric" value="${b.kcal}"></td>
      <td><input data-k="p" data-i="${idx}" inputmode="numeric" value="${b.p}"></td>
      <td><input data-k="c" data-i="${idx}" inputmode="numeric" value="${b.c}"></td>
      <td><input data-k="g" data-i="${idx}" inputmode="numeric" value="${b.g}"></td>
      <td><button class="danger ghost" data-rm="${idx}">X</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const i = Number(inp.getAttribute("data-i"));
      const k = inp.getAttribute("data-k");
      let v = inp.value;
      if (k !== "name") v = Number(v || 0);
      base[i][k] = v;
      saveBase(base);
      // refresca filtro/selector
      state.baseFull = loadBase();
      applyBaseFilter();
      renderBaseTable(state.baseFull);
    });
  });

  tbody.querySelectorAll("button[data-rm]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.getAttribute("data-rm"));
      base.splice(i,1);
      saveBase(base);
      state.baseFull = loadBase();
      applyBaseFilter();
      renderBaseTable(state.baseFull);
    });
  });
}

$("addBaseBtn").addEventListener("click", ()=>{
  const base = loadBase();
  base.push({name:"Nueva comida",kcal:500,p:25,c:50,g:15});
  saveBase(base);
  state.baseFull = loadBase();
  applyBaseFilter();
  renderBaseTable(state.baseFull);
});
$("restoreDefaultsBtn").addEventListener("click", ()=>{
  const def = defaultsBase();
  saveBase(def);
  state.baseFull = loadBase();
  applyBaseFilter();
  renderBaseTable(state.baseFull);
});

// ===== Search base
$("searchBase").addEventListener("input", (e)=>{
  state.baseFilter = e.target.value || "";
  applyBaseFilter();
});

// ===== Goals editor
$("toggleGoalsBtn").addEventListener("click", ()=>{
  $("goalEditor").classList.toggle("hidden");
  const g = state.cfg.goals;
  $("goalKcal").value = g.kcal;
  $("goalP").value = g.p;
  $("goalC").value = g.c;
  $("goalG").value = g.g;
});
$("cancelGoalsBtn").addEventListener("click", ()=> $("goalEditor").classList.add("hidden"));
$("saveGoalsBtn").addEventListener("click", ()=>{
  state.cfg.goals = {
    kcal: round($("goalKcal").value),
    p: round($("goalP").value),
    c: round($("goalC").value),
    g: round($("goalG").value),
  };
  saveCfg(state.cfg);
  $("goalEditor").classList.add("hidden");
  refresh();
});

// ===== PIN + keep photos
$("savePinBtn").addEventListener("click", ()=>{
  const pin = ($("pinSet").value || "").trim();
  if (pin && !/^\d{1,6}$/.test(pin)) {
    alert("PIN inválido. Usa 1 a 6 dígitos.");
    return;
  }
  state.cfg.pin = pin;
  saveCfg(state.cfg);
  alert(pin ? "PIN guardado." : "PIN desactivado.");
  // fuerza lock si hay PIN
  enforceLock();
});

$("keepPhotos").addEventListener("change", (e)=>{
  state.cfg.keepPhotos = (e.target.value === "1");
  saveCfg(state.cfg);
});

// ===== Export / Import
function toCSV(rows){
  const cols = ["date","time","name","base","portion","kcal","p","c","g","note"];
  const esc = (v)=> `"${String(v??"").replace(/"/g,'""')}"`;
  return [cols.join(","), ...rows.map(r=> cols.map(c=>esc(r[c])).join(","))].join("\n");
}

function exportCSV(){
  const all = loadMeals();
  const rows = [];
  Object.keys(all).sort().forEach(day=>{
    (all[day]||[]).forEach(m=>{
      rows.push({
        date: day, time: m.time, name: m.name, base: m.baseName,
        portion: m.portion, kcal: m.kcal, p: m.p, c: m.c, g: m.g, note: m.note || ""
      });
    });
  });
  const csv = toCSV(rows);
  downloadText("calai_privado.csv", csv, "text/csv;charset=utf-8");
}

function exportJSON(){
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    meals: loadMeals(),
    base: loadBase(),
    cfg: loadCfg(),
  };
  downloadText("calai_privado_backup.json", JSON.stringify(payload, null, 2), "application/json");
}

function downloadText(filename, text, mime){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

$("exportCsvBtn").addEventListener("click", exportCSV);
$("exportJsonBtn").addEventListener("click", exportJSON);

$("importJsonBtn").addEventListener("click", ()=> $("importFile").click());

$("importFile").addEventListener("change", async (e)=>{
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const txt = await file.text();
  try{
    const data = JSON.parse(txt);
    if (!data || !data.meals) throw new Error("Formato no válido");
    if (!confirm("¿Importar? Esto SOBREESCRIBE tus datos actuales.")) return;

    // sanea
    localStorage.setItem(LS_MEALS, JSON.stringify(data.meals || {}));
    if (Array.isArray(data.base)) localStorage.setItem(LS_BASE, JSON.stringify(data.base));
    if (data.cfg) localStorage.setItem(LS_CFG, JSON.stringify({ ...defaultsCfg(), ...data.cfg, goals: { ...defaultsCfg().goals, ...(data.cfg.goals||{}) } }));

    alert("Importado OK. Se recarga la app.");
    location.reload();
  } catch {
    alert("No se pudo importar. Asegúrate de usar el JSON exportado por la app.");
  } finally {
    $("importFile").value = "";
  }
});

// ===== Charts (simple canvas)
function lastNDaysKeys(n){
  const keys = [];
  const d = keyToDate(state.dayKey);
  // para gráfica, tomamos hasta hoy real (mejor) si estamos en un día antiguo: usamos hoy
  const base = keyToDate(todayKey());
  for (let i = n-1; i >= 0; i--){
    const x = new Date(base);
    x.setDate(base.getDate() - i);
    keys.push(dateToKey(x));
  }
  return keys;
}

function drawLineChart(canvas, labels, values){
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
  const h = canvas.height = canvas.getAttribute("height") * (window.devicePixelRatio || 1);
  ctx.clearRect(0,0,w,h);

  const padding = 28 * (window.devicePixelRatio || 1);
  const maxV = Math.max(1, ...values);
  const minV = Math.min(0, ...values);

  const xStep = (w - padding*2) / Math.max(1, labels.length-1);
  const yScale = (h - padding*2) / (maxV - minV);

  // axes
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#25314a";
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h-padding);
  ctx.lineTo(w-padding, h-padding);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // line
  ctx.strokeStyle = "#4da3ff";
  ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x = padding + i*xStep;
    const y = h - padding - (v - minV)*yScale;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = "#4da3ff";
  values.forEach((v,i)=>{
    const x = padding + i*xStep;
    const y = h - padding - (v - minV)*yScale;
    ctx.beginPath(); ctx.arc(x,y, 4*(window.devicePixelRatio||1), 0, Math.PI*2); ctx.fill();
  });

  // labels (pocos)
  ctx.fillStyle = "#92a0b8";
  ctx.font = `${12*(window.devicePixelRatio||1)}px -apple-system, system-ui, sans-serif`;
  const step = Math.ceil(labels.length / 7);
  labels.forEach((lab,i)=>{
    if (i % step !== 0 && i !== labels.length-1) return;
    const x = padding + i*xStep;
    ctx.fillText(lab, x - 10*(window.devicePixelRatio||1), h - 8*(window.devicePixelRatio||1));
  });
}

function drawStackedBars(canvas, labels, series){ // series: [{name, values}]
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
  const h = canvas.height = canvas.getAttribute("height") * (window.devicePixelRatio || 1);
  ctx.clearRect(0,0,w,h);

  const padding = 28 * (window.devicePixelRatio || 1);
  const barW = (w - padding*2) / labels.length * 0.65;

  // max stack
  const stacks = labels.map((_,i)=> series.reduce((s,ser)=> s + (ser.values[i]||0), 0));
  const maxV = Math.max(1, ...stacks);
  const scale = (h - padding*2) / maxV;

  // axes
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#25314a";
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h-padding);
  ctx.lineTo(w-padding, h-padding);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const colors = ["#4da3ff","#88c0ff","#2a76c7"]; // ok, un poco de color aquí ayuda
  labels.forEach((lab,i)=>{
    const x = padding + (i+0.5)*(w - padding*2)/labels.length;
    let y = h - padding;
    series.forEach((ser, si)=>{
      const v = ser.values[i] || 0;
      const bh = v * scale;
      ctx.fillStyle = colors[si % colors.length];
      ctx.fillRect(x - barW/2, y - bh, barW, bh);
      y -= bh;
    });
  });

  // labels
  ctx.fillStyle = "#92a0b8";
  ctx.font = `${12*(window.devicePixelRatio||1)}px -apple-system, system-ui, sans-serif`;
  const step = Math.ceil(labels.length / 7);
  labels.forEach((lab,i)=>{
    if (i % step !== 0 && i !== labels.length-1) return;
    const x = padding + (i+0.5)*(w - padding*2)/labels.length;
    ctx.fillText(lab, x - 10*(window.devicePixelRatio||1), h - 8*(window.devicePixelRatio||1));
  });
}

function refreshCharts(){
  if (!state.cfg.chartsOpen) {
    $("chartsWrap").classList.add("hidden");
    return;
  }
  $("chartsWrap").classList.remove("hidden");

  const keys = lastNDaysKeys(7);
  const all = loadMeals();
  const labels = keys.map(k => k.slice(5)); // MM-DD
  const kcals = keys.map(k => daySums(all[k]||[]).kcal);

  drawLineChart($("chartKcal"), labels, kcals);

  const ps = keys.map(k => daySums(all[k]||[]).p);
  const cs = keys.map(k => daySums(all[k]||[]).c);
  const gs = keys.map(k => daySums(all[k]||[]).g);
  drawStackedBars($("chartMacros"), labels, [
    { name:"P", values: ps },
    { name:"C", values: cs },
    { name:"G", values: gs },
  ]);
}

$("toggleChartsBtn").addEventListener("click", ()=>{
  state.cfg.chartsOpen = !state.cfg.chartsOpen;
  saveCfg(state.cfg);
  refreshCharts();
});

// ===== Lock screen
function enforceLock(){
  const cfg = loadCfg();
  state.cfg = cfg;

  $("keepPhotos").value = cfg.keepPhotos ? "1" : "0";
  $("pinSet").value = "";

  if (!cfg.pin){
    $("lockScreen").classList.add("hidden");
    return;
  }
  // si hay pin, bloquea al entrar (simple)
  $("lockScreen").classList.remove("hidden");
  $("pinInput").value = "";
  $("pinInput").focus();
}

$("unlockBtn").addEventListener("click", ()=>{
  const pin = ($("pinInput").value || "").trim();
  if (pin === state.cfg.pin){
    $("lockScreen").classList.add("hidden");
  } else {
    alert("PIN incorrecto.");
  }
});

$("noPinBtn").addEventListener("click", ()=>{
  alert("Si olvidaste el PIN: en iPhone borra los datos del sitio (Safari → Ajustes → Avanzado → Datos de sitios) o usa Reset total desde Ajustes si puedes entrar.");
});

// ===== Navigation buttons
$("prevDayBtn").addEventListener("click", ()=> moveDay(-1));
$("nextDayBtn").addEventListener("click", ()=> moveDay(1));

// ===== Refresh
function refresh(){
  const meals = dayMeals();
  const sum = daySums(meals);

  renderTotals(sum);
  renderGoalSummary(sum);
  renderList(meals);
  refreshCharts();
}

// ===== Init
(function init(){
  state.cfg = loadCfg();

  // base + filter
  state.baseFull = loadBase();
  state.baseFiltered = state.baseFull;
  populateFoodSelect(state.baseFull, 0);
  renderBaseTable(state.baseFull);

  // day
  setDay(todayKey());

  // keep photos select
  $("keepPhotos").value = state.cfg.keepPhotos ? "1" : "0";

  // lock
  enforceLock();

  // redraw charts on resize
  window.addEventListener("resize", ()=> refreshCharts());
})();
