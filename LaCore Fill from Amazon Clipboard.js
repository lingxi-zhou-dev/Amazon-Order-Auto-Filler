// ==UserScript==
// @name         LaCore → Fill from Amazon Clipboard
// @namespace    David-amazon-lacore
// @version      0.2
// @description  Reads JSON from clipboard and fills LaCore create order form
// @match        https://lacoreconnect.com/customer-orders/create*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  // Dispatch events so Vue/validation sees the changes
  function setInputValue(input, value) {
    if (!input) return false;
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setSelectByText(selectEl, text) {
    if (!selectEl) return false;
    const options = Array.from(selectEl.options);
    const opt = options.find((o) => clean(o.textContent) === clean(text));
    if (!opt) return false;
    selectEl.value = opt.value;
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // NEW: set a <select> by value (e.g., US, UT)
  function setSelectByValue(selectEl, value) {
    if (!selectEl) return false;
    const v = clean(value);
    const options = Array.from(selectEl.options);
    const opt = options.find((o) => clean(o.value) === v);
    if (!opt) return false;
    selectEl.value = opt.value;
    selectEl.dispatchEvent(new Event("input", { bubbles: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function readClipboardJson() {
    const txt = await navigator.clipboard.readText();
    return JSON.parse(txt);
  }

  async function addButton() {
    const existing = document.getElementById("DavidFillFromAmazonBtn");
    if (existing) return;

    const btn = document.createElement("button");
    btn.id = "DavidFillFromAmazonBtn";
    btn.textContent = "Fill from Amazon";
    btn.style.cssText = `
      position: fixed; top: 120px; right: 18px; z-index: 99999;
      padding: 10px 12px; background: #6f42c1; color: white;
      border: none; border-radius: 8px; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,.2);
      font-size: 14px;
    `;

    btn.addEventListener("click", async () => {
      try {
        const data = await readClipboardJson();

        if (!data || data.source !== "amazon") {
          alert(
            'Clipboard does not look like Amazon payload.\nGo to Amazon order page and click "Copy for LaCore" first.'
          );
          return;
        }

        // ---- Reliable v-select picker (scoped) ----
        async function pickVSelectInFieldset(legendStartsWith, wantedText) {
          const legend = Array.from(document.querySelectorAll("legend")).find(
            (l) =>
              clean(l.textContent)
                .toLowerCase()
                .startsWith(clean(legendStartsWith).toLowerCase())
          );
          if (!legend)
            return { ok: false, why: `Legend not found: ${legendStartsWith}` };

          const fs = legend.closest("fieldset");
          if (!fs)
            return {
              ok: false,
              why: `Fieldset not found for: ${legendStartsWith}`,
            };

          const vSelect = fs.querySelector(".v-select");
          if (!vSelect)
            return {
              ok: false,
              why: `v-select not found for: ${legendStartsWith}`,
            };

          const toggle = vSelect.querySelector("button.v-select-toggle");
          if (!toggle)
            return {
              ok: false,
              why: `toggle not found for: ${legendStartsWith}`,
            };

          // open dropdown
          toggle.click();
          await sleep(150);

          // IMPORTANT: scope dropdown to THIS v-select (prevents grabbing wrong dropdown)
          let dropdown = vSelect.querySelector(".v-dropdown-container");

          for (
            let i = 0;
            i < 8 && (!dropdown || dropdown.style.display === "none");
            i++
          ) {
            await sleep(150);
            dropdown = vSelect.querySelector(".v-dropdown-container");
          }

          if (!dropdown)
            return {
              ok: false,
              why: `dropdown container not found for: ${legendStartsWith}`,
            };

          const needle = clean(wantedText).toLowerCase();
          const items = Array.from(
            dropdown.querySelectorAll("li.v-dropdown-item")
          ).filter((li) => clean(li.textContent));

          const match =
            items.find(
              (li) => clean(li.textContent).toLowerCase() === needle
            ) ||
            items.find((li) =>
              clean(li.textContent).toLowerCase().includes(needle)
            );

          if (!match) {
            const sample = items
              .slice(0, 12)
              .map((li) => clean(li.textContent))
              .join(" | ");
            return {
              ok: false,
              why: `No match for "${wantedText}" in ${legendStartsWith}. Sample: ${sample}`,
            };
          }

          match.click();
          await sleep(200);
          return { ok: true };
        }

        // --- Storefront Order Form ---
        // Storefront FIRST (needed so Order Group options appear)
        let res = await pickVSelectInFieldset("Storefront", "David");
        if (!res.ok) {
          // fallback to old hidden-select method if needed
          const storefrontSelect = document.querySelector(
            'select[name="form-input-projectId"]'
          );
          setSelectByText(storefrontSelect, "David");
        }

        // Give Vue time to populate Order Group options after storefront
        await sleep(500);

        // Order Group
        res = await pickVSelectInFieldset("Order Group", "Manual Orders");
        if (!res.ok) {
          // fallback to old hidden-select method if needed
          const orderGroupSelect = document.querySelector(
            'select[name="form-input-storeId"]'
          );
          for (let i = 0; i < 6; i++) {
            if (setSelectByText(orderGroupSelect, "Manual Orders")) break;
            await sleep(250);
          }
        }

        // Order Number: name="form-input-orderNumber"
        const orderNumberInput = document.querySelector(
          'input[name="form-input-orderNumber"]'
        );
        setInputValue(orderNumberInput, data.orderId || "");

        // Customer Email: keep blank
        const customerEmailInput = document.querySelector(
          'input[name="form-input-customerEmail"]'
        );
        if (customerEmailInput) setInputValue(customerEmailInput, "");

        // --- Ship To Address ---
        // Ship to name is an autocomplete input (type=search) but no stable name attribute in your snippet.
        // We’ll target by placeholder/aria-label first, then fallback to the first "Ship To Name" search input.
        let shipNameInput =
          document.querySelector('input[type="search"][placeholder]') ||
          document.querySelector('input[type="search"][aria-label]');

        // safer: find "Ship To Name" fieldset and then its input[type=search]
        const shipToLegend = Array.from(
          document.querySelectorAll("legend")
        ).find((l) =>
          clean(l.textContent).toLowerCase().includes("ship to name")
        );
        if (shipToLegend) {
          const fs = shipToLegend.closest("fieldset");
          const inp = fs && fs.querySelector('input[type="search"], input');
          if (inp) shipNameInput = inp;
        }

        setInputValue(shipNameInput, data.shipToName || "");

        // Address 1 / City / Postcode have good name attributes:
        setInputValue(
          document.querySelector(
            'input[name="form-input-shipmentAddress-addressLine1"]'
          ),
          data.address1 || ""
        );
        setInputValue(
          document.querySelector(
            'input[name="form-input-shipmentAddress-city"]'
          ),
          data.city || ""
        );
        setInputValue(
          document.querySelector(
            'input[name="form-input-shipmentAddress-postcode"]'
          ),
          data.postcode || ""
        );

        // Country: force US by VALUE (more reliable than text)
        const countrySelect = document.querySelector(
          'select[name="form-input-shipmentAddress-countryCode"]'
        );
        setSelectByValue(countrySelect, "US");

        // State: LaCore uses a custom v-select here (sometimes no <select> exists in the fieldset).
        // We'll click the State dropdown and click the matching item (Utah) like a human.

        const STATE_ABBR_TO_NAME = {
          AL: "Alabama",
          AK: "Alaska",
          AZ: "Arizona",
          AR: "Arkansas",
          CA: "California",
          CO: "Colorado",
          CT: "Connecticut",
          DE: "Delaware",
          DC: "District Of Columbia",
          FL: "Florida",
          GA: "Georgia",
          HI: "Hawaii",
          ID: "Idaho",
          IL: "Illinois",
          IN: "Indiana",
          IA: "Iowa",
          KS: "Kansas",
          KY: "Kentucky",
          LA: "Louisiana",
          ME: "Maine",
          MD: "Maryland",
          MA: "Massachusetts",
          MI: "Michigan",
          MN: "Minnesota",
          MS: "Mississippi",
          MO: "Missouri",
          MT: "Montana",
          NE: "Nebraska",
          NV: "Nevada",
          NH: "New Hampshire",
          NJ: "New Jersey",
          NM: "New Mexico",
          NY: "New York",
          NC: "North Carolina",
          ND: "North Dakota",
          OH: "Ohio",
          OK: "Oklahoma",
          OR: "Oregon",
          PA: "Pennsylvania",
          RI: "Rhode Island",
          SC: "South Carolina",
          SD: "South Dakota",
          TN: "Tennessee",
          TX: "Texas",
          UT: "Utah",
          VT: "Vermont",
          VA: "Virginia",
          WA: "Washington",
          WV: "West Virginia",
          WI: "Wisconsin",
          WY: "Wyoming",
          PR: "Puerto Rico",
        };

        async function setStateViaDropdown(fullStateName) {
          const legends = Array.from(document.querySelectorAll("legend"));
          const stateLegend = legends.find((l) =>
            clean(l.textContent).toLowerCase().startsWith("state")
          );
          if (!stateLegend) return { ok: false, why: "State legend not found" };

          const fieldset =
            stateLegend.closest("fieldset") || stateLegend.parentElement;
          if (!fieldset) return { ok: false, why: "State fieldset not found" };

          // Find the v-select toggle button inside the State field
          const toggleBtn =
            fieldset.querySelector("button.v-select-toggle") ||
            fieldset.querySelector("button");

          if (!toggleBtn)
            return { ok: false, why: "State dropdown toggle button not found" };

          // Click to open dropdown
          toggleBtn.click();
          await sleep(150);

          // The dropdown container may be inside the fieldset OR elsewhere in DOM; try both.
          let dropdown =
            fieldset.querySelector(".v-dropdown-container") ||
            vSelect.querySelector(".v-dropdown-container");

          // If still not visible, click again and wait
          for (
            let i = 0;
            i < 6 && (!dropdown || dropdown.style.display === "none");
            i++
          ) {
            toggleBtn.click();
            await sleep(150);
            dropdown =
              fieldset.querySelector(".v-dropdown-container") ||
              vSelect.querySelector(".v-dropdown-container");
          }

          if (!dropdown)
            return { ok: false, why: "State dropdown container not found" };

          // Find matching option item by text
          const needle = fullStateName.toLowerCase();
          const items = Array.from(
            dropdown.querySelectorAll("li.v-dropdown-item")
          ).filter((li) => clean(li.textContent));

          const match =
            items.find(
              (li) => clean(li.textContent).toLowerCase() === needle
            ) ||
            items.find((li) =>
              clean(li.textContent).toLowerCase().includes(needle)
            );

          if (!match) {
            const sample = items
              .slice(0, 12)
              .map((li) => clean(li.textContent))
              .join(" | ");
            return {
              ok: false,
              why: `No match for "${fullStateName}". Sample: ${sample}`,
            };
          }

          match.click();
          await sleep(100);
          return { ok: true };
        }

        if (data.state) {
          const abbr = clean(data.state).toUpperCase();
          const full = STATE_ABBR_TO_NAME[abbr] || abbr;

          const res = await setStateViaDropdown(full);
          if (!res.ok) {
            alert("STATE: " + res.why);
          }
        }

        // Phone Number field in your snippet has id __BVID__3970 but no name attribute.
        // We'll locate by legend text "Phone Number"
        const phoneLegend = Array.from(
          document.querySelectorAll("legend")
        ).find((l) => clean(l.textContent).toLowerCase() === "phone number");
        if (phoneLegend) {
          const fs = phoneLegend.closest("fieldset");
          const phoneInput = fs && fs.querySelector("input");
          setInputValue(phoneInput, data.phone || "");
        }

        // --- Requested Shipping Method ---
        await sleep(600); // allow LaCore to finish re-rendering shipping section

        if (
          data.shipping &&
          clean(data.shipping).toLowerCase() !== "free economy"
        ) {
          const shippingSelect = Array.from(
            document.querySelectorAll("select")
          ).find((sel) =>
            Array.from(sel.options).some((o) =>
              o.textContent.includes("Priority Mail Shipping - USPS")
            )
          );

          if (shippingSelect) {
            const opt = Array.from(shippingSelect.options).find((o) =>
              o.textContent.includes("Priority Mail Shipping - USPS")
            );
            if (opt) {
              shippingSelect.value = opt.value;
              shippingSelect.dispatchEvent(
                new Event("input", { bubbles: true })
              );
              shippingSelect.dispatchEvent(
                new Event("change", { bubbles: true })
              );
            }
          }
        }

        // --- Order Items ---
        // Quantity input has name="form-iteminput-quantity"
        const qtyInput = document.querySelector(
          'input[name="form-iteminput-quantity"]'
        );
        setInputValue(qtyInput, String(data.quantity || 1));

        // Pick Product select has name="form-iteminput-productId"
        // Choose the first option that includes "Product" (or your itemSearch string).
        const productSelect = document.querySelector(
          'select[name="form-iteminput-productId"]'
        );
        if (productSelect) {
          const needle = (data.itemSearch || "Product").toLowerCase();
          const opt = Array.from(productSelect.options).find((o) =>
            o.textContent.toLowerCase().includes(needle)
          );
          if (opt) {
            productSelect.value = opt.value;
            productSelect.dispatchEvent(new Event("input", { bubbles: true }));
            productSelect.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            console.warn("No product option matched", needle);
          }
        }

        // Click Add button (in the Order Items footer)
        const addBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => clean(b.textContent).toLowerCase() === "add"
        );
        if (addBtn) addBtn.click();

        alert('Filled LaCore ✅\nReview quickly, then click "Save Changes".');
      } catch (e) {
        console.error(e);
        alert(
          "Fill failed. Most common causes:\n- Clipboard blocked (try clicking page once, then retry)\n- Clipboard JSON not valid\nCheck console for details."
        );
      }
    });

    document.body.appendChild(btn);
  }

  (async () => {
    await sleep(1200);
    addButton();
  })();
})();
