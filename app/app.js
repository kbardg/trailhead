/* Trailhead car finder — single-page app over window.TH (built by tools/build_data.py) */
(() => {
"use strict";

const TH = window.TH || { models: [], offers: [], dealers: [], listings: [] };
const HOME = { lat: 40.5853, lng: -105.0844 };
const CATS = {
  rugged:  { name: "Rugged 2-row",  short: "Rugged",  color: "#c4622d" },
  upscale: { name: "Upscale 2-row", short: "Upscale", color: "#5b7f99" },
  row3:    { name: "3-row",         short: "3-row",   color: "#5f7659" },
  lease:   { name: "Lease deals",   short: "Lease",   color: "#d9a441" },
  ev:      { name: "EVs",           short: "EV",      color: "#2f8a87" },
};
const CAR_SVG = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="#dccdb3"/><path d="M18 70h124v-14l-16-5-16-18H52L36 50H18z" fill="#f4eee3"/><circle cx="48" cy="72" r="11" fill="#33424b"/><circle cx="114" cy="72" r="11" fill="#33424b"/></svg>`);

/* ---------- utils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => (typeof u === "string" && /^(https?:\/\/|img\/|data:image\/svg)/i.test(u)) ? u : "";
// absolute, because relative URLs inside a CSS custom property resolve against app/styles.css
const cssUrl = u => { const s = safeUrl(u); return s ? `url('${new URL(s, location.href).href.replace(/'/g, "%27").replace(/\)/g, "%29")}')` : `url('${CAR_SVG}')`; };
const money = n => n == null || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US");
const short = n => n == null ? "—" : "$" + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k";
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const store = {
  get(k, d) { try { const v = localStorage.getItem("th." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("th." + k, JSON.stringify(v)); } catch {} },
};
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
function miles(a, b) {
  const R = 3958.8, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- data prep ---------- */
const models = TH.models;
const modelById = Object.fromEntries(models.map(m => [m.id, m]));
const dealers = TH.dealers.map(d => ({ ...d, miles: d.lat ? miles(HOME, d) : d.miles }));
const dealerById = Object.fromEntries(dealers.map(d => [d.id, d]));

function matchTrim(model, text) {
  if (!model) return -1;
  const t = " " + norm(text) + " ";
  let best = -1, len = 0;
  model.trims.forEach((tr, i) => {
    const n = norm(tr.name);
    if (n && t.includes(" " + n + " ") && n.length > len) { best = i; len = n.length; }
  });
  return best;
}
const listings = TH.listings.map((l, i) => {
  const m = modelById[l.modelId];
  const trimIdx = matchTrim(m, l.trim);
  return { ...l, id: l.id || l.vin || "L" + i, model: m, trimIdx, trimName: trimIdx >= 0 ? m.trims[trimIdx].name : l.trim,
    dealer: dealerById[l.dealerId], cost: l.price || l.msrp || (m && trimIdx >= 0 ? m.trims[trimIdx].msrp + (m.destination || 0) : null) };
}).filter(l => l.model && l.dealer && l.cost);
const listingById = Object.fromEntries(listings.map(l => [l.id, l]));

const offerKey = o => [o.modelId, o.type, o.year, o.trim, o.monthly, o.months, o.dueAtSigning, o.milesPerYear, o.apr, o.aprMonths, o.cashAmount, o.expires].join("|");
TH.offers.forEach(o => { o.key = offerKey(o); });
const offersFor = id => TH.offers.filter(o => o.modelId === id);
const effLease = o => o.monthly + (o.dueAtSigning || 0) / (o.months || 36);
const TODAY = new Date().toLocaleDateString("en-CA");   // local YYYY-MM-DD
const expired = o => !!o.expires && o.expires < TODAY;
const endsLabel = o => !o.expires ? "" : expired(o) ? "expired " + o.expires : o.expires === TODAY ? "ends today" : "ends " + o.expires;
// prefer offers that haven't expired; offer trims are written like "RTL AWD", so match them the way listings are matched
const live = os => { const l = os.filter(o => !expired(o)); return l.length ? l : os; };
const bestApr = id => live(offersFor(id).filter(o => o.type === "apr" && o.apr != null)).sort((a, b) => a.apr - b.apr || (b.aprMonths || 0) - (a.aprMonths || 0))[0];
const offerTrimIs = (o, id, trimName) => { const m = modelById[id]; return !!m && !!o.trim && matchTrim(m, o.trim) === m.trims.findIndex(t => t.name === trimName); };
const leaseOffer = (id, trimName) => {
  const ls = live(offersFor(id).filter(o => o.type === "lease" && o.monthly)).sort((a, b) => effLease(a) - effLease(b));
  return ls.find(o => trimName && offerTrimIs(o, id, trimName)) || ls[0];
};
// promo APR + published lease residual/money factor, for the quick monthly estimates
// headline "Buy $/mo" figures always use a 60-month loan, so only a promo that covers 60+ months counts
const apr60 = id => live(offersFor(id).filter(o => o.type === "apr" && o.apr != null && (o.aprMonths == null || o.aprMonths >= 60))).sort((a, b) => a.apr - b.apr)[0];
const quickOpts = (id, lo) => { const a = apr60(id); return { apr: a?.apr, aprMonths: 60, residualPct: lo?.residualPct, moneyFactor: lo?.moneyFactor }; };

/* ---------- state ---------- */
const S = {
  radius: store.get("radius", 50),
  gCats: store.get("gCats", ["rugged", "upscale", "row3", "lease"]),
  gModel: store.get("gModel", "honda-passport"),
  gTrim: store.get("gTrim", null),
  gColor: null,
  gPhoto: { mode: "showroom", i: 0 },
  gYear: store.get("gYear", "all"),               // model year shown in the Garage's lot counts and dealer photos
  mapTrims: store.get("mapTrims", null),          // { modelId, trims: [names] } carried from the Garage
  compare: store.get("compare", []),              // [{ modelId, trimIdx }]
  shortlist: store.get("shortlist", []),          // listing ids
  ex: { year: "all", ...store.get("ex", { cats: ["rugged", "upscale", "row3", "lease"], models: [], min: null, max: null, status: "all", sort: "deal", mode: "buy" }) },
  exDealer: null,
  pay: store.get("pay", null),
  userOffers: store.get("userOffers", []),
  dealsTab: "lease", dealsCats: store.get("dealsCats", ["rugged", "upscale", "row3", "lease", "ev"]), dealsSort: "eff",
  evSort: "eff", evMax: 0, evCredit: store.get("evCredit", false), evRate: store.get("evRate", 0.14),
};
if (!store.get("catsV2", false)) { ["gCats", "dealsCats"].forEach(k => { if (!S[k].includes("ev")) S[k].push("ev"); }); if (!S.ex.cats.includes("ev")) S.ex.cats.push("ev"); store.set("catsV2", true); }
const save = () => {
  ["radius", "gCats", "gModel", "gTrim", "gYear", "mapTrims", "compare", "shortlist", "ex", "pay", "userOffers", "dealsCats", "evCredit", "evRate"].forEach(k => store.set(k, S[k]));
};
if (!modelById[S.gModel]) S.gModel = models[0]?.id;
const curModel = () => modelById[S.gModel];
// default to the top "real" trim; appearance packages like Blackout sit above it but add only styling
const defaultTrim = m => { for (let i = m.trims.length - 1; i >= 0; i--) if (!/blackout|black edition|night|dark armor/i.test(m.trims[i].name)) return i; return m.trims.length - 1; };
const curTrimIdx = () => { const m = curModel(); return m ? clamp(S.gTrim ?? defaultTrim(m), 0, m.trims.length - 1) : 0; };
const inRadius = l => l.dealer.miles <= S.radius + 0.5;

/* ---------- router ---------- */
const views = ["garage", "explore", "payments", "deals", "ev"];
function route() {
  const [r0, qs] = location.hash.replace("#", "").split("?");
  const r = r0 || "garage";
  // bookmarkable Garage views, e.g. #garage?year=2026&view=features
  if (qs && r === "garage") { const u = new URLSearchParams(qs); if (modelById[u.get("model")]) { S.gModel = u.get("model"); S.gTrim = null; S.gColor = null; }
    if (u.get("year")) S.gYear = u.get("year"); if (u.get("view")) S.gPhoto = { mode: u.get("view"), i: 0 }; }
  const v = views.includes(r) ? r : "garage";
  views.forEach(x => { $("#v-" + x).hidden = x !== v; });
  $$(".nav a").forEach(a => a.classList.toggle("on", a.dataset.route === v));
  ({ garage: renderGarage, explore: renderExplore, payments: renderPayments, deals: renderDeals, ev: renderEV })[v]();
  window.scrollTo(0, 0);
}
const go = r => { if (location.hash === "#" + r) route(); else location.hash = r; };

/* ============================================================
   GARAGE
   ============================================================ */
const statDefs = [
  { k: "hp", n: "Horsepower", u: "hp", get: t => t.hp },
  { k: "towing", n: "Towing", u: "lb", get: t => t.towing, fmt: v => v.toLocaleString() },
  { k: "gc", n: "Ground clearance", u: "in", get: t => t.groundClearance },
  { k: "cargo", n: "Cargo behind 2nd row", u: "cu ft", get: t => t.cargoBehind2nd },
  { k: "mpg", n: "Fuel economy (combined)", u: "mpg", get: t => t.mpg?.combined, alt: t => t.rangeMiles ? `${t.mpg?.combined ?? "—"} MPGe · ${t.rangeMiles} mi range` : null },
];
const allTrims = models.flatMap(m => m.trims.map(t => ({ m, t })));
function range(get) {
  const vals = allTrims.map(x => get(x.t)).filter(v => typeof v === "number" && isFinite(v));
  return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
}
const pct = (v, [a, b]) => v == null ? 0 : clamp((v - a) / ((b - a) || 1), 0, 1);
function classAvg(cat, get) {
  const vals = allTrims.filter(x => x.m.category === cat).map(x => get(x.t)).filter(v => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
// radar: six data-driven attributes, 0..10
const radarAxes = [
  { n: "POWER", get: t => t.hp },
  { n: "TOWING", get: t => t.towing },
  { n: "CLEARANCE", get: t => t.groundClearance },
  { n: "CARGO", get: t => t.cargoBehind2nd },
  { n: "MPG", get: t => t.mpg?.combined && !t.rangeMiles ? t.mpg.combined : null },
  { n: "VALUE", get: t => t.msrp ? -t.msrp : null },
];
const radarRanges = radarAxes.map(a => range(a.get));
function radarScores(t) { return radarAxes.map((a, i) => { const v = a.get(t); return v == null ? null : 1 + 9 * pct(v, radarRanges[i]); }); }
function radarAvg(cat) {
  return radarAxes.map((a, i) => {
    const vals = allTrims.filter(x => x.m.category === cat).map(x => a.get(x.t)).filter(v => v != null);
    return vals.length ? 1 + 9 * pct(vals.reduce((p, c) => p + c, 0) / vals.length, radarRanges[i]) : null;
  });
}
function radarSvg(scores, avg) {
  const R = 64, pt = (i, s) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [(Math.cos(a) * R * (s ?? 0) / 10).toFixed(1), (Math.sin(a) * R * (s ?? 0) / 10).toFixed(1)]; };
  const poly = arr => arr.map((s, i) => pt(i, s).join(",")).join(" ");
  const ring = f => poly(Array(6).fill(10 * f));
  const lbl = radarAxes.map((a, i) => { const [x, y] = pt(i, 12.4); return `<text x="${x}" y="${+y + 4}">${a.n}</text>`; }).join("");
  return `<svg viewBox="-100 -88 200 176" width="170" height="150" aria-label="Attribute radar">
    <g fill="none" stroke="rgba(38,50,58,.14)"><polygon points="${ring(1)}"/><polygon points="${ring(.66)}"/><polygon points="${ring(.33)}"/>
    ${[0, 1, 2].map(i => `<path d="M${pt(i, 10).join(" ")}L${pt(i + 3, 10).join(" ")}"/>`).join("")}</g>
    <polygon points="${poly(avg)}" fill="rgba(196,98,45,.12)" stroke="#c4622d" stroke-width="1.5" stroke-dasharray="3 3"/>
    <polygon points="${poly(scores)}" fill="rgba(47,69,53,.28)" stroke="#2f4535" stroke-width="2"/>
    <g font-family="Barlow Condensed" font-size="11" font-weight="700" fill="#4a5961" text-anchor="middle">${lbl}</g></svg>`;
}

// the user's Payments settings (down, trade, credit, terms, tax), shared by every monthly figure in the app
function payPrefs() {
  const p = S.pay || {};
  return { down: p.down ?? 5000, trade: p.trade ?? 0, credit: p.credit ?? "excellent", loanMonths: p.loanMonths ?? 60, leaseMonths: p.leaseMonths ?? 36,
    leaseMiles: p.leaseMiles ?? 10000, taxRate: p.taxRate ?? Finance.DEFAULT_TAX, dealerFee: p.dealerFee ?? 799, acqFee: p.acqFee ?? 650 };
}
function myQuote(modelId, trimName, price, msrp) {
  const pr = payPrefs();
  const apr = live(offersFor(modelId).filter(o => o.type === "apr" && o.apr != null && (o.aprMonths == null || o.aprMonths === pr.loanMonths))).sort((a, b) => a.apr - b.apr)[0];
  const lo = leaseOffer(modelId, trimName);
  const r = Finance.compute({ price, msrp, rebates: 0, ...pr, loanApr: apr?.apr ?? Finance.CREDIT_APR[pr.credit],
    residualPct: lo?.residualPct ?? Finance.residualGuess(pr.leaseMonths, pr.leaseMiles), moneyFactor: lo?.moneyFactor ?? Finance.CREDIT_MF[pr.credit] });
  return { buy: r.loan.pmt, lease: r.lease.pmt, apr: apr?.apr ?? Finance.CREDIT_APR[pr.credit], pr };
}
const isStudio = u => /GetEvoxImage/i.test(u || "");   // transparent, year- and trim-specific studio renders some dealer sites publish
// best stage image for a model/trim/year: a matching studio cut-out, else the stock photo (same year), else a real lot photo of that year
// swatches for the colors actually on nearby lots, using the catalog's paint color when the names line up
const COLOR_WORDS = { white: "#eceae3", pearl: "#eceae3", black: "#1c1f22", ebony: "#1c1f22", gray: "#6f7478", grey: "#6f7478", graphite: "#4a4f54", silver: "#b9bdc0",
  steel: "#8a9097", red: "#9b1c1c", blue: "#2f4f7f", green: "#5f7659", orange: "#d2642a", brown: "#6b4e3a", bronze: "#8c6a45", brass: "#8c7a4a", beige: "#cbbd9f", sand: "#cbbd9f", gold: "#b8954a", yellow: "#d9b23a" };
const PAINT_FILLER = new Set(["metallic", "pearl", "ii", "clear", "coat", "clearcoat", "exterior", "paint", "tricoat", "tri", "matte", "w", "with", "roof", "black", "two", "tone"]);
const paintWords = n => norm(n).split(" ").filter(w => w && !PAINT_FILLER.has(w));
function lotColors(m, ls) {
  const groups = {};
  ls.forEach(l => { if (l.exteriorColor) { const k = norm(l.exteriorColor); (groups[k] = groups[k] || { name: l.exteriorColor, n: 0 }).n++; } });
  return Object.values(groups).sort((a, b) => b.n - a.n).map(g => {
    const w = paintWords(g.name);
    const cat = (m.colors || []).find(c => norm(c.name) === norm(g.name)) || (w.length && (m.colors || []).find(c => { const cw = paintWords(c.name); return cw.length && cw.every(x => w.includes(x)); }));
    const word = norm(g.name).split(" ").find(x => COLOR_WORDS[x]);
    const hex = cat && /^#[0-9a-f]{3,8}$/i.test(cat.hex || "") ? cat.hex : word ? COLOR_WORDS[word] : "#999";
    return { name: g.name, n: g.n, hex };
  });
}
function showroomImage(m, trimName, year, colorName) {
  const ls = listings.filter(l => l.modelId === m.id && l.trimName === trimName && l.year == year && safeUrl(l.photo));
  const studio = ls.filter(l => isStudio(l.photo));
  const byColor = arr => (colorName && arr.find(l => norm(l.exteriorColor) === norm(colorName))) || arr[0];
  if (studio.length) return { url: byColor(studio).photo, cut: true, note: `${year} ${trimName} studio render` };
  if (year == m.year || !ls.length) return { url: m.image, cut: false, credit: m.imageCredit, note: year == m.year ? "stock photo of this model" : `stock photo of the ${m.year}` };
  const l = byColor(ls);
  return { url: l.photo, cut: false, note: `a ${year} ${trimName} at ${l.dealer.name}` };
}

function modelListings(id, trimNames, year = "all") {
  return listings.filter(l => l.modelId === id && inRadius(l) && (!trimNames || trimNames.includes(l.trimName)) && (year === "all" || l.year == year));
}
const YEARS = [...new Set(listings.map(l => l.year).filter(Boolean))].sort();
// the "Changes vs 2026: ..." sentence the researchers left in a model's notes, if any
function yearChanges(m) {
  const hit = String(m.notes || "").split(/(?<=\.)\s+(?=[A-Z])/).find(x => /^changes vs \d{4}/i.test(x));
  return hit ? hit.replace(/^changes vs (\d{4}):\s*/i, "") : null;
}

function renderGarage() {
  const el = $("#v-garage");
  const m = curModel();
  if (!m) { el.innerHTML = `<div class="empty">No vehicle data loaded yet. Run <code>python tools/build_data.py</code>.</div>`; return; }
  const ti = curTrimIdx(), t = m.trims[ti];
  const cat = CATS[m.category] || CATS.rugged;
  const prev = ti > 0 ? m.trims[ti - 1] : null;
  const lo = leaseOffer(m.id, t.name);
  const loHere = lo && (!lo.trim || offerTrimIs(lo, m.id, t.name)) ? lo : null;   // only quote an advertised lease on its own trim

  // map-trim flags for this model
  const mt = S.mapTrims && S.mapTrims.modelId === m.id ? S.mapTrims.trims : [t.name];
  const flagged = new Set(mt);

  // photos
  const yearsHere = [...new Set(modelListings(m.id).map(l => l.year))].sort();
  const gy = yearsHere.includes(+S.gYear) ? +S.gYear : "all";
  const heroYears = [...new Set([m.year, ...yearsHere])].sort();
  const showYear = gy === "all" ? m.year : gy;                   // the year whose photo + sticker we show
  const yearLots = modelListings(m.id, [t.name], showYear).filter(l => l.msrp);
  const yearMsrp = showYear != m.year && yearLots.length ? Math.min(...yearLots.map(l => l.msrp)) : null;
  const msrpTotal = yearMsrp || (t.msrp ? t.msrp + (m.destination || 0) : null);
  const picked = S.pay?.src?.type === "listing" ? listingById[S.pay.src.id] : null;
  const pick = picked && picked.modelId === m.id && picked.trimIdx === ti && (gy === "all" || picked.year == gy) ? picked : null;
  const q = pick ? myQuote(m.id, t.name, pick.cost, pick.msrp || pick.cost) : msrpTotal ? myQuote(m.id, t.name, msrpTotal, msrpTotal) : null;
  const trimListings = modelListings(m.id, [t.name], gy);
  const photoListings = trimListings.filter(l => safeUrl(l.photo));
  const colors = lotColors(m, trimListings);
  const color = colors.find(c => c.name === S.gColor) || null;
  const show = showroomImage(m, t.name, showYear, color && color.name);
  let stageImg = show.url, stageCredit = show.credit, stageNote = show.note, dealerL = null;
  if (S.gPhoto.mode === "dealer" && photoListings.length) {
    let pool = color ? photoListings.filter(l => norm(l.exteriorColor) === norm(color.name)) : photoListings;
    if (!pool.length) pool = photoListings;
    dealerL = pool[((S.gPhoto.i % pool.length) + pool.length) % pool.length];
    stageImg = dealerL.photo; stageCredit = null; stageNote = null;
  }
  const mode = S.gPhoto.mode === "dealer" && !dealerL ? "showroom" : S.gPhoto.mode;

  // roster
  const roster = models.filter(x => S.gCats.includes(x.category))
    .sort((a, b) => Object.keys(CATS).indexOf(a.category) - Object.keys(CATS).indexOf(b.category) || a.make.localeCompare(b.make));
  const rosterHtml = roster.map(x => {
    const ls = modelListings(x.id);
    const minP = ls.length ? Math.min(...ls.map(l => l.cost)) : (x.trims[0]?.msrp ?? null);
    return `<button class="ritem cat-${x.category} ${x.id === m.id ? "on" : ""}" data-model="${esc(x.id)}">
      <div class="th" style="background-image:${cssUrl(x.image)}"></div>
      <div><div class="nm">${esc(x.make)} ${esc(x.model)}</div>
      <div class="sub"><i></i>${ls.length ? `${ls.length} nearby · ${short(minP)}+` : `MSRP ${short(minP)}+`}</div></div></button>`;
  }).join("") || `<div class="muted" style="padding:10px">Pick a category above.</div>`;

  const slots = [0, 1, 2].map(i => {
    const c = S.compare[i], cm = c && modelById[c.modelId];
    return cm ? `<div class="slot full" title="${esc(cm.model + " " + cm.trims[c.trimIdx]?.name)}" style="background-image:${cssUrl(cm.image)}"><button data-uncompare="${i}" aria-label="Remove">×</button></div>` : `<div class="slot"></div>`;
  }).join("");

  // callouts
  const adds = t.adds || [];
  const calls = [
    [`${t.engine || "Engine"}${t.hp ? " · " + t.hp + " hp" : ""}`, [t.transmission, t.drivetrain].filter(Boolean).join(" · ")],
    t.towing ? [`Tows ${t.towing.toLocaleString()} lb`, t.groundClearance ? `${t.groundClearance}" ground clearance` : ""] : [`${m.seats || "—"} seats`, t.cargoBehind2nd ? `${t.cargoBehind2nd} cu ft cargo` : ""],
    adds[0] ? [adds[0], ti === 0 ? "Standard" : `New at ${t.name}`] : null,
    adds[1] ? [adds[1], ti === 0 ? "Standard" : `New at ${t.name}`] : null,
  ];
  const callHtml = mode !== "showroom" ? "" : calls.map((c, i) => c ? `<div class="callout c${i + 1}"><b>${esc(c[0])}</b>${esc(c[1])}</div>` : "").join("");

  // ladder
  const nearByTrim = {};
  modelListings(m.id, null, gy).forEach(l => { nearByTrim[l.trimName] = (nearByTrim[l.trimName] || 0) + 1; });
  const rungs = m.trims.map((tr, i) => {
    const p = i > 0 ? m.trims[i - 1] : null;
    const on = flagged.has(tr.name);
    const shown = (tr.adds || []).slice(0, 3);
    return (i ? `<div class="conn">›</div>` : "") + `<div class="rung ${i === 0 ? "base" : ""} ${i === ti ? "on" : ""}" data-trim="${i}" role="button" tabindex="0">
      ${i === ti ? `<span class="tag">${i === m.trims.length - 1 ? "Top trim · " : ""}selected</span>` : ""}
      <button class="mapflag ${on ? "" : "off"}" data-flag="${esc(tr.name)}" title="Include this trim in the map filter">${on ? "✓ On map" : "+ Map"}</button>
      <div class="top"><h3>${esc(tr.name)}</h3><span class="p">${tr.msrp ? money(tr.msrp) : "—"}</span></div>
      <div class="delta">${p && tr.msrp && p.msrp ? `+${money(tr.msrp - p.msrp)} over ${esc(p.name)}` : "Base trim"}<span class="near ${nearByTrim[tr.name] ? "" : "none"}">${nearByTrim[tr.name] ? `${nearByTrim[tr.name]} nearby` : "none nearby"}</span></div>
      <ul>${shown.map(a => `<li title="${esc(a)}">${esc(a)}</li>`).join("")}</ul>
      ${(tr.adds || []).length > 3 ? `<button class="more" data-feat="${i}">+${tr.adds.length - 3} more · see all</button>` : ""}
    </div>`;
  }).join("");

  // stats
  const bars = statDefs.map(s => {
    const v = s.get(t), r = range(s.get), avg = classAvg(m.category, s.get);
    const alt = s.alt && s.alt(t);
    return `<div class="bar"><span class="n">${esc(s.n)}</span><span class="v">${alt ? esc(alt) : v == null ? "—" : (s.fmt ? s.fmt(v) : v) + ` <small>${s.u}</small>`}</span>
      <div class="track"><div class="fill" style="width:${(pct(v, r) * 100).toFixed(0)}%"></div>${avg != null ? `<div class="avg" style="left:${(pct(avg, r) * 100).toFixed(0)}%" title="${esc(cat.name)} average"></div>` : ""}</div></div>`;
  }).join("");
  const scores = radarScores(t), avgs = radarAvg(m.category);
  const top3 = radarAxes.map((a, i) => [a.n, scores[i]]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const matches = modelListings(m.id, mt, gy);
  const allYears = modelListings(m.id, mt);
  const changes = yearChanges(m);
  const lowest = matches.length ? matches.reduce((a, b) => a.cost <= b.cost ? a : b) : null;
  const closest = matches.length ? matches.reduce((a, b) => a.dealer.miles <= b.dealer.miles ? a : b) : null;
  const byTrim = mt.map(n => [n, matches.filter(l => l.trimName === n).length]);
  const inCompare = S.compare.some(c => c.modelId === m.id && c.trimIdx === ti);

  el.innerHTML = `<div class="garage">
    <aside class="roster">
      <div class="label">Choose your ride</div>
      <div class="cats">${Object.entries(CATS).map(([k, c]) => `<button class="chip cat-${k} ${S.gCats.includes(k) ? "on" : ""}" data-gcat="${k}"><i class="dot"></i>${esc(c.name)}</button>`).join("")}</div>
      <div class="rlist">${rosterHtml}</div>
      <div class="compare-tray"><div class="label">Compare tray</div><div class="slots">${slots}</div>
        <button class="btn" id="h2hBtn" ${S.compare.length < 2 ? "disabled" : ""}>Head-to-head ›</button></div>
    </aside>

    <section class="center topo">
      <div class="hero-head">
        <div>
          <div class="yr">${esc(m.make)} <span class="yr-chips">${heroYears.length > 1 ? `<button data-gyear="all" class="${gy === "all" ? "on" : ""}" title="Count cars from every model year">All years</button>` : ""}${heroYears.map(y => `<button data-gyear="${y}" class="${gy == y || (heroYears.length === 1) ? "on" : ""}" title="Show the ${y}">${y}</button>`).join("")}</span> <span class="chip cat-${m.category}" style="padding:2px 9px;font-size:11px;letter-spacing:0;font-family:var(--body)"><i class="dot"></i>${esc(cat.name)}</span></div>
          <h1>${esc(m.model)} <span>${esc(t.name)}</span></h1>
          <div class="trim-switch">
            <button class="arrow" data-step="-1" aria-label="Previous trim">‹</button><span class="t">Trim ${ti + 1} of ${m.trims.length}</span><button class="arrow" data-step="1" aria-label="Next trim">›</button>
            <span class="pips">${m.trims.map((_, i) => `<i class="${i === ti ? "on" : ""}"></i>`).join("")}</span>
          </div>
        </div>
        <div class="pricebox">
          ${pick ? `<div class="msrp"><small>YOUR PICK </small>${money(pick.cost)}</div><div class="spec-year" style="color:var(--forest)">${esc(pick.year)} · ${esc(pick.exteriorColor || "")} · ${esc(pick.dealer.name.split(" (")[0])}</div>`
            : `<div class="msrp"><small>${yearMsrp ? showYear + " ON LOTS FROM " : "MSRP "}</small>${money(yearMsrp || t.msrp)}</div>`}
          ${showYear != m.year ? `<div class="spec-year">Specs below are the ${esc(m.year)}'s, so check what changed</div>` : ""}
          <div class="pm">${q ? `<span>Buy <b>${money(q.buy)}</b>/mo</span><span>Lease <b>${money(loHere && !yearMsrp && !pick ? loHere.monthly : q.lease)}</b>/mo${loHere && !yearMsrp && !pick ? "*" : ""}</span>` : ""}</div>
          <div class="acts">
            <button class="icon-btn ${inCompare ? "on" : ""}" id="cmpBtn">${inCompare ? "✓ In compare" : "+ Compare"}</button>
            <button class="icon-btn pay-cta" id="payBtn" title="Open Payments for this trim (P key)">$ My payment ›</button>
          </div>
        </div>
      </div>

      <div class="stage">
        <svg class="mtn" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="760" cy="80" r="46" fill="#e9b872" opacity=".55"/>
          <path d="M0 300 L0 190 L90 130 L150 170 L250 70 L330 150 L410 110 L500 180 L590 90 L660 140 L760 60 L850 150 L920 120 L1000 160 L1000 300Z" fill="#a9b7a2" opacity=".55"/>
          <path d="M250 70 L275 95 L262 92 L250 102 L238 90 Z M760 60 L788 88 L772 84 L760 96 L748 84 Z" fill="#f4eee3" opacity=".8"/>
          <path d="M0 300 L0 230 L120 180 L220 220 L340 160 L460 230 L560 170 L700 230 L820 180 L1000 220 L1000 300Z" fill="#7f9479" opacity=".55"/>
        </svg>
        <div class="floor"></div><div class="ring2"></div><div class="ring"></div>
        ${mode === "features" ? featuresPanel(m, ti) : `<div class="car ${mode === "showroom" && show.cut ? "cut" : ""}" style="--img:${cssUrl(stageImg)}" role="img" aria-label="${esc(showYear + " " + m.make + " " + m.model + " " + t.name)}"></div>`}
        ${mode === "showroom" ? `<div class="credit">${stageCredit ? `Photo: ${esc(stageCredit.author || "")} · ${esc(stageCredit.license || "")}${safeUrl(stageCredit.url) ? ` · <a href="${esc(safeUrl(stageCredit.url))}" target="_blank" rel="noopener">source</a>` : ""} · ` : ""}${esc(stageNote || "")}</div>` : ""}
        ${callHtml}
        ${dealerL ? `<button class="photo-nav l" data-photo="-1" aria-label="Previous">‹</button><button class="photo-nav r" data-photo="1" aria-label="Next">›</button>
          <div class="dealer-tag"><span>${esc(dealerL.exteriorColor || "")} · ${esc(dealerL.dealer.name)} · <b>${money(dealerL.cost)}</b></span>${safeUrl(dealerL.url) ? `<a href="${esc(safeUrl(dealerL.url))}" target="_blank" rel="noopener">View this car ↗</a>` : ""}</div>` : ""}
        <div class="stage-foot">
          <div class="swatches">${colors.map(c => `<button title="${esc(c.name)} · ${c.n} nearby" class="${color && color.name === c.name ? "on" : ""}" data-color="${esc(c.name)}" style="background:${c.hex}"></button>`).join("")}
            <span>${esc(color ? `${color.name} · ${color.n} nearby` : colors.length ? `${colors.length} color${colors.length > 1 ? "s" : ""} on nearby lots · tap to see them` : `No ${t.name} on nearby lots`)}</span></div>
          <div class="rotate"><button data-mode="showroom" class="${mode === "showroom" ? "on" : ""}">Showroom</button>
            <button data-mode="dealer" class="${mode === "dealer" ? "on" : ""}" ${photoListings.length ? "" : "disabled title='No dealer photos captured for this trim and year yet'"}>Dealer photos (${photoListings.length})</button>
            <button data-mode="features" class="${mode === "features" ? "on" : ""}">All features</button></div>
        </div>
      </div>

      <div class="ladder">
        <div class="ladder-head"><span class="label">Trim ladder — what each step up adds</span><span class="hint">← → keys switch trims · ↑ ↓ switch vehicles · "+ Map" adds a trim to the map filter</span></div>
        <div class="rungs">${rungs}</div>
      </div>
    </section>

    <aside class="stats">
      <div class="label">Attributes vs. ${esc(cat.name)} class</div>
      <div class="radar-wrap">${radarSvg(scores, avgs)}
        <div class="radar-legend"><div class="k"><i style="background:#2f4535"></i>This trim</div><div class="k"><i style="background:#c4622d"></i>Class average</div>
          ${top3.map(([n, s]) => `<div><b>${s.toFixed(1)}</b>${esc(n.charAt(0) + n.slice(1).toLowerCase())}</div>`).join("")}</div></div>
      ${bars}
      <div class="tiles">
        <div class="tile"><span class="label">Safety</span><b>${esc(shortSafety(m.safety))}</b><small title="${esc(m.safety || "")}">${m.safety ? "IIHS" : "not rated yet"}</small></div>
        <div class="tile"><span class="label">Warranty</span><b>${esc(shortWarranty(m.warranty))}</b><small>basic coverage</small></div>
        <div class="tile"><span class="label">Seats · drive</span><b>${esc(m.seats ?? "—")} · ${esc(String(t.drivetrain || "—").split(" (")[0])}</b><small>${t.offroad ? "off-road ready" : "on-road"}</small></div>
      </div>
      <div class="findbox">
        <div class="fb-top"><div class="label" style="color:#a9b1ad">On lots within ${S.radius} mi</div>
          ${yearsHere.length > 1 ? `<div class="yr-toggle">${["all", ...yearsHere].map(y => `<button data-gyear="${y}" class="${gy == y ? "on" : ""}">${y === "all" ? "All" : y}${y === "all" ? "" : ` <i>${allYears.filter(l => l.year == y).length}</i>`}</button>`).join("")}</div>` : ""}</div>
        <div class="big"><span>${matches.length}</span> matching ${gy === "all" ? "" : gy + " "}${esc(m.model)}${matches.length === 1 ? "" : "s"}</div>
        <div class="rows">
          ${byTrim.map(([n, c]) => `<div>${esc(n)} <b>${c} listed</b></div>`).join("")}
          ${!matches.length && Object.keys(nearByTrim).length ? `<div class="jump"><span>On lots nearby instead:</span>${m.trims.map((tr, i) => nearByTrim[tr.name] ? `<button data-jump="${i}">${esc(tr.name)} · ${nearByTrim[tr.name]}</button>` : "").join("")}</div>` : ""}
          ${!matches.length && !Object.keys(nearByTrim).length && gy !== "all" ? `<div class="jump"><span>None from ${gy}.</span><button data-gyear="all">Show all years</button></div>` : ""}
          <div>Lowest advertised price <b>${lowest ? money(lowest.cost) : "—"}</b></div>
          <div>Closest <b>${closest ? esc(closest.dealer.name) + " · " + closest.dealer.miles.toFixed(1) + " mi" : "—"}</b></div>
          ${lo ? `<div>Lease offer${lo.trim ? " · " + esc(lo.trim) : ""} <b>${money(lo.monthly)}/mo · ${money(lo.dueAtSigning)} due</b></div>` : ""}
        </div>
        <button class="btn" id="toMap">Show these on the map ›</button>
      </div>
      ${changes && yearsHere.length > 1 ? `<div class="yr-note"><b>${esc(m.year - 1)} → ${esc(m.year)}: what changed</b>${esc(changes)}<span>Specs above are for the ${esc(m.year)}. ${esc(m.year - 1)}s on lots are often discounted.</span></div>` : ""}
      ${q ? `<div class="fineprint">${loHere && !yearMsrp && !pick ? `* Advertised ${esc(String(lo.sourceName || "manufacturer").split(" (")[0])} lease${lo.trim ? " on " + esc(lo.trim) : ""}: ${money(lo.monthly)}/mo, ${lo.months} mo, ${money(lo.dueAtSigning)} due. ` : ""}Monthly figures use your Payments settings: ${money(q.pr.down)} down${q.pr.trade ? `, ${money(q.pr.trade)} trade-in` : ""}, ${q.apr}% for ${q.pr.loanMonths} mo, lease ${q.pr.leaseMonths} mo/${q.pr.leaseMiles / 1000}k mi, Fort Collins tax & CO registration. <button class="link" id="payBtn2">Change ›</button></div>` : ""}
    </aside>
  </div>`;
  centerRung();
}
// full feature list: everything this trim has, grouped by where it came from, plus one step up and one step down
function featuresPanel(m, ti) {
  const t = m.trims[ti], up = m.trims[ti + 1], down = m.trims[ti - 1];
  const li = a => `<li>${esc(a)}</li>`;
  const inherited = m.trims.slice(0, ti).map((tr, i) => ({ tr, i })).reverse().filter(x => (x.tr.adds || []).length);
  return `<div class="features">
    <div class="fcol"><h4>${ti === 0 ? "Standard on" : "New at"} ${esc(t.name)}</h4><ul class="new">${(t.adds || []).map(li).join("")}</ul>
      ${inherited.length ? `<h4 class="sub">Also included</h4>${inherited.map(x => `<div class="from">From ${esc(x.tr.name)}</div><ul>${x.tr.adds.map(li).join("")}</ul>`).join("")}` : ""}</div>
    <div class="fcol side">
      ${up ? `<div class="step up"><h4>Step up: ${esc(up.name)} <em>+${money((up.msrp || 0) - (t.msrp || 0))}</em></h4><ul>${(up.adds || []).map(li).join("")}</ul><button class="link" data-trim="${ti + 1}">Switch to ${esc(up.name)} ›</button></div>` : `<div class="step up"><h4>Top of the ladder</h4><p class="muted">Nothing above ${esc(t.name)}.</p></div>`}
      ${down ? `<div class="step down"><h4>Step down: ${esc(down.name)} <em>−${money((t.msrp || 0) - (down.msrp || 0))}</em></h4><p class="muted">You'd give up:</p><ul>${(t.adds || []).map(li).join("")}</ul><button class="link" data-trim="${ti - 1}">‹ Switch to ${esc(down.name)}</button></div>` : ""}
    </div></div>`;
}
// keep the selected trim visible in the ladder without moving the page
function centerRung() {
  const rail = $("#v-garage .rungs"), on = rail && $(".rung.on", rail);
  if (on) rail.scrollLeft = on.offsetLeft - rail.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2;
  // on phones the vehicle list is a sideways strip: keep the chosen vehicle in view
  const list = $("#v-garage .rlist"), pick = list && $(".ritem.on", list);
  if (pick && list.scrollWidth > list.clientWidth)
    list.scrollLeft += pick.getBoundingClientRect().left - list.getBoundingClientRect().left - (list.clientWidth - pick.offsetWidth) / 2;
}
function shortSafety(s) {
  if (!s) return "—";
  if (/top safety pick\s*\+|tsp\s*\+|tsp\+/i.test(s)) return "TSP+";
  if (/top safety pick|tsp/i.test(s)) return "TSP";
  return s.length > 14 ? s.slice(0, 13) + "…" : s;
}
function shortWarranty(w) { const m = String(w || "").match(/(\d+)\s*-?\s*(?:yr|year)s?\s*\/?\s*([\d,]+)\s*k?/i); return m ? `${m[1]}yr/${String(m[2]).replace(/,000$/, "")}k`.replace(/kk$/, "k") : (w ? String(w).slice(0, 12) : "—"); }

function setModel(id) { S.gModel = id; S.gTrim = null; S.gColor = null; S.gYear = "all"; S.gPhoto = { mode: S.gPhoto.mode === "features" ? "features" : "showroom", i: 0 }; save(); renderGarage(); }
function setTrim(i) { const m = curModel(); S.gTrim = clamp(i, 0, m.trims.length - 1); S.gColor = null; S.gPhoto.i = 0; save(); renderGarage(); }

$("#v-garage").addEventListener("click", e => {
  const b = e.target.closest("[data-gcat],[data-model],[data-step],[data-flag],[data-gyear],[data-feat],[data-jump],[data-trim],[data-color],[data-mode],[data-photo],[data-uncompare],#h2hBtn,#cmpBtn,#payBtn,#payBtn2,#toMap");
  if (!b) return;
  const m = curModel(), ti = curTrimIdx();
  if (b.dataset.gcat) { const k = b.dataset.gcat; S.gCats = S.gCats.includes(k) ? S.gCats.filter(x => x !== k) : [...S.gCats, k]; save(); renderGarage(); }
  else if (b.dataset.model) setModel(b.dataset.model);
  else if (b.dataset.step) setTrim(ti + +b.dataset.step);
  else if (b.dataset.flag) {
    e.stopPropagation();
    const base = S.mapTrims && S.mapTrims.modelId === m.id ? S.mapTrims.trims : [m.trims[ti].name];
    const n = b.dataset.flag;
    const trims = base.includes(n) ? base.filter(x => x !== n) : [...base, n];
    S.mapTrims = { modelId: m.id, trims: trims.length ? trims : [n] }; save(); renderGarage();
  }
  else if (b.dataset.jump) { S.mapTrims = null; setTrim(+b.dataset.jump); }
  else if (b.dataset.feat) { e.stopPropagation(); S.gPhoto = { mode: "features", i: 0 }; setTrim(+b.dataset.feat); }
  else if (b.dataset.trim) setTrim(+b.dataset.trim);
  else if (b.dataset.gyear) { S.gYear = b.dataset.gyear; S.gPhoto.i = 0; save(); renderGarage(); }
  else if (b.dataset.color) { S.gColor = S.gColor === b.dataset.color ? null : b.dataset.color; S.gPhoto = { mode: S.gColor ? "dealer" : "showroom", i: 0 }; renderGarage(); }
  else if (b.dataset.mode) { S.gPhoto = { mode: b.dataset.mode, i: 0 }; renderGarage(); }
  else if (b.dataset.photo) { S.gPhoto.i += +b.dataset.photo; renderGarage(); }
  else if (b.dataset.uncompare) { S.compare.splice(+b.dataset.uncompare, 1); save(); renderGarage(); }
  else if (b.id === "cmpBtn") {
    const i = S.compare.findIndex(c => c.modelId === m.id && c.trimIdx === ti);
    if (i >= 0) S.compare.splice(i, 1);
    else { if (S.compare.length >= 3) S.compare.shift(); S.compare.push({ modelId: m.id, trimIdx: ti }); toast(`${m.model} ${m.trims[ti].name} added to compare`); }
    save(); renderGarage();
  }
  else if (b.id === "h2hBtn") openH2H();
  else if (b.id === "payBtn" || b.id === "payBtn2") go("payments");
  else if (b.id === "toMap") {
    if (!S.mapTrims || S.mapTrims.modelId !== m.id) S.mapTrims = { modelId: m.id, trims: [m.trims[ti].name] };
    S.ex.year = String(S.gYear); S.exDealer = null; save(); go("explore");
  }
});
$("#v-garage").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".rung")) { e.preventDefault(); setTrim(+e.target.dataset.trim); } });
document.addEventListener("keydown", e => {
  if ($("#v-garage").hidden || e.target.closest?.("input,select,textarea") || $(".modal-bg")) return;
  const m = curModel(); if (!m) return;
  if (e.key === "ArrowRight") { setTrim(curTrimIdx() + 1); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { setTrim(curTrimIdx() - 1); e.preventDefault(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const list = $$(".ritem").map(x => x.dataset.model); const i = list.indexOf(m.id);
    const n = list[clamp(i + (e.key === "ArrowDown" ? 1 : -1), 0, list.length - 1)];
    if (n && n !== m.id) { setModel(n); $(".ritem.on")?.scrollIntoView({ block: "nearest" }); }
    e.preventDefault();
  }
});

/* head-to-head */
function openH2H() {
  const items = S.compare.map(c => ({ m: modelById[c.modelId], t: modelById[c.modelId]?.trims[c.trimIdx] })).filter(x => x.m && x.t);
  if (items.length < 2) return;
  const rows = [
    ["MSRP", x => x.t.msrp, v => money(v), "min"],
    ["Horsepower", x => x.t.hp, v => v + " hp", "max"],
    ["Torque", x => x.t.torque, v => v + " lb-ft", "max"],
    ["Towing", x => x.t.towing, v => v.toLocaleString() + " lb", "max"],
    ["Ground clearance", x => x.t.groundClearance, v => v + " in", "max"],
    ["Cargo behind 2nd row", x => x.t.cargoBehind2nd, v => v + " cu ft", "max"],
    ["Cargo max", x => x.t.cargoMax, v => v + " cu ft", "max"],
    ["Fuel economy", x => x.t.mpg?.combined, v => v + " mpg", "max"],
    ["Seats", x => x.m.seats, v => v, "max"],
    ["Nearby listings", x => modelListings(x.m.id, [x.t.name]).length, v => v, "max"],
  ];
  const cell = (r, x, all) => {
    const v = r[1](x); if (v == null) return `<div>—</div>`;
    const vals = all.map(r[1]).filter(z => z != null);
    const best = r[3] === "max" ? Math.max(...vals) : Math.min(...vals);
    return `<div class="${vals.length > 1 && v === best ? "win" : ""}">${esc(r[2](v))}</div>`;
  };
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal" role="dialog" aria-label="Head-to-head">
    <h2>Head-to-head <button class="btn sm ghost" data-close>Close</button></h2>
    <div class="h2h" style="--n:${items.length}">
      <div class="hr head"><div></div>${items.map(x => `<div><div class="ph" style="background-image:${cssUrl(x.m.image)}"></div><b>${esc(x.m.year + " " + x.m.make + " " + x.m.model)}</b><span class="muted">${esc(x.t.name)}</span></div>`).join("")}</div>
      ${rows.map(r => `<div class="hr"><div>${esc(r[0])}</div>${items.map(x => cell(r, x, items)).join("")}</div>`).join("")}
      <div class="hr"><div>Engine</div>${items.map(x => `<div>${esc([x.t.engine, x.t.transmission, x.t.drivetrain].filter(Boolean).join(" · "))}</div>`).join("")}</div>
      <div class="hr"><div>Notable features</div>${items.map(x => `<div><ul>${x.m.trims.slice(0, x.m.trims.indexOf(x.t) + 1).flatMap(tr => tr.adds || []).slice(-8).map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>`).join("")}</div>
      <div class="hr"><div>Safety</div>${items.map(x => `<div>${esc(x.m.safety || "—")}</div>`).join("")}</div>
      <div class="hr"><div>Warranty</div>${items.map(x => `<div>${esc(x.m.warranty || "—")}</div>`).join("")}</div>
    </div></div>`;
  bg.addEventListener("click", e => { if (e.target === bg || e.target.closest("[data-close]")) bg.remove(); });
  document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { bg.remove(); document.removeEventListener("keydown", k); } });
  document.body.appendChild(bg);
}

/* ============================================================
   EXPLORE
   ============================================================ */
let map, markerLayer, exploreBuilt = false, hotDealer = null;
const dealerMarkers = {};

function filteredListings() {
  const f = S.ex;
  let out = listings.filter(l => inRadius(l) && f.cats.includes(l.model.category));
  if (S.mapTrims) out = out.filter(l => l.modelId !== S.mapTrims.modelId || S.mapTrims.trims.includes(l.trimName));
  if (S.mapTrims && !f.models.length) out = out.filter(l => l.modelId === S.mapTrims.modelId);
  if (f.models.length) out = out.filter(l => f.models.includes(l.modelId) || (S.mapTrims && l.modelId === S.mapTrims.modelId));
  if (f.min) out = out.filter(l => l.cost >= f.min);
  if (f.max) out = out.filter(l => l.cost <= f.max);
  if (f.year && f.year !== "all") out = out.filter(l => l.year == f.year);
  if (f.status !== "all") out = out.filter(l => f.status === "stock" ? !/transit|build|order/i.test(l.status || "") : /transit|build|order/i.test(l.status || ""));
  if (S.exDealer) out = out.filter(l => l.dealerId === S.exDealer);
  const disc = l => l.msrp && l.price ? (l.msrp - l.price) / l.msrp : 0;
  const sorters = {
    deal: (a, b) => disc(b) - disc(a) || a.cost - b.cost,
    price: (a, b) => a.cost - b.cost,
    priceDesc: (a, b) => b.cost - a.cost,
    distance: (a, b) => a.dealer.miles - b.dealer.miles || a.cost - b.cost,
  };
  return out.sort(sorters[f.sort] || sorters.deal);
}
// cheapest price within 50 mi for each model+trim, for "lowest price" badges
function lowestByTrim() {
  const best = {}, n = {};
  listings.filter(inRadius).forEach(l => { const k = l.modelId + "|" + l.trimName; n[k] = (n[k] || 0) + 1; if (!best[k] || l.cost < best[k].cost) best[k] = l; });
  Object.keys(best).forEach(k => { if (n[k] < 3) delete best[k]; });   // a "lowest price" badge only means something with a few to compare
  return best;
}

function buildExplore() {
  const el = $("#v-explore");
  el.innerHTML = `<div class="filters" id="exFilters"></div>
    <div class="split"><section class="gallery" id="exGallery"></section>
    <section class="mapcol"><div id="map"></div><div id="dealerFilter"></div>
      <div class="maplegend">${Object.entries(CATS).map(([k, c]) => `<div class="cat-${k}"><i></i>${esc(c.name)}</div>`).join("")}</div></section></div>`;
  map = L.map("map", { zoomControl: false }).setView([HOME.lat - 0.12, HOME.lng + 0.05], 9);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles © Esri", maxZoom: 17, className: "warm-tiles",
  }).addTo(map);
  map._radius = L.circle([HOME.lat, HOME.lng], { radius: S.radius * 1609.34, color: "#2f4535", weight: 1.5, dashArray: "6 6", fillColor: "#7f9479", fillOpacity: .05, interactive: false }).addTo(map);
  L.marker([HOME.lat, HOME.lng], { icon: L.divIcon({ className: "", html: '<div class="home-pin" title="Fort Collins">⌂</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on("zoomend", drawPins);
  exploreBuilt = true;

  el.addEventListener("click", onExploreClick);
  el.addEventListener("mouseover", e => { const c = e.target.closest(".card"); if (c) setHot(c.dataset.dealer); });
  el.addEventListener("mouseout", e => { const c = e.target.closest(".card"); if (c && !c.contains(e.relatedTarget)) setHot(null); });
}
function setHot(id) {
  if (hotDealer === id) return;
  if (hotDealer && dealerMarkers[hotDealer]) dealerMarkers[hotDealer].getElement()?.classList.remove("hot");
  hotDealer = id;
  if (id && dealerMarkers[id]) { const el = dealerMarkers[id].getElement(); el?.classList.add("hot"); dealerMarkers[id].setZIndexOffset(2000); }
}

function renderExplore() {
  if (!exploreBuilt) buildExplore();
  const f = S.ex, list = filteredListings(), best = lowestByTrim();
  const allIn = listings.filter(inRadius);
  const modelCounts = {}; allIn.forEach(l => { modelCounts[l.modelId] = (modelCounts[l.modelId] || 0) + 1; });
  const gm = S.mapTrims && modelById[S.mapTrims.modelId];

  $("#exFilters").innerHTML = `
    ${Object.entries(CATS).map(([k, c]) => `<button class="chip cat-${k} ${f.cats.includes(k) ? "on" : ""}" data-xcat="${k}"><i class="dot"></i>${esc(c.name)}</button>`).join("")}
    <span class="sep"></span>
    ${gm ? `<button class="chip from-garage" data-cleargarage title="From the Garage — click to clear">${esc(gm.model)} · ${esc(S.mapTrims.trims.join(" + "))} ✕</button>` : ""}
    <button class="chip drop ${f.models.length ? "on" : ""}" data-pop="models">${f.models.length ? f.models.length + " models" : gm ? "+ Add models" : "Make / model"}</button>
    <button class="chip drop ${f.min || f.max ? "on" : ""}" data-pop="price">${f.min || f.max ? `${f.min ? short(f.min) : "$0"} – ${f.max ? short(f.max) : "any"}` : "Price"}</button>
    <button class="chip drop ${f.year && f.year !== "all" ? "on" : ""}" data-pop="year">${f.year && f.year !== "all" ? f.year + " models" : "All years"}</button>
    <button class="chip drop ${f.status !== "all" ? "on" : ""}" data-pop="status">${{ all: "In stock + in transit", stock: "On the lot", transit: "In transit" }[f.status]}</button>
    <span class="sep"></span>
    <span class="toggle"><button data-mode="buy" class="${f.mode === "buy" ? "on" : ""}">Buy</button><button data-mode="lease" class="${f.mode === "lease" ? "on" : ""}">Lease</button></span>
    <span style="flex:1"></span>
    <select class="chip" id="exSort" aria-label="Sort">${[["deal", "Sort: Best deal"], ["price", "Price: low → high"], ["priceDesc", "Price: high → low"], ["distance", "Closest first"]].map(([v, n]) => `<option value="${v}" ${f.sort === v ? "selected" : ""}>${n}</option>`).join("")}</select>`;
  $("#exFilters").dataset.counts = JSON.stringify(modelCounts);
  document.documentElement.style.setProperty("--fh", $("#exFilters").offsetHeight + "px");

  const dealerIds = new Set(list.map(l => l.dealerId));
  const d = S.exDealer && dealerById[S.exDealer];
  $("#dealerFilter").innerHTML = d ? `<div class="dealer-filter">Only ${esc(d.name)} <button data-cleardealer>✕ Show all</button></div>` : "";

  const cards = list.slice(0, 120).map(l => {
    const isBest = best[l.modelId + "|" + l.trimName] === l;
    const q = Finance.quick(l.cost, l.msrp || l.cost, "excellent", quickOpts(l.modelId, leaseOffer(l.modelId, l.trimName)));
    const transit = /transit|build|order/i.test(l.status || "");
    const disc = l.msrp && l.price && l.msrp > l.price ? l.msrp - l.price : 0;
    const photo = safeUrl(l.photo) ? l.photo : l.model.image;
    return `<article class="card cat-${l.model.category}" data-dealer="${esc(l.dealerId)}" data-id="${esc(l.id)}">
      <div class="ph ${safeUrl(l.photo) ? "" : "stock"}" style="background-image:${cssUrl(photo)}">
        <span class="cat">${esc(CATS[l.model.category].short)}</span>
        <button class="star ${S.shortlist.includes(l.id) ? "on" : ""}" data-star="${esc(l.id)}" aria-label="Shortlist">★</button>
        ${isBest ? `<span class="deal">Lowest price nearby</span>` : transit ? `<span class="deal transit">In transit</span>` : disc > 0 ? `<span class="deal">${money(disc)} off MSRP</span>` : ""}
      </div>
      <div class="bd">
        <div class="t">${esc(l.year)} ${esc(l.model.make)} ${esc(l.model.model)}</div>
        <div class="s" title="${esc(l.trim)}">${esc(l.trimName || l.trim || "")}${l.exteriorColor ? " · " + esc(l.exteriorColor) : ""}</div>
        <div class="row">
          ${f.mode === "lease"
            ? `<div class="pr">${money(q.lease)}<s>/mo</s><small>est. lease · 36 mo · ${money(5000)} down</small></div><div class="pm"><b>${money(l.cost)}</b><br>${l.price ? "advertised" : "MSRP"}</div>`
            : `<div class="pr">${money(l.cost)}${disc ? `<s>${money(l.msrp)}</s>` : ""}<small>${l.price ? "advertised price" : "MSRP (no price listed)"}</small></div><div class="pm"><b>${money(q.buy)}</b>/mo buy<br><b>${money(q.lease)}</b>/mo lease est.</div>`}
        </div>
        <div class="dl"><span title="${esc(l.dealer.name)}">📍 ${l.dealer.miles.toFixed(1)} mi · ${esc(l.dealer.name)}</span>
          <span class="links"><button data-calc="${esc(l.id)}">Calculate</button>${safeUrl(l.url) ? `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">Dealer page ↗</a>` : ""}</span></div>
      </div></article>`;
  }).join("");
  $("#exGallery").innerHTML = `<div class="ghead"><h2>${list.length} vehicle${list.length === 1 ? "" : "s"} <span>· ${dealerIds.size} dealer${dealerIds.size === 1 ? "" : "s"} within ${S.radius} mi</span></h2><span class="label">Hover a card to find it on the map</span></div>
    ${list.length ? `<div class="grid">${cards}</div>${list.length > 120 ? `<p class="muted" style="margin-top:12px">Showing the first 120 — narrow the filters to see more.</p>` : ""}` : `<div class="empty">Nothing matches these filters. Try clearing the Garage filter or widening the radius.</div>`}`;

  // map pins: one per dealer (clustered when they overlap), grey dots for lots we couldn't load
  map._radius.setRadius(S.radius * 1609.34);
  const makes = new Set(list.map(l => l.model.make));
  pinState.pins = []; pinState.ghosts = []; pinState.gm = gm; pinState.mode = f.mode;
  dealers.filter(dl => dl.lat && dl.miles <= S.radius + 0.5).forEach(dl => {
    const ls = list.filter(l => l.dealerId === dl.id);
    if (ls.length) pinState.pins.push({ dl, ls });
    else if (!listings.some(l => l.dealerId === dl.id) && (dl.brands || []).some(b => makes.has(b))) pinState.ghosts.push(dl);
  });
  drawPins();
  setTimeout(() => {
    map.invalidateSize();
    // re-frame the map when the set of dealers on it changes
    const key = pinState.pins.map(p => p.dl.id).sort().join(",");
    if (key !== renderExplore._key && pinState.pins.length) {
      renderExplore._key = key;
      map.fitBounds(L.latLngBounds([...pinState.pins.map(p => [p.dl.lat, p.dl.lng]), [HOME.lat, HOME.lng]]).pad(0.12), { maxZoom: 11 });
    }
  }, 0);
}
const pinState = { pins: [], ghosts: [], gm: null, mode: "buy" };
function pinPrice(l) { return pinState.mode === "lease" ? money(Finance.quick(l.cost, l.msrp || l.cost).lease) + "/mo" : short(l.cost); }
function drawPins() {
  if (!map) return;
  markerLayer.clearLayers();
  Object.keys(dealerMarkers).forEach(k => delete dealerMarkers[k]);
  pinState.ghosts.forEach(dl => {
    L.circleMarker([dl.lat, dl.lng], { radius: 5, color: "#7d8a8f", weight: 2, fillColor: "#fbf8f2", fillOpacity: 1 })
      .bindTooltip(`${esc(dl.name)}: inventory not loaded`).bindPopup(() => dealerPopup(dl, []), { maxWidth: 300 }).addTo(markerLayer);
  });
  // greedy screen-space grouping so labels never sit on top of each other
  const groups = [];
  pinState.pins.slice().sort((a, b) => b.ls.length - a.ls.length).forEach(p => {
    const pt = map.latLngToContainerPoint([p.dl.lat, p.dl.lng]);
    const g = groups.find(g => Math.abs(g.pt.x - pt.x) < 140 && Math.abs(g.pt.y - pt.y) < 34);
    if (g) g.items.push(p); else groups.push({ pt, items: [p] });
  });
  groups.forEach(g => {
    const all = g.items.flatMap(p => p.ls);
    const cheapest = all.reduce((a, b) => a.cost <= b.cost ? a : b);
    const fav = pinState.gm && all.some(l => l.modelId === pinState.gm.id) ? '<span class="star">★</span>' : "";
    const c = CATS[cheapest.model.category].color;
    let mk;
    if (g.items.length === 1) {
      const { dl, ls } = g.items[0];
      mk = L.marker([dl.lat, dl.lng], { icon: L.divIcon({ className: "dpin", html: `<div style="--c:${c}"><span class="n">${ls.length}</span>${pinPrice(cheapest)}${fav}</div>`, iconSize: null }), zIndexOffset: 100, title: dl.name });
      mk.bindPopup(() => dealerPopup(dl, ls), { maxWidth: 300, minWidth: 260 });
    } else {
      const lat = g.items.reduce((s, p) => s + p.dl.lat, 0) / g.items.length, lng = g.items.reduce((s, p) => s + p.dl.lng, 0) / g.items.length;
      mk = L.marker([lat, lng], { icon: L.divIcon({ className: "dpin", html: `<div style="--c:${c}"><span class="n">${all.length}</span>${g.items.length} lots · from ${pinPrice(cheapest)}${fav}</div>`, iconSize: null }), zIndexOffset: 200,
        title: g.items.map(p => p.dl.name).join(", ") });
      mk.on("click", () => map.fitBounds(L.latLngBounds(g.items.map(p => [p.dl.lat, p.dl.lng])).pad(0.6), { maxZoom: 15 }));
    }
    mk.addTo(markerLayer);
    g.items.forEach(p => { dealerMarkers[p.dl.id] = mk; });
  });
  hotDealer = null;
}
function dealerPopup(dl, ls) {
  const top = ls.slice().sort((a, b) => a.cost - b.cost).slice(0, 5);
  const div = document.createElement("div");
  div.className = "dpop";
  div.innerHTML = `<h4>${esc(dl.name)}</h4><div class="meta">${esc(dl.address || "")}${dl.city ? ", " + esc(dl.city) : ""} · ${dl.miles.toFixed(1)} mi${dl.phone ? " · " + esc(dl.phone) : ""}</div>
    ${top.map(l => `<div class="li"><div class="th" style="background-image:${cssUrl(safeUrl(l.photo) ? l.photo : l.model.image)}"></div><div><b>${money(l.cost)}</b> · ${esc(l.year)} ${esc(l.model.model)} ${esc(l.trimName || "")}<br>${safeUrl(l.url) ? `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">Open listing ↗</a>` : ""}</div></div>`).join("")}
    ${!ls.length ? `<div class="meta">We haven't loaded this dealer's inventory. Browse it on their site:</div>` : ""}
    <div class="acts">${ls.length ? `<button class="btn sm dark" data-onlydealer="${esc(dl.id)}">Only this dealer</button>` : ""}
      ${safeUrl(dl.newInventoryUrl || dl.website) ? `<a class="btn sm ghost" href="${esc(safeUrl(dl.newInventoryUrl || dl.website))}" target="_blank" rel="noopener">Dealer site ↗</a>` : ""}</div>`;
  div.addEventListener("click", e => { const b = e.target.closest("[data-onlydealer]"); if (b) { S.exDealer = b.dataset.onlydealer; map.closePopup(); renderExplore(); } });
  return div;
}

function onExploreClick(e) {
  const b = e.target.closest("[data-xcat],[data-cleargarage],[data-pop],[data-mode],[data-star],[data-calc],[data-cleardealer]");
  if (!b) return;
  const f = S.ex;
  if (b.dataset.xcat) { const k = b.dataset.xcat; f.cats = f.cats.includes(k) ? f.cats.filter(x => x !== k) : [...f.cats, k]; }
  else if (b.hasAttribute("data-cleargarage")) S.mapTrims = null;
  else if (b.dataset.mode) f.mode = b.dataset.mode;
  else if (b.dataset.star) { toggleShortlist(b.dataset.star); return; }
  else if (b.dataset.calc) { setPayVehicle({ type: "listing", id: b.dataset.calc }); go("payments"); return; }
  else if (b.hasAttribute("data-cleardealer")) S.exDealer = null;
  else if (b.dataset.pop) { openPop(b, b.dataset.pop); return; }
  save(); renderExplore();
}
$("#v-explore").addEventListener("change", e => { if (e.target.id === "exSort") { S.ex.sort = e.target.value; save(); renderExplore(); } });

function openPop(anchor, kind) {
  closePop();
  const f = S.ex, p = document.createElement("div");
  p.className = "pop"; p.id = "pop";
  const counts = JSON.parse($("#exFilters").dataset.counts || "{}");
  if (kind === "models") {
    const groups = Object.keys(CATS).map(k => [k, models.filter(m => m.category === k)]);
    p.innerHTML = groups.map(([k, ms]) => `<div class="label" style="margin:6px 0 2px">${esc(CATS[k].name)}</div>` + ms.map(m =>
      `<label><input type="checkbox" value="${esc(m.id)}" ${f.models.includes(m.id) ? "checked" : ""}> ${esc(m.make)} ${esc(m.model)} <span class="muted" style="margin-left:auto">${counts[m.id] || 0}</span></label>`).join("")).join("")
      + `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-clear>Clear</button><button class="btn sm" data-done>Done</button></div>`;
    p.addEventListener("change", () => { f.models = $$("input:checked", p).map(i => i.value); save(); renderExplore(); });
  } else if (kind === "price") {
    p.innerHTML = `<div class="label">Price range</div><div class="row" style="margin:8px 0"><input type="number" id="pMin" placeholder="Min" step="1000" value="${f.min || ""}"> – <input type="number" id="pMax" placeholder="Max" step="1000" value="${f.max || ""}"></div>
      <div class="row"><button class="btn sm ghost" data-clear>Clear</button><button class="btn sm" data-done>Apply</button></div>`;
  } else if (kind === "year") {
    const n = y => listings.filter(l => inRadius(l) && (y === "all" || l.year == y)).length;
    p.innerHTML = ["all", ...YEARS.map(String)].map(y => `<label><input type="radio" name="yr" value="${y}" ${String(f.year || "all") === y ? "checked" : ""}> ${y === "all" ? "All model years" : y + " models"} <span class="muted" style="margin-left:auto">${n(y)}</span></label>`).join("");
    p.addEventListener("change", e => { f.year = e.target.value; save(); closePop(); renderExplore(); });
  } else {
    p.innerHTML = [["all", "In stock + in transit"], ["stock", "On the lot now"], ["transit", "In transit / arriving"]].map(([v, n]) => `<label><input type="radio" name="st" value="${v}" ${f.status === v ? "checked" : ""}> ${n}</label>`).join("");
    p.addEventListener("change", e => { f.status = e.target.value; save(); closePop(); renderExplore(); });
  }
  p.addEventListener("click", e => {
    if (e.target.closest("[data-done]")) {
      if (kind === "price") { f.min = +$("#pMin", p).value || null; f.max = +$("#pMax", p).value || null; save(); renderExplore(); }
      closePop();
    } else if (e.target.closest("[data-clear]")) {
      if (kind === "price") { f.min = f.max = null; } else f.models = [];
      save(); closePop(); renderExplore();
    }
  });
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  p.style.left = Math.min(r.left, innerWidth - p.offsetWidth - 10) + "px";
  p.style.top = r.bottom + scrollY + 6 + "px";
  setTimeout(() => document.addEventListener("click", outside), 0);
}
function outside(e) { if (!e.target.closest("#pop")) closePop(); }
function closePop() { $("#pop")?.remove(); document.removeEventListener("click", outside); }

/* ============================================================
   SHORTLIST
   ============================================================ */
function toggleShortlist(id) {
  const i = S.shortlist.indexOf(id);
  if (i >= 0) S.shortlist.splice(i, 1); else { S.shortlist.push(id); toast("Added to shortlist"); }
  save(); updateShortlist();
  if (!$("#v-explore").hidden) renderExplore();
}
function updateShortlist() {
  S.shortlist = S.shortlist.filter(id => listingById[id]);
  $("#slCount").textContent = S.shortlist.length;
  const items = S.shortlist.map(id => listingById[id]);
  $("#drawer").innerHTML = `<h2>Shortlist <button class="btn sm ghost" data-closedrawer>Close</button></h2>
    ${items.length ? items.map(l => `<div class="sl-item"><div class="th" style="background-image:${cssUrl(safeUrl(l.photo) ? l.photo : l.model.image)}"></div>
      <div><b>${esc(l.year)} ${esc(l.model.model)} ${esc(l.trimName || "")}</b><span>${money(l.cost)} · ${esc(l.dealer.name)}</span><br>
      <span><button class="muted" data-slcalc="${esc(l.id)}" style="color:var(--rust-2);font-weight:600">Calculate</button>${safeUrl(l.url) ? ` · <a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener" style="color:var(--rust-2);font-weight:600">Dealer page ↗</a>` : ""}</span></div>
      <button data-slremove="${esc(l.id)}" aria-label="Remove" class="muted">✕</button></div>`).join("")
    : `<p class="muted">Tap ★ on any car in Explore to save it here.</p>`}`;
}
$("#slBtn").addEventListener("click", () => { updateShortlist(); $("#drawer").classList.toggle("open"); });
$("#drawer").addEventListener("click", e => {
  const b = e.target.closest("[data-closedrawer],[data-slremove],[data-slcalc]"); if (!b) return;
  if (b.dataset.slremove) toggleShortlist(b.dataset.slremove);
  else if (b.dataset.slcalc) { setPayVehicle({ type: "listing", id: b.dataset.slcalc }); $("#drawer").classList.remove("open"); go("payments"); }
  else $("#drawer").classList.remove("open");
});

/* ============================================================
   PAYMENTS
   ============================================================ */
function payVehicle(src) {
  if (src?.type === "listing" && listingById[src.id]) {
    const l = listingById[src.id];
    return { m: l.model, t: l.model.trims[l.trimIdx] || null, trimName: l.trimName, price: l.cost, msrp: l.msrp || l.cost, label: `${l.dealer.name} · listed ${money(l.cost)}`, img: safeUrl(l.photo) ? l.photo : l.model.image, listing: l };
  }
  const m = modelById[src?.modelId] || curModel();
  const t = m.trims[clamp(src?.trimIdx ?? defaultTrim(m), 0, m.trims.length - 1)];
  const msrp = (t.msrp || 0) + (m.destination || 0);
  const yr = S.gYear !== "all" && listings.some(l => l.modelId === m.id && l.year == S.gYear) ? +S.gYear : m.year;
  return { m, t, trimName: t.name, price: msrp, msrp, label: `MSRP ${money(t.msrp)} + ${money(m.destination || 0)} destination`, img: showroomImage(m, t.name, yr).url };
}
function setPayVehicle(src) {
  const v = payVehicle(src);
  if (v.listing) { S.gModel = v.m.id; if (v.listing.trimIdx >= 0) S.gTrim = v.listing.trimIdx; S.gYear = String(v.listing.year); }
  else { S.gModel = v.m.id; S.gTrim = v.m.trims.indexOf(v.t); }
  const apr = apr60(v.m.id) || bestApr(v.m.id);
  const lo = leaseOffer(v.m.id, v.trimName);
  const on = {};
  if (apr) on[apr.key] = true;
  if (lo && (lo.residualPct || lo.moneyFactor)) on[lo.key] = true;
  offersFor(v.m.id).filter(o => o.type === "cash" && o.cashAmount).forEach(o => { on[o.key] = true; });
  const old = S.pay || {};
  S.pay = {
    src, price: Math.round(v.price), msrp: Math.round(v.msrp),
    down: old.down ?? 5000, trade: old.trade ?? 0, credit: old.credit ?? "excellent",
    loanMonths: apr?.aprMonths || old.loanMonths || 60, leaseMonths: lo?.months || 36, leaseMiles: lo?.milesPerYear || old.leaseMiles || 10000,
    taxRate: old.taxRate ?? Finance.DEFAULT_TAX, dealerFee: old.dealerFee ?? 799, acqFee: 650,
    aprOverride: null, mfOverride: null, resOverride: null, on,
  };
  save();
}
function payInputs() {
  const p = S.pay, v = payVehicle(p.src);
  const offs = [...offersFor(v.m.id), ...S.userOffers.map(u => ({ ...u, key: u.key }))];
  const active = offs.filter(o => p.on[o.key]);
  const aprOff = active.filter(o => o.type === "apr" && o.apr != null).sort((a, b) => a.apr - b.apr)[0];
  const leaseOff = active.find(o => o.type === "lease");
  const rebates = active.filter(o => ["cash", "loyalty", "conquest", "other"].includes(o.type) && o.cashAmount).reduce((s, o) => s + o.cashAmount, 0);
  const loanApr = p.aprOverride ?? aprOff?.apr ?? Finance.CREDIT_APR[p.credit];
  const loanMonths = aprOff?.aprMonths ?? p.loanMonths;
  const residualPct = p.resOverride ?? leaseOff?.residualPct ?? Finance.residualGuess(p.leaseMonths, p.leaseMiles);
  const moneyFactor = p.mfOverride ?? leaseOff?.moneyFactor ?? Finance.CREDIT_MF[p.credit];
  return { v, offs, aprOff, leaseOff, rebates, d: { price: p.price, msrp: p.msrp, down: p.down, trade: p.trade, rebates, dealerFee: p.dealerFee, taxRate: p.taxRate, credit: p.credit, loanApr, loanMonths, leaseMonths: p.leaseMonths, leaseMiles: p.leaseMiles, residualPct, moneyFactor, acqFee: p.acqFee } };
}

function renderPayments() {
  const gm = curModel(), gti = curTrimIdx(), cur = S.pay?.src;
  const curL = cur?.type === "listing" ? listingById[cur.id] : null;
  const inSync = cur && (curL ? curL.modelId === gm.id && (curL.trimIdx === gti || curL.trimIdx < 0) : cur.type === "trim" && cur.modelId === gm.id && cur.trimIdx === gti);
  if (!S.pay || !inSync) setPayVehicle({ type: "trim", modelId: gm.id, trimIdx: gti });
  const p = S.pay, { v, offs, aprOff, leaseOff, rebates, d } = payInputs();
  const r = Finance.compute(d);
  const anyLease = leaseOffer(v.m.id, v.trimName);

  // vehicle picker options
  const opts = [];
  if (S.shortlist.length) opts.push(`<optgroup label="Shortlist">${S.shortlist.map(id => listingById[id]).filter(Boolean).map(l => `<option value="L:${esc(l.id)}" ${p.src.type === "listing" && p.src.id === l.id ? "selected" : ""}>${esc(l.year + " " + l.model.model + " " + (l.trimName || ""))} · ${money(l.cost)} · ${esc(l.dealer.name)}</option>`).join("")}</optgroup>`);
  if (p.src.type === "listing" && !S.shortlist.includes(p.src.id) && listingById[p.src.id]) { const l = listingById[p.src.id]; opts.push(`<optgroup label="Selected listing"><option value="L:${esc(l.id)}" selected>${esc(l.year + " " + l.model.model + " " + (l.trimName || ""))} · ${money(l.cost)} · ${esc(l.dealer.name)}</option></optgroup>`); }
  opts.push(...Object.keys(CATS).map(k => `<optgroup label="${esc(CATS[k].name)} — MSRP">${models.filter(m => m.category === k).flatMap(m => m.trims.map((t, i) => `<option value="T:${esc(m.id)}:${i}" ${p.src.type === "trim" && p.src.modelId === m.id && p.src.trimIdx === i ? "selected" : ""}>${esc(m.year + " " + m.make + " " + m.model + " " + t.name)} · ${money(t.msrp)}</option>`)).join("")}</optgroup>`));

  const slider = (key, label, min, max, step, extra = "") => `<div class="field"><div class="top">${label}${extra}<input type="number" data-num="${key}" value="${p[key]}" step="${step}" aria-label="${esc(label)}"></div>
    <input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${clamp(p[key], min, max)}" aria-label="${esc(label)}"></div>`;
  const seg = (key, vals, fmt = x => x) => `<div class="seg">${vals.map(x => `<button data-seg="${key}" data-val="${x}" class="${p[key] == x ? "on" : ""}">${fmt(x)}</button>`).join("")}</div>`;

  const finBest = r.net8.fin <= r.net8.lease;
  const offerHtml = o => {
    const on = !!p.on[o.key];
    const what = o.type === "lease" ? `Lease ${money(o.monthly)}/mo · ${o.months} mo` : o.type === "apr" ? `${o.apr}% APR · ${o.aprMonths} mo` : o.cashAmount ? `${money(o.cashAmount)} ${o.type === "cash" ? "cash back" : o.type}` : (o.headline || o.type);
    const clip = (t, n) => t && t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t || "";
    const fine = o.type === "lease" ? `${esc(o.trim || "")} · ${money(o.dueAtSigning)} due · ${(o.milesPerYear || 10000) / 1000}k mi${o.residualPct ? ` · ${o.residualPct}% res` : ""}${o.moneyFactor ? ` · MF ${o.moneyFactor}` : ""}` : esc(o.trim ? "On " + o.trim : clip(o.notes, 60));
    return `<div class="offer ${on ? "on" : ""}" data-offer="${esc(o.key)}" role="button" tabindex="0" title="${esc(o.notes || "")}">
      <div class="src">${esc(String(o.sourceName || (o.user ? "You added" : "Manufacturer")).split(" (")[0])} <em>${o.expires ? esc(endsLabel(o)) : o.user ? "yours" : ""}</em></div>
      <div class="what">${esc(what)}</div><div class="fine">${fine}${safeUrl(o.source) ? ` · <a href="${esc(safeUrl(o.source))}" target="_blank" rel="noopener">source</a>` : ""}</div>
      <span class="sw"></span>${o.user ? `<button class="del" data-deloffer="${esc(o.key)}">remove</button>` : ""}</div>`;
  };

  $("#v-payments").innerHTML = `<div class="pay">
    <section class="panel">
      <div class="pay-nav"><button class="btn sm ghost" id="toGarage">‹ Back to Garage</button><span class="muted" title="Press P to flip between Garage and Payments">P flips screens</span></div>
      <h2>Your deal</h2>
      ${(() => {
        const m = v.m, ti = m.trims.findIndex(t => t.name === v.trimName), yrs = [...new Set(listings.filter(l => l.modelId === m.id).map(l => l.year))].sort();
        const yr = yrs.includes(+S.gYear) ? +S.gYear : "all";
        const cars = listings.filter(l => l.modelId === m.id && l.trimName === v.trimName && inRadius(l) && (yr === "all" || l.year == yr)).sort((a, b) => a.cost - b.cost);
        return `<div class="trim-mini"><button class="arrow" data-ptrim="-1" aria-label="Previous trim" ${ti <= 0 ? "disabled" : ""}>‹</button>
            <span><b>${esc(v.trimName)}</b><small>trim ${ti + 1} of ${m.trims.length}</small></span>
            <button class="arrow" data-ptrim="1" aria-label="Next trim" ${ti >= m.trims.length - 1 ? "disabled" : ""}>›</button></div>
          ${yrs.length > 1 ? `<div class="seg" style="margin-bottom:8px">${["all", ...yrs].map(y => `<button data-pyear="${y}" class="${yr == y ? "on" : ""}">${y === "all" ? "Any year" : y}</button>`).join("")}</div>` : ""}
          <div class="field"><div class="top">Price it as</div>
            <select id="payCar" class="pick" aria-label="Price it as"><option value="">Sticker price (MSRP + destination)</option>
            ${cars.map(l => `<option value="${esc(l.id)}" ${v.listing === l ? "selected" : ""}>${esc(l.year)} · ${money(l.cost)} · ${esc(l.dealer.name.split(" (")[0])} · ${esc(l.exteriorColor || "")}</option>`).join("")}</select>
            <div class="fineprint" style="margin-top:4px">${cars.length} of this trim on lots nearby${yr === "all" ? "" : " (" + yr + ")"}, cheapest first</div></div>`;
      })()}
      <div class="veh"><div class="th" style="background-image:${cssUrl(v.img)}"></div><div><b>${esc((v.listing?.year || v.m.year) + " " + v.m.model + " " + (v.trimName || ""))}</b><span>${esc(v.label)}</span></div>
        <details class="anyveh"><summary>Pick a different vehicle</summary><select id="payPick" aria-label="Vehicle">${opts.join("")}</select></details></div>
      ${slider("price", "Negotiated price", 15000, 90000, 100)}
      ${slider("down", "Down payment", 0, 30000, 500)}
      ${slider("trade", "Trade-in value", 0, 50000, 500)}
      <div class="field"><div class="top">Credit tier</div>${seg("credit", ["excellent", "good", "fair"], x => x[0].toUpperCase() + x.slice(1))}</div>
      <div class="field"><div class="top">Loan term${aprOff ? " <small>set by promo</small>" : ""}</div>${seg("loanMonths", [36, 48, 60, 72], x => x + " mo")}</div>
      <div class="field"><div class="top">Lease term · miles/yr</div>${seg("leaseMonths", [24, 36, 39, 48], x => x + " mo")}<div style="height:6px"></div>${seg("leaseMiles", [7500, 10000, 12000, 15000], x => x / 1000 + "k")}</div>
      <details class="adv"><summary>Rates, taxes & fees</summary><div class="grid2">
        <label>Loan APR %<input type="number" step="0.01" data-ovr="aprOverride" value="${p.aprOverride ?? ""}" placeholder="${d.loanApr}"></label>
        <label>Money factor<input type="number" step="0.00001" data-ovr="mfOverride" value="${p.mfOverride ?? ""}" placeholder="${d.moneyFactor}"></label>
        <label>Residual %<input type="number" step="0.5" data-ovr="resOverride" value="${p.resOverride ?? ""}" placeholder="${d.residualPct}"></label>
        <label>Sales tax %<input type="number" step="0.01" data-num="taxRate" value="${p.taxRate}"></label>
        <label>Dealer fee $<input type="number" step="1" data-num="dealerFee" value="${p.dealerFee}"></label>
        <label>Lease acq. fee $<input type="number" step="1" data-num="acqFee" value="${p.acqFee}"></label>
      </div><p class="fineprint" style="margin-top:6px">Blank = use the active offer, or a typical rate for your credit tier.</p></details>
      <div class="otd">
        <div><span>Price</span><span>${money(p.price)}</span></div>
        ${rebates ? `<div><span>Rebates & bonuses</span><span>−${money(rebates)}</span></div>` : ""}
        <div><span>Sales tax · ${p.taxRate}%</span><span>${money(r.salesTax)}</span></div>
        <div><span>Dealer handling fee</span><span>${money(p.dealerFee)}</span></div>
        <div><span>CO registration + ownership tax (est.)</span><span>${money(r.reg)}</span></div>
        ${p.trade ? `<div><span>Trade-in</span><span>−${money(p.trade)}</span></div>` : ""}
        <div class="tot"><span>Out-the-door</span><b>${money(r.otd)}</b></div>
      </div>
    </section>

    <section class="mid">
      <div class="opts">
        <div class="opt ${finBest ? "best" : ""}" style="--c:#2f4535">
          ${finBest ? `<span class="ribbon">Best if keeping it 8 yrs</span>` : ""}
          <div class="kind">Finance</div>
          <div class="terms">${d.loanApr}% APR · ${d.loanMonths} mo${aprOff ? " · " + esc(String(aprOff.sourceName || "promo").split(" (")[0]) + " offer" : ` · typical ${p.credit} rate`}</div>
          <div class="big">${money(r.loan.pmt)}<small>/mo</small></div>
          <dl><dt>Due at signing</dt><dd>${money(p.down)}</dd><dt>Total interest</dt><dd>${money(r.loan.interest)}</dd><dt>Total paid</dt><dd>${money(r.loan.total)}</dd></dl>
          <div class="end">After ${d.loanMonths / 12} yrs: <b>you own it</b> · est. value ${short(r.loan.valueAtPayoff)}</div>
        </div>
        <div class="opt ${!finBest ? "best" : ""}" style="--c:#c4622d">
          ${!finBest ? `<span class="ribbon">Lowest 8-yr cost</span>` : ""}
          <div class="kind">Lease</div>
          <div class="terms">${d.leaseMonths} mo · ${d.leaseMiles / 1000}k mi/yr · MF ${d.moneyFactor} · ${d.residualPct}% residual${leaseOff ? "" : " (estimated)"}</div>
          <div class="big">${money(r.lease.pmt)}<small>/mo</small></div>
          <dl><dt>Due at signing</dt><dd>${money(r.lease.due)}</dd><dt>Rate as APR</dt><dd>${r.lease.effApr.toFixed(1)}%</dd><dt>Total paid (${d.leaseMonths} mo)</dt><dd>${money(r.lease.total)}</dd></dl>
          <div class="end">${anyLease ? `Advertised: <b>${money(anyLease.monthly)}/mo + ${money(anyLease.dueAtSigning)} due</b> (${esc(anyLease.trim || "")}, ${anyLease.months} mo) = ${money(effLease(anyLease))}/mo effective` : `After ${d.leaseMonths / 12} yrs: <b>return it</b> or buy for ${money(r.lease.residual)}`}</div>
        </div>
        <div class="opt" style="--c:#5b7f99">
          <div class="kind">Cash</div>
          <div class="terms">Pay it all up front</div>
          <div class="big">${short(r.otd)}<small> once</small></div>
          <dl><dt>Due at signing</dt><dd>${money(r.otd)}</dd><dt>Interest</dt><dd>$0</dd><dt>Savings yield given up (4%)</dt><dd>~${short(r.cash.lostYield)} / 5 yr</dd></dl>
          <div class="end">Simplest · <b>no monthly payment</b></div>
        </div>
      </div>
      <div class="panel chart">
        <div class="head"><h2>Cash out of pocket · 8 years</h2>
          <div class="lg"><span><i style="background:#2f4535"></i>Finance</span><span><i style="background:#c4622d"></i>Lease, then lease again</span><span><i style="background:#5b7f99"></i>Cash</span><span><i style="background:#7f9479"></i>Car's value (if you own it)</span></div></div>
        <svg id="payChart" role="img" aria-label="8-year cost chart"></svg>
        <div class="verdict">
          <div>Finance · net cost after 8 yrs<b>${short(r.net8.fin)}</b></div>
          <div>Leasing the whole time · 8 yrs<b>${short(r.net8.lease)}</b></div>
          <div>Cash · net cost after 8 yrs<b>${short(r.net8.cash)}</b></div>
        </div>
        <p class="fineprint" style="margin-top:8px">Net cost = everything you paid minus what the car is worth at year 8 (typical depreciation). Trade-in is left out because it's the same in every scenario. Leasing assumes you sign a similar lease each time one ends.</p>
      </div>
    </section>

    <aside class="panel offers">
      <h2>Advertised offers</h2>
      ${offs.length ? offs.map(offerHtml).join("") : `<p class="muted">No current manufacturer offers found for the ${esc(v.m.model)}.</p>`}
      <div class="addrate"><b>+ Add a rate or deal you found</b>
        <div class="grid2"><select id="uoType"><option value="apr">Loan APR</option><option value="cash">Cash discount</option></select><input id="uoName" placeholder="Source (e.g. credit union)"></div>
        <div class="grid2"><input id="uoVal" type="number" step="0.01" placeholder="APR % or $ amount"><input id="uoMonths" type="number" placeholder="Months (APR)"></div>
        <button class="btn sm" id="uoAdd">Add</button></div>
      <p class="fineprint">Offers as of ${esc(TH.offersAsOf || TH.asOf || "")}. They change monthly and usually need top-tier credit. Confirm with the dealer.</p>
    </aside>
  </div>`;
  drawPayChart(r);
}
function drawPayChart(r) {
  const svg = $("#payChart"); if (!svg) return;
  const W = svg.clientWidth || 700, H = svg.clientHeight || 300, L = 52, R = W - 14, T = 14, B = H - 26;
  const all = [...r.curves.fin, ...r.curves.lease, ...r.curves.cash].map(p => p[1]);
  const maxK = Math.max(25, Math.ceil(Math.max(...all) / 1000 / 25) * 25);
  const x = y => L + (R - L) * y / 8, yv = v => B - (B - T) * (v / 1000) / maxK;
  const path = pts => "M" + pts.map(([a, b]) => x(a).toFixed(1) + " " + yv(b).toFixed(1)).join(" L");
  let g = "";
  for (let k = 0; k <= maxK; k += 25) g += `<line x1="${L}" x2="${R}" y1="${yv(k * 1000)}" y2="${yv(k * 1000)}" stroke="rgba(38,50,58,.1)"/><text x="${L - 8}" y="${yv(k * 1000) + 4}" text-anchor="end" font-size="11" fill="#7d8a8f">$${k}k</text>`;
  for (let y = 0; y <= 8; y++) g += `<text x="${x(y)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#7d8a8f">${y ? "yr " + y : "today"}</text>`;
  const val = r.curves.value;
  g += `<path d="${path(val)} L${x(8)} ${yv(0)} L${x(0)} ${yv(0)} Z" fill="rgba(127,148,121,.12)"/><path d="${path(val)}" fill="none" stroke="#7f9479" stroke-width="2" stroke-dasharray="5 5"/>`;
  g += `<path d="${path(r.curves.cash)}" fill="none" stroke="#5b7f99" stroke-width="3"/>`;
  g += `<path d="${path(r.curves.lease)}" fill="none" stroke="#c4622d" stroke-width="3"/>`;
  g += `<path d="${path(r.curves.fin)}" fill="none" stroke="#2f4535" stroke-width="3.5"/>`;
  const payoffY = S.pay ? payInputs().d.loanMonths / 12 : 5;
  const pv = r.curves.fin[Math.min(8, Math.round(payoffY))][1];
  if (payoffY <= 8) g += `<circle cx="${x(payoffY)}" cy="${yv(pv)}" r="5" fill="#2f4535"/><text x="${x(payoffY) + 8}" y="${yv(pv) - 10}" font-size="12" font-weight="600" fill="#2f4535">Paid off: payments stop</text>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = g;
}

const payEl = $("#v-payments");
payEl.addEventListener("input", e => {
  const t = e.target, p = S.pay; if (!p) return;
  if (t.dataset.range) { p[t.dataset.range] = +t.value; const n = $(`[data-num="${t.dataset.range}"]`, payEl); if (n) n.value = t.value; liveUpdate(); }
});
payEl.addEventListener("change", e => {
  const t = e.target, p = S.pay; if (!p) return;
  if (t.id === "payCar") {
    setPayVehicle(t.value ? { type: "listing", id: t.value } : { type: "trim", modelId: S.gModel, trimIdx: curTrimIdx() });
  } else if (t.id === "payPick") {
    const [k, a, b] = t.value.split(":");
    setPayVehicle(k === "L" ? { type: "listing", id: t.value.slice(2) } : { type: "trim", modelId: a, trimIdx: +b });
  } else if (t.dataset.num) p[t.dataset.num] = +t.value || 0;
  else if (t.dataset.ovr) p[t.dataset.ovr] = t.value === "" ? null : +t.value;
  else if (t.dataset.range) p[t.dataset.range] = +t.value;
  else return;
  save(); renderPayments();
});
let liveT;
function liveUpdate() { clearTimeout(liveT); liveT = setTimeout(() => { save(); const open = $(".adv", payEl)?.open; const y = scrollY; renderPayments(); if (open) $(".adv", payEl).open = true; scrollTo(0, y); }, 120); }
payEl.addEventListener("click", e => {
  const p = S.pay; if (!p) return;
  const b = e.target.closest("[data-seg],[data-offer],[data-deloffer],[data-ptrim],[data-pyear],#toGarage,#uoAdd,a");
  if (!b || b.tagName === "A") return;
  if (b.id === "toGarage") { go("garage"); return; }
  if (b.dataset.ptrim) { const m = curModel(); setPayVehicle({ type: "trim", modelId: m.id, trimIdx: clamp(curTrimIdx() + +b.dataset.ptrim, 0, m.trims.length - 1) }); }
  else if (b.dataset.pyear) { S.gYear = b.dataset.pyear; setPayVehicle({ type: "trim", modelId: S.gModel, trimIdx: curTrimIdx() }); }
  else if (b.dataset.deloffer) { e.stopPropagation(); S.userOffers = S.userOffers.filter(o => o.key !== b.dataset.deloffer); delete p.on[b.dataset.deloffer]; }
  else if (b.dataset.seg) { const v = b.dataset.val; p[b.dataset.seg] = isNaN(+v) ? v : +v; }
  else if (b.dataset.offer) {
    const k = b.dataset.offer, o = [...TH.offers, ...S.userOffers].find(x => x.key === k);
    const turnOn = !p.on[k];
    if (turnOn && o && o.type === "apr") Object.keys(p.on).forEach(x => { const y = [...TH.offers, ...S.userOffers].find(z => z.key === x); if (y && y.type === "apr") delete p.on[x]; });
    if (turnOn && o && o.type === "lease") Object.keys(p.on).forEach(x => { const y = TH.offers.find(z => z.key === x); if (y && y.type === "lease") delete p.on[x]; });
    if (turnOn) p.on[k] = true; else delete p.on[k];
    if (o && o.type === "lease" && turnOn) { p.leaseMonths = o.months || p.leaseMonths; p.leaseMiles = o.milesPerYear || p.leaseMiles; }
    if (o && o.type === "apr" && turnOn && o.aprMonths) p.loanMonths = o.aprMonths;
  } else if (b.id === "uoAdd") {
    const type = $("#uoType").value, val = +$("#uoVal").value, months = +$("#uoMonths").value || 60, name = $("#uoName").value.trim() || "You added";
    if (!val) { toast("Enter an APR or dollar amount"); return; }
    const o = { user: true, type, sourceName: name.slice(0, 40), modelId: "*", apr: type === "apr" ? val : null, aprMonths: type === "apr" ? months : null, cashAmount: type === "cash" ? val : null };
    o.key = "user|" + Date.now();
    S.userOffers.push(o); toast("Added — toggle it on to use it");
  } else return;
  save(); renderPayments();
});
payEl.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".offer")) { e.preventDefault(); e.target.click(); } });
addEventListener("resize", () => { if (!payEl.hidden && S.pay) drawPayChart(Finance.compute(payInputs().d)); });

/* ============================================================
   DEALS
   ============================================================ */
function renderDeals() {
  const tab = S.dealsTab;
  const rows = TH.offers.filter(o => modelById[o.modelId] && S.dealsCats.includes(modelById[o.modelId].category) &&
    (tab === "lease" ? o.type === "lease" && o.monthly : tab === "apr" ? o.type === "apr" && o.apr != null : ["cash", "loyalty", "conquest", "other"].includes(o.type)));
  const sorters = {
    lease: { eff: (a, b) => effLease(a) - effLease(b), monthly: (a, b) => a.monthly - b.monthly, due: (a, b) => (a.dueAtSigning || 0) - (b.dueAtSigning || 0) },
    apr: { eff: (a, b) => a.apr - b.apr || (b.aprMonths || 0) - (a.aprMonths || 0) },
    cash: { eff: (a, b) => (b.cashAmount || 0) - (a.cashAmount || 0) },
  };
  rows.sort((sorters[tab][S.dealsSort] || sorters[tab].eff));
  const nearby = id => listings.filter(l => l.modelId === id && inRadius(l)).length;
  const podium = tab === "lease" ? rows.slice(0, 3) : [];

  $("#v-deals").innerHTML = `<div class="deals">
    <div class="deals-head"><div><h1>Deal board</h1><p>Every current manufacturer offer in one place, ranked by what it really costs you. A lease's <b>effective monthly</b> spreads the due-at-signing over the term, so a $199/mo lease with $4,000 down doesn't look cheaper than it is.</p></div>
      <div style="display:grid;gap:8px;justify-items:end">
        <span class="toggle">${[["lease", "Lease deals"], ["apr", "Low APR"], ["cash", "Cash & bonuses"]].map(([k, n]) => `<button data-dtab="${k}" class="${tab === k ? "on" : ""}">${n}</button>`).join("")}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${Object.entries(CATS).map(([k, c]) => `<button class="chip cat-${k} ${S.dealsCats.includes(k) ? "on" : ""}" data-dcat="${k}"><i class="dot"></i>${esc(c.name)}</button>`).join("")}</div>
      </div></div>
    ${podium.length ? `<div class="podium">${podium.map((o, i) => { const m = modelById[o.modelId]; return `<div class="pod cat-${m.category}">
      <div class="ph" style="background-image:${cssUrl(m.image)}"></div><div class="rank">${i + 1}</div>
      <div class="bd"><div class="t">${esc(o.year || m.year)} ${esc(m.make)} ${esc(m.model)} ${esc(o.trim || "")}</div>
        <div class="eff">${money(effLease(o))}<small>/mo effective</small></div>
        <div class="terms">${money(o.monthly)}/mo · ${money(o.dueAtSigning)} due · ${o.months} mo · ${((o.milesPerYear || 10000) / 1000)}k mi/yr${o.expires ? " · " + esc(endsLabel(o)) : ""}</div>
        <div class="acts"><button class="btn sm" data-dcalc="${esc(o.key)}">Calculate</button><button class="btn sm ghost" data-dfind="${esc(m.id)}">${nearby(m.id)} nearby ›</button>${safeUrl(o.source) ? `<a class="btn sm ghost" href="${esc(safeUrl(o.source))}" target="_blank" rel="noopener">Source ↗</a>` : ""}</div>
      </div></div>`; }).join("")}</div>` : ""}
    ${rows.length ? `<table class="dtable"><thead><tr><th>Vehicle</th><th>Category</th>
      ${tab === "lease" ? `<th data-dsort="monthly">Monthly</th><th data-dsort="due">Due at signing</th><th>Term</th><th data-dsort="eff">Effective /mo ▾</th>` : tab === "apr" ? `<th data-dsort="eff">APR ▾</th><th>Term</th><th>Payment per $10k</th>` : `<th data-dsort="eff">Amount ▾</th><th>Type</th>`}
      <th>Ends</th><th>Nearby</th><th></th></tr></thead><tbody>
      ${rows.map(o => { const m = modelById[o.modelId]; return `<tr class="cat-${m.category}"><td><div class="mod"><div class="th" style="background-image:${cssUrl(m.image)}"></div><div><b>${esc(o.year || m.year)} ${esc(m.make)} ${esc(m.model)}</b><span class="muted">${esc(o.trim || "All trims")}</span></div></div></td>
        <td><span class="catdot"></span>${esc(CATS[m.category].short)}</td>
        ${tab === "lease" ? `<td class="num">${money(o.monthly)}</td><td class="num">${money(o.dueAtSigning)}</td><td>${o.months} mo · ${((o.milesPerYear || 10000) / 1000)}k mi</td><td class="num">${money(effLease(o))}</td>`
          : tab === "apr" ? `<td class="num">${o.apr}%</td><td>${o.aprMonths || "—"} mo</td><td class="num">${money(Finance.loanPayment(10000, o.apr, o.aprMonths || 60))}</td>`
          : `<td class="num">${money(o.cashAmount)}</td><td>${esc(o.type)}${o.notes ? ` <span class="muted" title="${esc(o.notes)}">ⓘ</span>` : ""}</td>`}
        <td style="${expired(o) ? "color:var(--rust-2)" : ""}">${esc(o.expires ? endsLabel(o) : "—")}</td><td><button data-dfind="${esc(m.id)}" style="color:var(--rust-2);font-weight:600">${nearby(m.id)} ›</button></td>
        <td style="white-space:nowrap"><button data-dcalc="${esc(o.key)}" style="color:var(--rust-2);font-weight:600">Calculate</button>${safeUrl(o.source) ? ` · <a href="${esc(safeUrl(o.source))}" target="_blank" rel="noopener">Source ↗</a>` : ""}</td></tr>`; }).join("")}
      </tbody></table>` : `<div class="empty">No ${tab === "lease" ? "lease" : tab === "apr" ? "APR" : "cash"} offers in these categories right now.</div>`}
    <p class="fineprint" style="margin-top:12px">Offers gathered ${esc(TH.offersAsOf || TH.asOf || "")} for the Denver region (ZIP 80525). Most need top-tier credit through the brand's finance company, and exclude tax, title and dealer fees. Check the source before you visit.</p>
  </div>`;
}
$("#v-deals").addEventListener("click", e => {
  const b = e.target.closest("[data-dtab],[data-dcat],[data-dsort],[data-dcalc],[data-dfind]"); if (!b) return;
  if (b.dataset.dtab) { S.dealsTab = b.dataset.dtab; S.dealsSort = "eff"; }
  else if (b.dataset.dcat) { const k = b.dataset.dcat; S.dealsCats = S.dealsCats.includes(k) ? S.dealsCats.filter(x => x !== k) : [...S.dealsCats, k]; }
  else if (b.dataset.dsort) S.dealsSort = b.dataset.dsort;
  else if (b.dataset.dfind) { S.mapTrims = null; S.ex.models = [b.dataset.dfind]; S.ex.cats = Object.keys(CATS); S.exDealer = null; save(); go("explore"); return; }
  else if (b.dataset.dcalc) {
    const o = TH.offers.find(x => x.key === b.dataset.dcalc), m = modelById[o.modelId];
    const ti = Math.max(0, matchTrim(m, o.trim));
    setPayVehicle({ type: "trim", modelId: m.id, trimIdx: ti });
    S.pay.on[o.key] = true;
    if (o.type === "lease") { S.pay.leaseMonths = o.months || 36; S.pay.leaseMiles = o.milesPerYear || 10000; }
    save(); go("payments"); return;
  }
  renderDeals();
});

document.addEventListener("keydown", e => {
  if (e.key.toLowerCase() !== "p" || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("input,select,textarea") || $(".modal-bg")) return;
  if (!$("#v-garage").hidden) go("payments"); else if (!$("#v-payments").hidden) go("garage");
});

/* ============================================================
   EV LEASES — every EV lease offer, cheapest real monthly cost first
   ============================================================ */
const isEV = m => m.category === "ev";
// Colorado's Innovative Motor Vehicle credit: a base amount, plus an extra amount when MSRP is under $35k.
// Income-qualified programs (VXC) are listed on the page but never applied automatically.
function leaseCredit() {
  const items = ((TH.incentives && TH.incentives.items) || []).filter(i => /lease|both/i.test(i.appliesTo || "") && /\bIMV\b|innovative motor vehicle/i.test(i.name || "") && num(i.amount));
  const base = items.find(i => !/additional/i.test(i.name)), extra = items.find(i => /additional/i.test(i.name));
  if (!base) return null;
  const cap = extra ? num(String(extra.name + " " + (extra.amountText || "")).match(/under \$?([\d,]+)/i)?.[1]) || 35000 : 0;
  return { base: num(base.amount), extra: extra ? num(extra.amount) : 0, cap,
    for: msrp => num(base.amount) + (extra && msrp && msrp < cap ? num(extra.amount) : 0) };
}
function num(v) { const m = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? +m[0] : 0; }
function evTrim(m, o) { const i = matchTrim(m, o.trim); return i >= 0 ? m.trims[i] : m.trims[0]; }

function renderEV() {
  const credit = leaseCredit();
  const useCredit = S.evCredit && credit;
  const rows = TH.offers.filter(o => o.type === "lease" && o.monthly && modelById[o.modelId] && isEV(modelById[o.modelId])).map(o => {
    const m = modelById[o.modelId], t = evTrim(m, o), months = o.months || 36;
    const msrp = o.basedOnMsrp || (t.msrp ? t.msrp + (m.destination || 0) : null);
    const cr = useCredit ? credit.for(msrp) : 0;
    const eff = effLease(o) - cr / months;
    const mpge = t.mpg?.combined;
    const charge = mpge ? (o.milesPerYear || 10000) / 12 * (33.7 / mpge) * S.evRate : null;   // kWh per mile = 33.7 / MPGe
    return { o, m, t, months, eff, charge, cr, range: t.rangeMiles, perRange: t.rangeMiles ? eff / (t.rangeMiles / 100) : null };
  }).filter(r => !S.evMax || r.eff <= S.evMax);
  const sorters = { eff: (a, b) => a.eff - b.eff, monthly: (a, b) => a.o.monthly - b.o.monthly, due: (a, b) => (a.o.dueAtSigning || 0) - (b.o.dueAtSigning || 0),
    range: (a, b) => (b.range || 0) - (a.range || 0), perRange: (a, b) => (a.perRange ?? 1e9) - (b.perRange ?? 1e9), total: (a, b) => (a.eff + (a.charge || 0)) - (b.eff + (b.charge || 0)) };
  rows.sort(sorters[S.evSort] || sorters.eff);
  const maxEff = Math.max(1, ...rows.map(r => r.eff + (r.charge || 0)));
  const nearby = id => listings.filter(l => l.modelId === id && inRadius(l)).length;
  const incent = (TH.incentives && TH.incentives.items) || [];

  $("#v-ev").innerHTML = `<div class="deals ev">
    <div class="deals-head"><div><h1>EV lease board</h1><p>Every advertised electric-vehicle lease, ranked by <b>effective monthly</b> (payment + due-at-signing spread over the term), lowest first. The green bar adds an estimate of home charging, so you can compare the full monthly cost.</p></div>
      <div class="ev-controls">
        <label>Sort <select id="evSort">${[["eff", "Effective /mo · low → high"], ["total", "Lease + charging · low → high"], ["monthly", "Monthly payment · low → high"], ["due", "Due at signing · low → high"], ["perRange", "$ per 100 mi of range"], ["range", "Longest range"]].map(([v, n]) => `<option value="${v}" ${S.evSort === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="seg">${[[0, "Any price"], [300, "≤ $300"], [400, "≤ $400"], [500, "≤ $500"]].map(([v, n]) => `<button data-evmax="${v}" class="${S.evMax === v ? "on" : ""}">${n}</button>`).join("")}</div>
        <label>Home power <input type="number" id="evRate" step="0.01" min="0" value="${S.evRate}"> $/kWh</label>
        ${credit ? `<label class="ck" title="Assign it to the dealer at signing with Colorado Form DR 0618"><input type="checkbox" id="evCredit" ${S.evCredit ? "checked" : ""}> Apply Colorado EV credit (${money(credit.base)}${credit.extra ? `, ${money(credit.base + credit.extra)} under ${short(credit.cap)} MSRP` : ""})</label>` : ""}
      </div></div>
    ${rows.length ? `<div class="board">${rows.map((r, i) => `<div class="brow cat-ev">
      <div class="rank ${i < 3 ? "top" : ""}">${i + 1}</div>
      <div class="th" style="background-image:${cssUrl(r.m.image)}"></div>
      <div class="who"><b>${esc(r.o.year || r.m.year)} ${esc(r.m.make)} ${esc(r.m.model)}</b><span>${esc(r.o.trim || r.t.name)}</span>
        <div class="specs">${r.range ? `<i>${r.range} mi range</i>` : ""}${r.t.dcFastKw ? `<i>${r.t.dcFastKw} kW DC</i>` : ""}${r.t.chargePort ? `<i>${esc(r.t.chargePort)}</i>` : ""}${(() => { const d = (String(r.o.trim || "").match(/\b(AWD|FWD|RWD|4WD)\b/i) || [])[1] || String(r.t.drivetrain || "").split(" (")[0]; return d ? `<i>${esc(d.toUpperCase())}</i>` : ""; })()}</div></div>
      <div class="barcol"><div class="ebar"><span class="pay" style="width:${(r.eff / maxEff * 100).toFixed(1)}%"></span>${r.charge ? `<span class="chg" style="width:${(r.charge / maxEff * 100).toFixed(1)}%"></span>` : ""}</div>
        <div class="terms">${money(r.o.monthly)}/mo · ${money(r.o.dueAtSigning)} due · ${r.months} mo · ${((r.o.milesPerYear || 10000) / 1000)}k mi/yr${r.o.expires ? ` · <span class="${expired(r.o) ? "exp" : ""}">${esc(endsLabel(r.o))}</span>` : ""}</div></div>
      <div class="cost"><b>${money(r.eff)}</b><small>/mo effective</small>${r.cr ? `<em class="cr">incl. ${money(r.cr)} CO credit</em>` : ""}${r.charge ? `<em>+ ~${money(r.charge)} charging</em>` : ""}${r.perRange ? `<em>${money(r.perRange)} per 100 mi range</em>` : ""}</div>
      <div class="acts"><button class="btn sm" data-evcalc="${esc(r.o.key)}">Calculate</button><button class="btn sm ghost" data-evgarage="${esc(r.m.id)}">Garage</button>
        <button class="link" data-evfind="${esc(r.m.id)}">${nearby(r.m.id)} nearby ›</button>${safeUrl(r.o.source) ? `<a class="link" href="${esc(safeUrl(r.o.source))}" target="_blank" rel="noopener">Source ↗</a>` : ""}</div>
    </div>`).join("")}</div>` : `<div class="empty">${TH.offers.some(o => modelById[o.modelId] && isEV(modelById[o.modelId])) ? "No EV leases under that price." : "EV lease data hasn't loaded yet. Run python tools/build_data.py after the EV research finishes."}</div>`}
    ${incent.length ? `<h2 class="ev-h2">Colorado & Fort Collins EV incentives</h2><div class="incent">${incent.map(i => `<div class="inc"><div class="label">${esc(i.appliesTo || "")}</div><b>${esc(i.name)}</b><div class="amt">${esc(i.amountText || (i.amount != null ? money(i.amount) : ""))}</div><p>${esc(i.conditions || "")}</p>${i.howToClaim ? `<p class="how">${esc(i.howToClaim)}</p>` : ""}${safeUrl(i.source) ? `<a href="${esc(safeUrl(i.source))}" target="_blank" rel="noopener">Source ↗</a>` : ""}</div>`).join("")}</div>` : ""}
    <p class="fineprint" style="margin-top:12px">Offers for the Denver region (ZIP 80525), as of ${esc(TH.offersAsOf || "")}. They usually need top-tier credit and exclude tax, title and dealer fees. Charging estimate = the lease's yearly miles × the EPA efficiency × your electricity rate, all charged at home.</p>
  </div>`;
}
$("#v-ev").addEventListener("click", e => {
  const b = e.target.closest("[data-evmax],[data-evcalc],[data-evgarage],[data-evfind]"); if (!b) return;
  if (b.dataset.evmax != null && b.dataset.evmax !== undefined && b.hasAttribute("data-evmax")) { S.evMax = +b.dataset.evmax; renderEV(); }
  else if (b.dataset.evcalc) {
    const o = TH.offers.find(x => x.key === b.dataset.evcalc), m = modelById[o.modelId];
    setPayVehicle({ type: "trim", modelId: m.id, trimIdx: Math.max(0, matchTrim(m, o.trim)) });
    Object.keys(S.pay.on).forEach(k => { const y = TH.offers.find(z => z.key === k); if (y && y.type === "lease") delete S.pay.on[k]; });
    S.pay.on[o.key] = true; S.pay.leaseMonths = o.months || 36; S.pay.leaseMiles = o.milesPerYear || 10000;
    save(); go("payments");
  }
  else if (b.dataset.evgarage) { S.gCats = [...new Set([...S.gCats, "ev"])]; setModel(b.dataset.evgarage); go("garage"); }
  else if (b.dataset.evfind) { S.mapTrims = null; S.ex.models = [b.dataset.evfind]; S.ex.cats = Object.keys(CATS); S.exDealer = null; save(); go("explore"); }
});
$("#v-ev").addEventListener("change", e => {
  if (e.target.id === "evSort") S.evSort = e.target.value;
  else if (e.target.id === "evRate") S.evRate = Math.max(0, +e.target.value || 0);
  else if (e.target.id === "evCredit") S.evCredit = e.target.checked;
  else return;
  save(); renderEV();
});

/* ---------- boot ---------- */
$("#radius").value = String(S.radius);
$("#radius").addEventListener("change", e => { S.radius = +e.target.value; save(); route(); });
const asOf = TH.inventoryAsOf || TH.asOf;
$("#asof").textContent = asOf ? `Lots as of ${asOf}` : "";
updateShortlist();
addEventListener("hashchange", route);
route();
})();
