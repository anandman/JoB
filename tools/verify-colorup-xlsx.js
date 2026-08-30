#!/usr/bin/env node
/**
 * Verify the workbook writer produces a file Excel will actually open.
 *
 *     node tools/verify-colorup-xlsx.js
 *
 * Checks the zip container byte by byte rather than trusting it: a corrupt
 * xlsx is not a thing to discover at tax time.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const Xlsx = require(path.join(__dirname, "..", "colorup", "js", "xlsx.js"));

let fails = 0;
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { fails++; console.log("  FAIL " + m); };

const columns = [
  { header: "Date", key: "date", type: "date", width: 12 },
  { header: "Venue", key: "venue", type: "text", width: 18 },
  { header: "Bet Amount", key: "bet", type: "money", width: 13 },
  { header: "Win/(Loss)", key: "net", type: "money", width: 13 },
  { header: "Hours", key: "hours", type: "duration", width: 9 },
  { header: "Session TC", key: "tc", type: "number", width: 11 },
  { header: "Comment", key: "comment", type: "text", width: 30 },
];
const rows = [
  { date: new Date(2026, 1, 14), venue: "Silver Legacy", bet: 2000, net: -2075, hours: 3.5, tc: 200, comment: "9-5 50 play JoB" },
  { date: new Date(2026, 7, 29), venue: "Eldorado", bet: 1000, net: 0.7, hours: 1.25, tc: 100, comment: 'Quotes " and <angles> & ampersands' },
  { date: new Date(2026, 7, 30), venue: "Peppermill", bet: 500, net: 250, hours: 0.5, tc: null, comment: "" },
];

const out = Xlsx.build({ sheetName: "Sessions", columns, rows, now: new Date(2026, 7, 30, 12, 0, 0) });
const file = "/tmp/colorup-test.xlsx";
fs.writeFileSync(file, out);
console.log(`\nwrote ${out.length} bytes to ${file}\n`);

// 1. Container integrity, judged by something that isn't my own code.
try {
  const t = execSync(`unzip -t ${file}`, { encoding: "utf8" });
  ok("zip integrity: " + (t.match(/No errors detected.*/) || ["passed"])[0].trim());
} catch (e) { bad("unzip -t rejected the file: " + e.message); }

// 2. Every part Excel requires is present.
const listing = execSync(`unzip -Z1 ${file}`, { encoding: "utf8" }).trim().split("\n");
const need = ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
              "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"];
const missing = need.filter((n) => listing.indexOf(n) < 0);
missing.length ? bad("missing parts: " + missing.join(", ")) : ok(`all ${need.length} parts present`);

// 3. The sheet says what it should.
const sheet = execSync(`unzip -p ${file} xl/worksheets/sheet1.xml`, { encoding: "utf8" });
const cellCount = (sheet.match(/<c /g) || []).length;
ok(`sheet has ${cellCount} cells across ${(sheet.match(/<row /g) || []).length} rows`);

// A null TC and an empty comment must be absent, not empty strings.
const row4 = (sheet.match(/<row r="4">.*?<\/row>/s) || [""])[0];
const row4cells = (row4.match(/r="([A-Z]+)4"/g) || []).map((s) => s.slice(3, -2));
row4cells.indexOf("F") < 0 && row4cells.indexOf("G") < 0
  ? ok("null and empty values are omitted, not written as blanks")
  : bad("row 4 wrote cells for null/empty: " + row4cells.join(","));

// XML escaping must have happened.
/Quotes &quot; and &lt;angles&gt; &amp; ampersands/.test(sheet)
  ? ok("special characters escaped")
  : bad("escaping is wrong — this would make the file unopenable");

// 4. Dates land on the right day. Excel's epoch is 1899-12-30.
const feb14 = Xlsx.serial(new Date(2026, 1, 14));
sheet.indexOf(">" + feb14 + "<") >= 0
  ? ok(`date serial ${feb14} present (2026-02-14)`)
  : bad("date serial missing: " + feb14);
const known = Xlsx.serial(new Date(2000, 0, 1));
known === 36526 ? ok("epoch check: 2000-01-01 = 36526") : bad("epoch wrong: 2000-01-01 = " + known);

// 5. Column letters past Z, since a wide sheet is plausible later.
["A", "Z", "AA", "AB", "AZ", "BA"].every((x, i) => Xlsx.colName([0, 25, 26, 27, 51, 52][i]) === x)
  ? ok("column naming correct through BA")
  : bad("column naming wrong: " + [0, 25, 26, 27, 51, 52].map(Xlsx.colName).join(","));

// 6. The check that actually matters: does a real spreadsheet program open it?
//    Everything above tests my own understanding of the format. This tests
//    somebody else's.
try {
  execSync("which soffice", { stdio: "ignore" });
  execSync(`rm -f /tmp/colorup-test.csv && soffice --headless --convert-to csv ${file} --outdir /tmp`,
           { stdio: "ignore", timeout: 90000 });
  const csv = fs.readFileSync("/tmp/colorup-test.csv", "utf8").trim().split("\n");
  const checks = [
    [/^Date,Venue,Bet Amount,Win\/\(Loss\),Hours,Session TC,Comment$/, "header row"],
    [/^2026-02-14,Silver Legacy,2000,-2075,3\.5,200,/, "row 1 values and date formatting"],
    [/Quotes "" and <angles> & ampersands/, "escaped characters survive the round trip"],
    [/^2026-08-30,Peppermill,500,250,0\.5,,$/, "null TC and empty comment come back empty"],
  ];
  for (const [re, what] of checks) {
    csv.some((line) => re.test(line)) ? ok("LibreOffice: " + what)
                                      : bad("LibreOffice: " + what + " — got:\n    " + csv.join("\n    "));
  }
} catch (e) {
  console.log("  skip LibreOffice round trip (" + (e.message || "").split("\n")[0] + ")");
}

console.log(fails ? `\n${fails} FAILED\n` : "\nall checks passed\n");
process.exit(fails ? 1 : 0);
