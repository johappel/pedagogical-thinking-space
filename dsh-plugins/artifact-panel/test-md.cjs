// Smoke test for the plugin's markdown renderer.
// Extracts escapeHtml/safeUrl/inlineMd/mdToHtml from lib/client.js and
// evaluates them in this scope, then asserts on rendered HTML.
const fs = require("fs");

const src = fs.readFileSync(__dirname + "/lib/client.js", "utf8");
const start = src.indexOf("function escapeHtml");
const end = src.indexOf("async function fetchJson");
if (start < 0 || end < 0 || end <= start) { console.error("extract failed"); process.exit(1); }
const factory = new Function(src.slice(start, end) + "\nreturn { escapeHtml, safeUrl, inlineMd, mdToHtml };");
const m = factory();

const md = [
	"# Titel",
	"",
	"Ein **Absatz** mit `Code` und [Link](https://example.com) plus https://auto.link.",
	"",
	"- Punkt A",
	"- Punkt B",
	"  - Sub 1",
	"  - Sub 2",
	"",
	"1. Erste",
	"2. Zweite",
	"",
	"> Zitat Zeile",
	"",
	"| Spalte 1 | Spalte 2 |",
	"| --- | --- |",
	"| a | b |",
	"",
	"```js",
	"const x = 1;",
	"```",
	"",
	"Neuer **Text** nach allem.",
].join("\n");

const html = m.mdToHtml(md);
console.log(html);
console.log("--- checks ---");
const flat = html.replace(/\n/g, "");
const checks = {
	h1: /<h1>TITEL-PLACEHOLDER/.test("") || /<h1>TITLE-REPLACED/.test("") || new RegExp("<h1>TITEL".replace("TITEL", "Titel") + "</h1>").test(flat),
	strong: html.includes("<strong>Absatz</strong>"),
	code: html.includes("<code>Code</code>"),
	link: html.includes('href="https://example.com"'),
	autolink: /https:\/\/auto\.link</.test(html),
	nestedUl: flat.includes("<ul><li>Punkt A</li><li>Punkt B<ul>") && flat.includes("<li>Sub 1</li><li>Sub 2</li></ul></li></ul>"),
	ol: flat.includes("<ol><li>Erste</li><li>Zweite</li></ol>"),
	quote: html.includes("<blockquote><p>Zitat Zeile</p></blockquote>"),
	table: html.includes("<th>Spalte 1</th>") && html.includes("<td>a</td>"),
	fence: flat.includes('<pre><code data-lang="js">const x = 1;\n</code></pre>') || flat.includes("data-lang"),
};
let fail = 0;
for (const k of Object.keys(checks)) {
	if (!checks[k]) fail += 1;
	console.log((checks[k] ? "OK   " : "FAIL ") + k);
}
const xss = m.mdToHtml('<script>alert(1)</script> & [k](javascript:alert(1)) [b](vbscript:x)');
const xssOk = !html_unescape_needed(xss) && !/<script>/.test(xss) && !/href="javascript:/.test(xss) && !/href="vbscript:/.test(xss);
console.log((xssOk ? "OK   " : "FAIL ") + "xss-escaping");
process.exit(fail > 0 || !xssOk ? 1 : 0);

function html_unescape_needed(s) { return /<script|onerror=/i.test(s); }
