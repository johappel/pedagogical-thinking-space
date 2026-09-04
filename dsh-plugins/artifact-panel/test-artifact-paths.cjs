// Regression test: only PTS workspace artifact directories may become chips.
const fs = require("fs");

const src = fs.readFileSync(__dirname + "/lib/client.js", "utf8");
const start = src.indexOf("const PTS_ARTIFACT_LOCATION_RE");
const end = src.indexOf("const ptsProducedDefinition", start);
if (start < 0 || end < 0 || end <= start) {
	console.error("artifact extractor not found");
	process.exit(1);
}
const factory = new Function("function normPath(p) { return String(p).replace(/\\\\/g, '/'); }\n" + src.slice(start, end) + "\nreturn { extractArtifactPaths };");
const { extractArtifactPaths } = factory();

const paths = extractArtifactPaths([
	"Erstellt: materials/arbeitsblatt.png",
	"Entwurf unter drafts/fragen.md",
	"C:\\Users\\Joachim\\AppData\\Local\\Packages\\WhatsAppDesktop_cx1g1gvanyjgm\\LocalState\\ContactPictures\\contact_665f34da-1b03-40b5-a64c-196fea692a2d.png",
	"attachment.png",
].join("\n"));

const expected = ["materials/arbeitsblatt.png", "drafts/fragen.md"];
const nativeCandidates = [
	"materials/arbeitsblatt.png",
	"remote-ssh.png",
	"C:/Users/Joachim/AppData/Local/Packages/WhatsAppDesktop_cx1g1gvanyjgm/LocalState/ContactPictures/contact.png",
];
const clientStart = src.indexOf("function isPtsArtifactPath");
const clientEnd = src.indexOf("const ptsProducedDefinition", clientStart);
const clientFactory = new Function(
	"const PREVIEW_EXTS = ['.png', '.md']; function normPath(p) { return String(p).replace(/\\\\/g, '/'); } function extOf(p) { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i).toLowerCase() : ''; }\n" +
	src.slice(clientStart, clientEnd) + "\nreturn { isPtsArtifactPath };",
);
const { isPtsArtifactPath } = clientFactory();
const ok = JSON.stringify(paths) === JSON.stringify(expected) && JSON.stringify(nativeCandidates.filter(isPtsArtifactPath)) === JSON.stringify(["materials/arbeitsblatt.png"]);
console.log(ok ? "OK artifact path containment" : "FAIL artifact path containment: " + JSON.stringify(paths));
process.exit(ok ? 0 : 1);
