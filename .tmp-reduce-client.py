from pathlib import Path
p = Path('dsh-plugins/pts-landscape/lib/client.js')
s = p.read_text(encoding='utf-8')
def remove(start, end):
    global s
    a = s.index(start)
    b = s.index(end, a)
    s = s[:a] + s[b:]
remove('\t\t\tfunction proposeVerlauf(', '\t\t\tif (error !== null')
remove('\t\t\tconst windows = temporal', '\t\t\tconst decisionCount')
remove('\t\tfunction NewWindowForm(', '\t\tasync function productRequest(')
a = s.index('\t\t\t\t\tReact.createElement("div", { className: "pls-side" }')
b = s.index('\n\n\t\t\t\tfalse', a)
s = s[:a] + '\t\t\t\t\tReact.createElement("div", { className: "pls-side" }, "Lernmomente sind p\\u00e4dagogische M\\u00f6glichkeiten. Ihre best\\u00e4tigte Verwendung findest du in der Unterrichtsreihe.")),\n' + s[b:]
a = s.index('\t\t\t\t// ——— New window form')
b = s.index('\n\t\t}', a)
s = s[:a] + '\t\t\t\tnull);' + s[b:]
s = s.replace('React.createElement("span", null, windows.length + " Stundenfenster"),', '')
s = s.replace('Linke Maustaste: in eine Stunde (rechts) zuordnen oder auf eine andere Karte ziehen = Übergang', 'Linke Maustaste: auf eine andere Karte ziehen = Übergang')
s = s.replace('"Lernlandschaft" + (data.title', '"Lernmomente" + (data.title')
s = s.replace('React.createElement("div", { className: "pls-path" }, data.root || ""),', '')
s = s.replace('\t\t\tconst winFormState = React.useState(false);\n\t\t\tconst winForm = winFormState[0];\n\t\t\tconst setWinForm = winFormState[1];\n', '')
p.write_text(s, encoding='utf-8')
