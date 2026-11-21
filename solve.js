// solve.js — a fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly csv-reader 1.0.0's answer {columns, rows, errors}
// for {text, header}. Same single left-to-right pass and the same broken-row
// policy as the reference (see the kit's RULES.txt), but instead of the
// reference's one-character-at-a-time loop it scans with indexOf and takes
// whole fields with slice, so the common paths — an unquoted field, a quoted
// field with no embedded line break — cost a few C++ scans and no per-char
// work. No dependencies, no regex, no split on the hot path.
//
// Semantics (matching the reference exactly):
// - U+FEFF at the very start is dropped.
// - A record ends at LF or CRLF; a line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A field opening with a quote runs to the next quote that is not doubled
//   ("" inside is one quote; CRLF or a lone CR inside is read as LF); text
//   after the closing quote up to the next comma or line break is appended
//   as it stands (quote_junk, when the field ends); a quote that never
//   closes is a literal character and the text after it is read again as
//   unquoted (unterminated_quote).
// - A quote inside an unquoted field is a literal character; fields stay
//   strings, never trimmed or converted.
// - columns is the first record when header is true, else null; rows holds
//   the records after it, each padded with "" (short_row, with fields: its
//   field count) or cut (long_row, with extra: the cut fields) to the first
//   record's width.
// - Each error is {code, line, row} in the order met; a record's short_row
//   or long_row is recorded when the record ends. line is the 1-based line
//   the record starts on (every LF, CRLF and lone CR inside a quoted field
//   counted); row is the record's index in rows (null for the header).

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;
  // How the last field read ended.
  let fieldEnded = COMMA;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, onto `init` ('' for a fresh field, the quoted
  // content after a closing quote, or '"' after an unterminated quote). Returns the field.
  // Sets fieldEnded. Chars appended are the field's length minus init's length.
  function readUnquoted(init) {
    // The field ends at the first comma or LF at or after pos, or at the end of the text.
    const comma = text.indexOf(',', pos);
    const lf = text.indexOf('\n', pos);
    let end;
    let kind;
    if (comma !== -1 && (lf === -1 || comma < lf)) {
      end = comma;
      kind = COMMA;
    } else if (lf !== -1) {
      end = lf;
      kind = LINE_BREAK;
    } else {
      end = len;
      kind = END;
    }
    const seg = text.slice(pos, end);
    const r = seg.indexOf('\r');
    if (r === -1) {
      // No CR in the field: the whole slice is the field.
      if (kind === COMMA) {
        pos = end + 1;
        fieldEnded = COMMA;
      } else if (kind === LINE_BREAK) {
        pos = end + 1;
        line += 1;
        fieldEnded = LINE_BREAK;
      } else {
        pos = len;
        fieldEnded = END;
      }
      return init === '' ? seg : init + seg;
    }
    // CRs in the field: each is a stray_cr dropped, except a CR at the very end of the
    // field when the field ends at an LF — that CR with its LF is the CRLF line break.
    let value = init;
    let from = 0;
    let cr = r;
    while (true) {
      if (cr === seg.length - 1 && kind === LINE_BREAK) {
        value += seg.slice(from, cr);
        pos = end + 1;
        line += 1;
        fieldEnded = LINE_BREAK;
        return value;
      }
      pushError('stray_cr');
      value += seg.slice(from, cr);
      from = cr + 1;
      cr = seg.indexOf('\r', from);
      if (cr === -1) {
        value += seg.slice(from);
        if (kind === COMMA) {
          pos = end + 1;
          fieldEnded = COMMA;
        } else if (kind === LINE_BREAK) {
          pos = end + 1;
          line += 1;
          fieldEnded = LINE_BREAK;
        } else {
          pos = len;
          fieldEnded = END;
        }
        return value;
      }
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field; sets fieldEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let nl = 0; // line breaks inside the quotes, committed to line only when the quote closes
    while (true) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is
        // read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      // The content up to the quote at q: line breaks in it become LF and count.
      const seg = text.slice(pos, q);
      if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
        value += seg;
      } else {
        let from = 0;
        while (true) {
          const cr = seg.indexOf('\r', from);
          const lf = seg.indexOf('\n', from);
          let br;
          let isCr;
          if (cr !== -1 && (lf === -1 || cr < lf)) {
            br = cr;
            isCr = true;
          } else if (lf !== -1) {
            br = lf;
            isCr = false;
          } else {
            break;
          }
          value += seg.slice(from, br) + '\n';
          nl += 1;
          from = isCr && seg.charCodeAt(br + 1) === 10 ? br + 2 : br + 1;
        }
        value += seg.slice(from);
      }
      if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one literal quote, and the field goes on.
        value += '"';
        pos = q + 2;
        continue;
      }
      // The closing quote.
      pos = q + 1;
      line += nl;
      if (pos >= len) {
        fieldEnded = END;
        return value;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fieldEnded = COMMA;
        return value;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fieldEnded = LINE_BREAK;
        return value;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fieldEnded = LINE_BREAK;
        return value;
      }
      // What follows the closing quote is appended as it stands, up to the next comma
      // or line break.
      const before = value.length;
      const junk = readUnquoted(value);
      if (junk.length - before > 0) pushError('quote_junk');
      return junk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      fields.push(quoted ? readQuoted() : readUnquoted(''));
    } while (fieldEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
