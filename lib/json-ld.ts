// JSON.stringify does not escape `<`, so embedding the result inside a
// <script> block lets a "</script>" substring inside the data close the
// tag and inject arbitrary HTML. Escape `<` plus the two line-terminator
// codepoints that historically tripped browser script parsers.
//
// Use this for every <script ... dangerouslySetInnerHTML={{ __html: ... }} />
// site that embeds JSON (typically JSON-LD).
const LINE_SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");

export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(LINE_SEPARATORS, (c) =>
      c.charCodeAt(0) === 0x2028 ? "\\u2028" : "\\u2029",
    );
}
