// server.js — tracker minimal → envoie IP + URL à Make
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm i node-fetch@2

const app = express();

// Middlewares
app.use(cors({ origin: true }));
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Webhook Make
const MAKE_WEBHOOK = "https://hook.eu2.make.com/81dm95qt94xxuqail07pir4iiofrmi3b";

// Helper : récupérer l'IP du client
function getClientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = fwd || req.socket.remoteAddress || "";
  return ip.replace("::ffff:", "");
}

// Route pour recevoir les pageviews
app.post("/track", async (req, res) => {
  try {
    const ip = getClientIp(req) || null;
    const siteId = req.body?.site_id || "unknown-site";
    const url = req.body?.events?.[0]?.ctx?.url || req.body?.url || "";
    const t = Date.now();

    const payload = { ip, url, site_id: siteId, t };

    // Envoi au Webhook Make
    await fetch(MAKE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("→ envoyé à Make:", payload);
    res.json({ ok: true });
  } catch (err) {
    console.error("track error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Route pour servir le snippet côté client
app.get("/script.js", (req, res) => {
  const siteId = req.query.site || "default-site";
  res.type("application/javascript").send(`
  (function () {
    var ORIGIN = new URL(document.currentScript.src).origin;
    var ENDPOINT = ORIGIN + "/track";
    var SITE_ID = (new URL(document.currentScript.src)).searchParams.get("site") || "${siteId}";
    function uid(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
    function sendPageview(){
      try{
        fetch(ENDPOINT, {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({
            site_id: SITE_ID,
            events: [{
              id: uid(), t: Date.now(), type: "pageview",
              ctx: { url: location.href, path: location.pathname, ua: navigator.userAgent }
            }]
          })
        }).catch(()=>{});
      }catch(e){}
    }
    if (document.readyState === "complete") sendPageview();
    else addEventListener("load", sendPageview);
  })();
  `);
});

// Test route
app.get("/", (req, res) => res.send("Lead tracker up"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log("Tracker listening on", PORT));
