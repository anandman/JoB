/**
 * Color Up — write a real .xlsx in the browser, with no dependencies.
 *
 * An xlsx is a zip of XML parts, so this needs a zip writer and enough of the
 * SpreadsheetML schema to carry typed cells. Both are small. A library for this
 * would be a bigger surface than the code it replaces, and this file has to be
 * auditable because it writes the record behind a tax return.
 *
 * Entries are STORED, not deflated. The zip spec allows method 0 and Excel
 * opens it happily, which removes the only reason this would have needed
 * zlib or CompressionStream — so the same code runs in a browser and in node
 * without a shim. A few hundred sessions is well under a megabyte uncompressed.
 */

var Xlsx = (function () {
  "use strict";

  var enc = new TextEncoder();

  /* ===== bytes ===== */

  function Writer() { this.parts = []; this.length = 0; }
  Writer.prototype.bytes = function (u8) { this.parts.push(u8); this.length += u8.length; return this; };
  Writer.prototype.u16 = function (n) {
    var b = new Uint8Array(2);
    b[0] = n & 0xff; b[1] = (n >>> 8) & 0xff;
    return this.bytes(b);
  };
  Writer.prototype.u32 = function (n) {
    var b = new Uint8Array(4);
    b[0] = n & 0xff; b[1] = (n >>> 8) & 0xff; b[2] = (n >>> 16) & 0xff; b[3] = (n >>> 24) & 0xff;
    return this.bytes(b);
  };
  Writer.prototype.done = function () {
    var out = new Uint8Array(this.length), at = 0;
    for (var i = 0; i < this.parts.length; i++) { out.set(this.parts[i], at); at += this.parts[i].length; }
    return out;
  };

  var CRC_TABLE = (function () {
    var t = new Int32Array(256), n, k, c;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(u8) {
    var c = -1;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  /** MS-DOS packed date/time. Zip cannot express anything finer than 2 seconds. */
  function dosStamp(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
      date: ((((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
    };
  }

  function zip(entries, now) {
    var stamp = dosStamp(now || new Date());
    var local = new Writer(), central = new Writer(), offset = 0, i;

    for (i = 0; i < entries.length; i++) {
      var name = enc.encode(entries[i].name);
      var data = enc.encode(entries[i].data);
      var crc = crc32(data);

      local.u32(0x04034b50).u16(20).u16(0).u16(0)      // method 0 = stored
           .u16(stamp.time).u16(stamp.date)
           .u32(crc).u32(data.length).u32(data.length)
           .u16(name.length).u16(0).bytes(name).bytes(data);

      central.u32(0x02014b50).u16(20).u16(20).u16(0).u16(0)
             .u16(stamp.time).u16(stamp.date)
             .u32(crc).u32(data.length).u32(data.length)
             .u16(name.length).u16(0).u16(0).u16(0).u16(0).u32(0)
             .u32(offset).bytes(name);

      offset += 30 + name.length + data.length;
    }

    var cd = central.done();
    var end = new Writer();
    end.u32(0x06054b50).u16(0).u16(0)
       .u16(entries.length).u16(entries.length)
       .u32(cd.length).u32(offset).u16(0);

    var head = local.done(), tail = end.done();
    var out = new Uint8Array(head.length + cd.length + tail.length);
    out.set(head, 0); out.set(cd, head.length); out.set(tail, head.length + cd.length);
    return out;
  }

  /* ===== SpreadsheetML ===== */

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      // Excel rejects most control characters outright rather than ignoring them.
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  }

  /** Excel's day zero is 1899-12-30: it believes 1900 was a leap year. */
  function serial(date) {
    var utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(),
                       date.getHours(), date.getMinutes(), date.getSeconds());
    return utc / 86400000 + 25569;
  }

  function colName(n) {
    var s = "";
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) {
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    }
    return s;
  }

  // Style indices, in the order cellXfs declares them below.
  var S = { plain: 0, header: 1, date: 2, datetime: 3, money: 4, number: 5, duration: 6,
            percent: 7, integer: 8 };
  var STYLE_FOR = { text: S.plain, date: S.date, datetime: S.datetime,
                    money: S.money, number: S.number, duration: S.duration,
                    percent: S.percent, integer: S.integer };

  function cell(ref, value, type) {
    // An omitted cell is genuinely absent; writing "" would be an empty string.
    if (value === null || value === undefined || value === "") return "";
    var style = STYLE_FOR[type] === undefined ? S.plain : STYLE_FOR[type];
    var s = style ? ' s="' + style + '"' : "";
    if (type === "date" || type === "datetime") {
      return '<c r="' + ref + '"' + s + '><v>' + serial(value) + "</v></c>";
    }
    if (type === "money" || type === "number" || type === "duration" ||
        type === "percent" || type === "integer") {
      return isFinite(value) ? '<c r="' + ref + '"' + s + '><v>' + value + "</v></c>" : "";
    }
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' +
           esc(value) + "</t></is></c>";
  }

  function sheetXml(columns, rows) {
    var cols = columns.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 14) + '" customWidth="1"/>';
    }).join("");

    var head = '<row r="1">' + columns.map(function (c, i) {
      return '<c r="' + colName(i) + '1" s="' + S.header + '" t="inlineStr"><is><t>' +
             esc(c.header) + "</t></is></c>";
    }).join("") + "</row>";

    var body = rows.map(function (row, r) {
      var n = r + 2;
      return '<row r="' + n + '">' + columns.map(function (c, i) {
        return cell(colName(i) + n, row[c.key], c.type);
      }).join("") + "</row>";
    }).join("");

    var last = colName(columns.length - 1) + (rows.length + 1);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      "</sheetView></sheetViews>" +
      "<cols>" + cols + "</cols>" +
      "<sheetData>" + head + body + "</sheetData>" +
      '<autoFilter ref="A1:' + last + '"/>' +
      "</worksheet>";
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="5">' +
    '<numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/>' +
    '<numFmt numFmtId="165" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/>' +
    '<numFmt numFmtId="166" formatCode="&quot;$&quot;#,##0.00;[Red]\\(&quot;$&quot;#,##0.00\\)"/>' +
    '<numFmt numFmtId="167" formatCode="0.00&quot; h&quot;"/>' +
    '<numFmt numFmtId="168" formatCode="0.00%"/>' +
    "</numFmts>" +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    "</cellXfs></styleSheet>";

  /**
   * Build a single-sheet workbook as a Uint8Array.
   *
   * columns: [{ header, key, type, width }] where type is one of
   * text | date | datetime | money | number | integer | percent | duration.
   */
  function build(opts) {
    var columns = opts.columns, rows = opts.rows || [];
    var sheetName = esc(opts.sheetName || "Sessions").slice(0, 31);
    return zip([
      { name: "[Content_Types].xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>" },
      { name: "_rels/.rels", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>" },
      { name: "xl/workbook.xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + sheetName + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>" },
      { name: "xl/styles.xml", data: STYLES },
      { name: "xl/worksheets/sheet1.xml", data: sheetXml(columns, rows) }
    ], opts.now);
  }

  return { build: build, serial: serial, colName: colName, crc32: crc32 };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Xlsx;
