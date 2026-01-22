const LS_KEY = "calai_private_v1";
const LS_BASE = "calai_base_v1";

const $ = (id) => document.getElementById(id);

const defaultsBase = () => ([
  { name:"Pollo + arroz", kcal:650, p:45, c:70, g:18 },
  { name:"Pasta boloñesa", kcal:780, p:30, c:95, g:25 },
  { name:"Pizza (2 porciones)", kcal:620, p:22, c:70, g:24 },
  { name:"Bocata lomo", kcal:560, p:30, c:55, g:22 },
  { name:"Ensalada completa", kcal:430, p:25, c:25, g:22 },
  { name:"Hamburguesa + patatas", kcal:980, p:35, c:95, g:45 },
]);

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function loadMeals(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch{ return {}; }
}
function saveMeals(data){
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function loadBase(){
  try{
    const x = JSON.parse(localStorage.getItem(LS_BASE) || "null");
    if (Array.isArray(x) && x.length) return x;
  } catch {}
  const def = defaultsBase();
  localStorage.setItem(LS_BASE, JSON.stringify(def));
  return def;
}
function saveBase(base){
  localStorage.setItem(LS_BASE, JSON.stringify(base));
}

function round(n){ return Math.round(n); }

function computeFromBase(baseItem, portion, extraKcal){
  const mult = Number(portion || 1);
  const extra = Number(extraKcal || 0);

  // Escalamos macros proporcionalmente si metes extra kcal, pero sin inventar demasiado:
  // dejamos extra solo en kcal para no liar (más realista si es "salsas/aceite").
  return {
    kcal: round(baseItem.kcal * mult + extra),
    p: round(baseItem.p * mult),
    c: round(baseItem.c * mult),
    g: round(baseItem.g * mult),
  };
}

function populateFoodSelect(base){
  const sel = $("foodBase");
  sel.innerHTML = "";
  base.forEach((b, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${b.name} — ${b.kcal} kcal`;
    sel.appendChild(opt);
  });
}

function renderTotals(meals){
  const sum = meals.reduce((acc,m)=>({
    kcal: acc.kcal + m.kcal,
    p: acc.p + m.p,
    c: acc.c + m.c,
    g: acc.g + m.g,
  }), {kcal:0,p:0,c:0,g:0});

  $("totals").innerHTML = `
    <div class="pill"><strong>${round(sum.kcal)}</strong><span>kcal</span></div>
    <div class="pill"><strong>${round(sum.p)} g</strong><span>proteína</span></div>
    <div class="pill"><strong>${round(sum.c)} g</strong><span>carbohidratos</span></div>
    <div class="pill"><strong>${round(sum.g)} g</strong><span>grasa</span></div>
  `;
}

function renderList(meals){
  const list = $("list");
  if (!meals.length){
    list.innerHTML = `<div class="hint">Aún no has añadido comidas hoy.</div>`;
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
        <button class="ghost danger" data-del="${m.id}">Eliminar</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-del");
      const t = todayKey();
      const all = loadMeals();
      all[t] = (all[t] || []).filter(x => x.id !== id);
      saveMeals(all);
      refresh();
    });
  });
}

function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function refresh(){
  const t = todayKey();
  const all = loadMeals();
  const meals = all[t] || [];
  renderTotals(meals);
  renderList(meals);
}

function nowTime(){
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${hh}:${mm}`;
}

/** Base table UI */
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
      populateFoodSelect(base);
    });
  });

  tbody.querySelectorAll("button[data-rm]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.getAttribute("data-rm"));
      base.splice(i,1);
      saveBase(base);
      populateFoodSelect(base);
      renderBaseTable(base);
    });
  });
}

/** Photo preview */
let currentPhotoDataUrl = null;
$("photo").addEventListener("change", async (e)=>{
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const url = await fileToDataUrl(file);
  currentPhotoDataUrl = url;
  $("previewImg").src = url;
  $("preview").classList.remove("hidden");
});
$("clearPhotoBtn").addEventListener("click", ()=>{
  $("photo").value = "";
  currentPhotoDataUrl = null;
  $("preview").classList.add("hidden");
});

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Add meal */
$("addBtn").addEventListener("click", ()=>{
  const base = loadBase();
  const idx = Number($("foodBase").value || 0);
  const portion = Number($("portion").value || 1);
  const extraKcal = Number($("extraKcal").value || 0);

  const baseItem = base[idx];
  const macros = computeFromBase(baseItem, portion, extraKcal);

  const name = $("name").value.trim();
  const note = $("note").value.trim();

  const t = todayKey();
  const all = loadMeals();
  const meals = all[t] || [];

  meals.unshift({
    id: crypto.randomUUID(),
    time: nowTime(),
    name: name || baseItem.name,
    baseName: baseItem.name,
    portion: portion,
    note,
    photo: currentPhotoDataUrl, // guardamos por si quieres usarlo luego
    ...macros
  });

  all[t] = meals;
  saveMeals(all);

  // reset inputs
  $("name").value = "";
  $("note").value = "";
  $("extraKcal").value = "";
  refresh();
});

/** Reset today / all */
$("resetTodayBtn").addEventListener("click", ()=>{
  const all = loadMeals();
  delete all[todayKey()];
  saveMeals(all);
  refresh();
});
$("resetAllBtn").addEventListener("click", ()=>{
  localStorage.removeItem(LS_KEY);
  refresh();
});

/** Export */
$("exportBtn").addEventListener("click", ()=>{
  const all = loadMeals();
  const rows = [];
  Object.keys(all).sort().forEach(day=>{
    (all[day]||[]).forEach(m=>{
      rows.push({
        date: day,
        time: m.time,
        name: m.name,
        base: m.baseName,
        portion: m.portion,
        kcal: m.kcal,
        p: m.p,
        c: m.c,
        g: m.g,
        note: m.note || ""
      });
    });
  });

  const csv = toCSV(rows);
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calai_privado.csv";
  a.click();
  URL.revokeObjectURL(url);
});
function toCSV(rows){
  const cols = ["date","time","name","base","portion","kcal","p","c","g","note"];
  const esc = (v)=> `"${String(v??"").replace(/"/g,'""')}"`;
  return [cols.join(","), ...rows.map(r=> cols.map(c=>esc(r[c])).join(","))].join("\n");
}

/** Base buttons */
$("addBaseBtn").addEventListener("click", ()=>{
  const base = loadBase();
  base.push({name:"Nueva comida",kcal:500,p:25,c:50,g:15});
  saveBase(base);
  populateFoodSelect(base);
  renderBaseTable(base);
});
$("restoreDefaultsBtn").addEventListener("click", ()=>{
  const def = defaultsBase();
  saveBase(def);
  populateFoodSelect(def);
  renderBaseTable(def);
});

/** Init */
(function init(){
  const base = loadBase();
  populateFoodSelect(base);
  renderBaseTable(base);
  refresh();
})();
