# pts-workspace-git

Lokales Git-Sicherheitsnetz **ausschließlich für `workspace/`** (Host-Ebene,
pts-web-Profil).

Das PTS-Root-Repo ignoriert `workspace/` bewusst (keine konkreten Workspace-
Inhalte im gepflegten Repo). Damit ein versehentlicher Fehl-Edit — z. B. der
Companion überschreibt die falsche Datei — trotzdem revertierbar ist, führt
dieses Plugin ein **eigenes lokales Git-Repo** im Workspace:

```text
workspace/
├── .git/            <- lokales Repo, ausschließlich für Workspace-Inhalte
├── .gitignore       <- .trash/, Steward-Temp, OS-Dateien
└── <denkraum>/…
```

## Verhalten

- Beobachtet `turn/end` (completed, nur Top-Level-Sessions) — derselbe Trigger
  wie der Background-Steward.
- Debounced (2,5 s) und führt höchstens einen Commit gleichzeitig aus.
- Committet **am Workspace-Repo-Root** (deckt alle Denkräume ab):
  `git add -A && git commit -m "pts: Workspace-Update …"`.
- Überspringt Leerläufe (`git status --porcelain`); Fehler werden nur geloggt —
  ein defektes Sicherheitsnetz blockiert nie den Dialog.

## Revert eines Fehl-Edits

```powershell
git -C workspace log --oneline                # Commit finden
git -C workspace diff <commit>~1 <commit>     # prüfen, was sich geändert hat
git -C workspace revert --no-edit <commit>    # rückgängig machen
```

## Installation (pts-web-Profil)

1. Junction (wie bei den anderen PTS-Host-Plugins):

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\pts-web\node_modules\pts-workspace-git" `
     -Target "F:\code\pedagogical-thinking-space\dsh-plugins\pts-workspace-git"
   ```

2. Patch-Zeile in `profiles/pts-web/cordis.patch.yml` (erster `- insert:`-Block):

   ```yaml
   - id: pts-workspace-git
     name: pts-workspace-git
     inject: [sessions, agents]
   ```

3. DSH/pts-web neu starten.

## Abgrenzung

Das Plugin ist eine reine **Datei-Versionierung** (Seiteneffekt nach Turn-Ende),
kein Dispatcher, keine Job-/Request-State-Machine und kein Agent-Routing. Es
greift nicht in den Dialog ein und erzeugt keine Chat-Meldungen.
