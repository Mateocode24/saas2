// server.js — version stable (tracking vers Make + Google Sheets)
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

// ------------------- TON WEBHOOK MAKE -------------------
const MAKE_WEBHOOK = "https://hook.eu2.make.com/81dm95qt94xxuqail07pir4iiofrmi3b"; // ton lien Make relié à Google Sheets

// ------------------- TRACKING -------------------
app.post("/track", async (req, res) => {
  try {
    const payload = req.body || {};

    // Envoi direct au scénario Make
    await fetch(MAKE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("→ Données envoyées à Make:", payload);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erreur track:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ------------------- SNIPPET CLIENT -------------------
app.get("/script.js", (req, res) => {
  const siteId = req.query.site || "default-site";
  res.type("application/javascript").send(`
(function () {
  var ORIGIN = new URL(document.currentScript.src).origin;
  var ENDPOINT = ORIGIN + "/track";
  var SITE_ID = (new URL(document.currentScript.src)).searchParams.get("site") || "${siteId}";
  
  function uid(){
    return ([1e7]+-1e3+-4e3+-8e3+-1e11)
      .replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
  }

  function sendPageview(){
    try{
      fetch("https://api.ipify.org?format=json")
        .then(r => r.json())
        .then(data => {
          fetch(ENDPOINT, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
              site_id: SITE_ID,
              visitor_ip: data.ip,
              events: [{
                id: uid(),
                t: Date.now(),
                type: "pageview",
                ctx: {
                  url: location.href,
                  path: location.pathname,
                  ua: navigator.userAgent
                }
              }]
            })
          }).catch(()=>{});
          console.log("Pageview envoyée à /track avec IP:", data.ip);
        });
    }catch(e){}
  }

  if (document.readyState === "complete") sendPageview();
  else addEventListener("load", sendPageview);
})();
  `);
});

// ------------------- TEST -------------------
app.get("/", (req, res) => res.send("✅ Tracker up & running vers Make + Sheets"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log("🚀 Tracker listening on port", PORT));
