// server.js — Tracker MVP prêt à push sur Railway (Make debug inclus)
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm i node-fetch@2

const app = express();

// ------------------- CONFIG -------------------
app.use(cors({ origin: true }));
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Webhook Make (à configurer dans Railway)
const MAKE_WEBHOOK = process.env.MAKE_WEBHOOK || "https://hook.eu2.make.com/81dm95qt94xxuqail07pir4iiofrmi3b";

// ------------------- STOCKAGE EN MÉMOIRE -------------------
const visits = []; // { site_id, domain, path, ts, ua, ip, ref }

// ------------------- HELPERS -------------------
function extractDomain(urlOrHost) {
  if (!urlOrHost) return null;
  try {
    return new URL(urlOrHost).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return urlOrHost.replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

// ------------------- TRACKING -------------------
app.post("/track", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.site_id || !Array.isArray(payload.events)) {
      return res.status(400).json({ ok: false, error: "Invalid payload (site_id + events required)" });
    }

    const xf = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = xf || req.ip || req.connection.remoteAddress || null;
    const now = Date.now();

    // normaliser et stocker
    for (const ev of payload.events) {
      const url = (ev && ev.ctx && ev.ctx.url) || null;
      const domain = extractDomain(url || payload.domain || payload.site_domain || req.get("Host"));
      const path = (ev && ev.ctx && ev.ctx.path) || "/";
      const ua = (ev && ev.ctx && ev.ctx.ua) || req.get("User-Agent") || "";
      const ts = ev && ev.t ? ev.t : now;
      const ref = (ev && ev.ctx && ev.ctx.ref) || req.get("Referer") || "";

      visits.push({ site_id: payload.site_id, domain, path, ts, ua, ip, ref });
      if (visits.length > 50000) visits.shift();
    }

    // Forward vers Make et attendre la réponse
    try {
      console.log("📩 Forward vers Make:", JSON.stringify(payload));
      const response = await fetch(MAKE_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log("✅ Forward Make OK, status:", response.status);
    } catch (e) {
      console.error("❌ Erreur forward Make:", e.message);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("track error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ------------------- ADMIN ENDPOINTS -------------------
app.get("/admin/summary", (req, res) => {
  const bySite = {};
  for (const v of visits) {
    const key = v.site_id || v.domain || "unknown";
    if (!bySite[key]) bySite[key] = { visits: 0, pages: {} };
    bySite[key].visits++;
    bySite[key].pages[v.path] = (bySite[key].pages[v.path] || 0) + 1;
  }
  res.json(bySite);
});

app.get("/admin/export/:site", (req, res) => {
  const site = req.params.site;
  const rows = visits
    .filter(v => v.site_id === site || v.domain === site)
    .map(v => `${new Date(v.ts).toISOString()},${v.site_id},${v.domain},${v.path},"${(v.ua||"").replace(/"/g,'""')}",${v.ip || ""},${(v.ref||"")}`);
  const csv = 'timestamp,site_id,domain,path,user_agent,ip,referrer\n' + rows.join('\n');
  res.setHeader('Content-disposition', `attachment; filename=${site.replace(/[^a-z0-9]/gi,'_')}-visits.csv`);
  res.set('Content-Type', 'text/csv');
  res.send(csv);
});

// ------------------- SNIPPET CLIENT -------------------
app.get("/script.js", (req, res) => {
  const siteId = req.query.site || "default-site";
  res.type("application/javascript").send(`
(function () {
  var ORIGIN = new URL(document.currentScript.src).origin;
  var ENDPOINT = ORIGIN + "/track";
  var SITE_ID = (new URL(document.currentScript.src)).searchParams.get("site") || "${siteId}";

  function uid(){return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}

  function sendPageview(){
    try{
      var payload = {
        site_id: SITE_ID,
        events:[{ id: uid(), t: Date.now(), type:"pageview", ctx:{
          url: location.href,
          path: location.pathname,
          ua: navigator.userAgent,
          ref: document.referrer || ""
        }}]
      };
      console.log("🌐 Envoi pageview :", payload);
      if(navigator.sendBeacon){
        navigator.sendBeacon(ENDPOINT, JSON.stringify(payload));
      } else {
        fetch(ENDPOINT,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(payload),
          keepalive:true
        }).catch(console.error);
      }
    } catch(e){ console.error("Tracker error:", e); }
  }

  if(document.readyState==="complete") sendPageview();
  else addEventListener("load", sendPageview);
})();
  `);
});

// Health check
app.get("/", (req, res) => res.send("✅ Tracker MVP ready — debug Make"));

// ------------------- START SERVER -------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log("✅ Tracker listening on port", PORT));
