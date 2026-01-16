// ==UserScript==
// @name         Google Sheet → Append Amazon Order (C/D/J)
// @namespace    dave-amazon-sheets
// @version      0.7
// @description  Reads Amazon JSON from clipboard and appends Order ID (C), Name (D), Units (J) via Apps Script Web App
// @match        https://docs.google.com/spreadsheets/*
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  const WEB_APP_URL = "Web App URL here"; // TODO: replace with your deployed Apps Script Web App URL

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function readAmazonJsonBestEffort() {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt || !txt.trim()) throw new Error("Clipboard is empty");
      return JSON.parse(txt);
    } catch (e) {
      const manual = prompt(
        "Clipboard read blocked.\n\nPaste Amazon JSON here:",
        ""
      );
      if (!manual || !manual.trim()) throw new Error("No JSON provided.");
      const parsed = JSON.parse(manual);
      if (!parsed) throw new Error("Invalid JSON pasted");
      return parsed;
    }
  }

  function gmPostJson(url, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url,
        data: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        // Important: allow redirects (Tampermonkey will follow, but requires @connect on redirect domains)
        onload: (resp) => {
          const text = resp.responseText || "";
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          resolve({ status: resp.status, text, json });
        },
        onerror: (err) => reject(err),
      });
    });
  }

  function showNotification(message, duration = 2000) {
    const notif = document.createElement("div");
    notif.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 999999;
      background: #34a853; color: white; padding: 12px 16px;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.2);
      font-size: 14px; font-family: Arial, sans-serif;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), duration);
  }

  function addButton() {
    if (document.getElementById("daveAppendAmazonBtn")) return;

    const btn = document.createElement("button");
    btn.id = "daveAppendAmazonBtn";
    btn.textContent = "Append Amazon → Sheet (C/D/J)";
    btn.style.cssText = `
      position: fixed; top: 120px; right: 18px; z-index: 99999;
      padding: 10px 12px; background: #1a73e8; color: white;
      border: none; border-radius: 8px; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,.2);
      font-size: 14px;
    `;

    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        btn.textContent = "Appending...";

        let data;
        try {
          data = await readAmazonJsonBestEffort();
        } catch (clipErr) {
          alert("Failed to read Amazon JSON:\n" + clipErr.message);
          return;
        }

        if (!data || data.source !== "amazon") {
          alert(
            'Clipboard does not look like Amazon JSON.\nGo to Amazon order page and click "Copy for LaCore" first.'
          );
          return;
        }

        const payload = {
          source: "amazon",
          orderId: data.orderId || "",
          shipToName: data.shipToName || "",
          quantity: Number(data.quantity || 1) || 1,
        };

        const res = await gmPostJson(WEB_APP_URL, payload);

        console.log("WebApp status:", res.status);
        console.log("WebApp response text:", res.text);
        console.log("WebApp response JSON:", res.json);

        if (res.status !== 200) {
          alert(
            `Append failed.\nHTTP ${res.status}\n${res.text.slice(0, 200)}`
          );
          return;
        }

        if (res.json && res.json.ok) {
          const rowNum = res.json.row;
          console.log("Row number received:", rowNum);
          showNotification(`Appended  - Row: ${rowNum ?? "(unknown)"}`);
        } else {
          showNotification(
            "Appended  (non-JSON response). Check console if needed."
          );
        }
      } catch (e) {
        console.error(e);
        alert("Append failed: " + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.textContent = "Append Amazon → Sheet (C/D/J)";
      }
    });

    document.body.appendChild(btn);
  }

  (async () => {
    await sleep(1200);
    addButton();
  })();
})();
