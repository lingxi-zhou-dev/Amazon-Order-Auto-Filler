// ==UserScript==
// @name         Amazon → Copy Order for LaCore
// @namespace    boz-amazon-lacore
// @version      1.1
// @description  Copy Amazon order info to clipboard for LaCore
// @match        https://sellercentral.amazon.com/orders-v3/order/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const BTN_ID = "bozCopyForLacoreBtn";

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  function parseCityStateZip(line) {
    // Example inputs:
    // "SPRINGFIELD, IL 62701-1234" (format 1: city, state abbrev, zip)
    // "PITTSBORO, NORTH CAROLINA 27312-8438" (format 2: city, full state name, zip)
    const t = clean(line);

    // Try format 1: "City, XX 12345" (state abbreviation)
    let m = t.match(/^(.+?),\s*([A-Z]{2})\s+(.+)$/);
    if (m)
      return { city: clean(m[1]), state: clean(m[2]), postcode: clean(m[3]) };

    // Try format 2: "City, STATE NAME 12345" (full state name)
    // Assume state is everything between comma and the zip code (last token)
    m = t.match(/^(.+?),\s*(.+?)\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      const state = clean(m[2]);
      // Convert full state name to abbreviation if needed
      const stateAbbr = fullStateToAbbr(state);
      return { city: clean(m[1]), state: stateAbbr, postcode: clean(m[3]) };
    }

    return { city: "", state: "", postcode: "" };
  }

  function fullStateToAbbr(stateName) {
    // Normalize the input first (handle "Wa" -> "WA", "wa" -> "WA")
    const normalized = stateName.toUpperCase().trim();

    // Map of full state names to abbreviations
    const stateMap = {
      ALABAMA: "AL",
      ALASKA: "AK",
      ARIZONA: "AZ",
      ARKANSAS: "AR",
      CALIFORNIA: "CA",
      COLORADO: "CO",
      CONNECTICUT: "CT",
      DELAWARE: "DE",
      FLORIDA: "FL",
      GEORGIA: "GA",
      HAWAII: "HI",
      IDAHO: "ID",
      ILLINOIS: "IL",
      INDIANA: "IN",
      IOWA: "IA",
      KANSAS: "KS",
      KENTUCKY: "KY",
      LOUISIANA: "LA",
      MAINE: "ME",
      MARYLAND: "MD",
      MASSACHUSETTS: "MA",
      MICHIGAN: "MI",
      MINNESOTA: "MN",
      MISSISSIPPI: "MS",
      MISSOURI: "MO",
      MONTANA: "MT",
      NEBRASKA: "NE",
      NEVADA: "NV",
      "NEW HAMPSHIRE": "NH",
      "NEW JERSEY": "NJ",
      "NEW MEXICO": "NM",
      "NEW YORK": "NY",
      "NORTH CAROLINA": "NC",
      "NORTH DAKOTA": "ND",
      OHIO: "OH",
      OKLAHOMA: "OK",
      OREGON: "OR",
      PENNSYLVANIA: "PA",
      "RHODE ISLAND": "RI",
      "SOUTH CAROLINA": "SC",
      "SOUTH DAKOTA": "SD",
      TENNESSEE: "TN",
      TEXAS: "TX",
      UTAH: "UT",
      VERMONT: "VT",
      VIRGINIA: "VA",
      WASHINGTON: "WA",
      "WEST VIRGINIA": "WV",
      WISCONSIN: "WI",
      WYOMING: "WY",
    };

    // If it's already in the map, return it
    if (stateMap[normalized]) return stateMap[normalized];

    // If it's already a 2-letter abbreviation (like "Wa", "WA"), normalize and return
    if (normalized.length === 2 && /^[A-Z]{2}$/.test(normalized)) {
      return normalized;
    }

    // Otherwise return as-is
    return normalized;
  }

  function stripExt(phoneLine) {
    // Example: "+1 555-123-4567 ext." -> "+1 555-123-4567"
    let t = clean(phoneLine);
    t = t.replace(/^Phone:\s*/i, "");
    const idx = t.toLowerCase().indexOf("ext");
    if (idx >= 0) t = t.slice(0, idx);
    return clean(t);
  }

  function findShipToPanel() {
    // Find an element whose visible text is exactly "Ship to", then climb to a reasonable container
    const all = Array.from(
      document.querySelectorAll("div, span, h1, h2, h3, h4, h5, h6")
    );
    const shipToLabel = all.find((el) => clean(el.textContent) === "Ship to");
    if (!shipToLabel) return null;

    // Amazon layouts vary; go up a few levels to capture the whole box
    let node = shipToLabel;
    for (let i = 0; i < 6; i++) {
      if (!node.parentElement) break;
      node = node.parentElement;
      // Stop when the box looks “big enough”
      if (
        (node.innerText || "").includes("Address Type") ||
        (node.innerText || "").includes("Contact Buyer")
      ) {
        return node;
      }
    }
    return node;
  }

  function extractShippingService() {
    // Looks for "Shipping service:" label and reads the value next to it
    const labels = Array.from(document.querySelectorAll("span, div"));
    const label = labels.find(
      (el) => clean(el.textContent).toLowerCase() === "shipping service:"
    );
    if (!label) return "";

    // Amazon usually puts the value in the next sibling
    const val = label.nextElementSibling;
    return val ? clean(val.textContent) : "";
  }

  function extractFromShipToPanel(panel) {
    // Try the newer, more reliable method first: use the data-test-id
    const addressDiv = panel.querySelector(
      "div[data-test-id='shipping-section-buyer-address']"
    );
    if (addressDiv) {
      const lines = (addressDiv.innerText || "")
        .split("\n")
        .map(clean)
        .filter(Boolean);

      if (lines.length >= 2) {
        const name = lines[0] || "";
        const address1 = lines[1] || "";

        // Join all remaining lines together, since city/state/zip might be on separate lines
        // e.g., "Provo,", "Utah", "84604" should become "Provo, Utah 84604"
        const cityStateZipLine =
          lines.length > 2 ? lines.slice(2).join(" ") : "";

        const { city, state, postcode } = parseCityStateZip(cityStateZipLine);
        return { shipToName: name, address1, city, state, postcode, phone: "" };
      }
    }

    // Fallback to old method
    const lines = (panel.innerText || "")
      .split("\n")
      .map(clean)
      .filter(Boolean);

    const shipIdx = lines.findIndex((l) => l === "Ship to");
    const name = shipIdx >= 0 ? lines[shipIdx + 1] || "" : "";
    const address1 = shipIdx >= 0 ? lines[shipIdx + 2] || "" : "";

    // Join remaining lines as city/state/zip might be split across lines
    let cityStateZipLine = "";
    if (shipIdx >= 0 && shipIdx + 3 < lines.length) {
      cityStateZipLine = lines.slice(shipIdx + 3).join(" ");
    }

    const { city, state, postcode } = parseCityStateZip(cityStateZipLine);

    // Phone line:
    // Phone: +1 555-123-4567 ext.
    // 1234   (ext number often on next line)
    const phoneLine = lines.find((l) => /^Phone:/i.test(l)) || "";
    const phone = stripExt(phoneLine);

    return { shipToName: name, address1, city, state, postcode, phone };
  }

  function extractOrderId() {
    // URL already contains it in your pattern
    return location.pathname.split("/").pop();
  }

  function extractQuantityFallback() {
    // Parse the Order contents table to find Quantity column
    const table = document.querySelector("table.a-keyvalue");
    if (!table) return 1;

    // Find the quantity column by looking for the cell with data-test-id="item-quantity-heading"
    const quantityHeader = table.querySelector(
      "th[data-test-id='item-quantity-heading']"
    );
    if (!quantityHeader) return 1;

    // Count only VISIBLE headers (exclude hidden-table-cell) up to the quantity header
    // Hidden columns don't have corresponding <td> elements, so we need to count visible headers only
    const allHeaders = Array.from(table.querySelectorAll("th"));
    let visibleHeaderIdx = 0;
    for (let i = 0; i < allHeaders.length; i++) {
      if (allHeaders[i] === quantityHeader) break;
      // Only count visible headers (those without hidden-table-cell class)
      if (!allHeaders[i].classList.contains("hidden-table-cell")) {
        visibleHeaderIdx++;
      }
    }

    // Get the first data row (tbody > tr)
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (rows.length === 0) return 1;

    const cells = rows[0].querySelectorAll("td");
    if (visibleHeaderIdx >= cells.length) return 1;

    const quantityText = clean(cells[visibleHeaderIdx].textContent);
    const qty = parseInt(quantityText, 10);

    return isNaN(qty) ? 1 : qty;
  }

  function buildPayload() {
    const orderId = extractOrderId();

    const panel = findShipToPanel();
    let ship = {
      shipToName: "",
      address1: "",
      city: "",
      state: "",
      postcode: "",
      phone: "",
    };
    if (panel) ship = extractFromShipToPanel(panel);

    const shippingService = extractShippingService();

    return {
      source: "amazon",
      orderId,
      shipToName: ship.shipToName,
      address1: ship.address1,
      city: ship.city,
      state: ship.state,
      postcode: ship.postcode,
      country: "US",
      phone: ship.phone,
      itemSearch: "MCT",
      quantity: extractQuantityFallback(),
      shipping: shippingService || "Free Economy",
    };
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "📋 Copy for LaCore";
    btn.style.cssText = `
      position: fixed !important;
      top: 90px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      background: #1a73e8 !important;
      color: #fff !important;
      border: none !important;
      border-radius: 10px !important;
      padding:  адзнач
      10px 14px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      box-shadow: 0 4px 14px rgba(0,0,0,.25) !important;
    `;

    btn.onclick = () => {
      const payload = buildPayload();

      // Useful: fail loudly if Ship To isn’t found
      if (!payload.shipToName || !payload.address1) {
        alert(
          "Copied, but Ship To fields look empty.\n\n" +
            "This eliminates 90% of manual entry once fixed.\n" +
            "Next step: I’ll tune the selector for your exact Amazon layout.\n\n" +
            "For now, it still copied Order ID."
        );
      } else {
        alert(
          "Copied for LaCore ✅\n\nGo to LaCore → Create Order → Click “Fill from Amazon”"
        );
      }

      GM_setClipboard(JSON.stringify(payload, null, 2));
    };

    document.body.appendChild(btn);
  }

  // Keep it alive against Amazon rerenders
  ensureButton();
  setInterval(ensureButton, 1000);
})();
