function doPost(e) {
  try {
    const SHEET_ID = "Your Google Sheet ID here"; // TODO: replace with your Google Sheet ID
    const TAB_NAME = "tab name here"; // TODO: replace with your target tab name

    const body = e?.postData?.contents || "";
    const data = body ? JSON.parse(body) : {};

    const orderId = data.orderId || "";
    const name = data.shipToName || "";
    const qty = Number(data.quantity || 1) || 1;

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(TAB_NAME);
    if (!sh) throw new Error("Tab not found: " + TAB_NAME);

    // Start checking from row 2433 onwards
    const startRow = 2433;
    const maxRows = 500; // Check up to 500 rows from startRow
    const rangeC = sh.getRange(
      "C" + startRow + ":C" + (startRow + maxRows - 1)
    );
    const valuesC = rangeC.getValues();
    const rangeD = sh.getRange(
      "D" + startRow + ":D" + (startRow + maxRows - 1)
    );
    const valuesD = rangeD.getValues();

    let targetRow = sh.getLastRow() + 1;
    for (let i = 0; i < valuesC.length; i++) {
      const cellC = (valuesC[i][0] || "").toString().trim();
      const cellD = (valuesD[i][0] || "").toString().trim();
      if (!cellC && !cellD) {
        targetRow = startRow + i;
        break;
      }
    }

    // Fill only A, C, D, J in the target row
    const row = new Array(12).fill("");
    row[0] = '=HYPERLINK("hyperlink here","product here")'; // A
    row[2] = orderId; // C
    row[3] = name; // D
    row[9] = qty; // J

    sh.getRange(targetRow, 1, 1, 12).setValues([row]);

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, row: targetRow })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
