#!/usr/bin/env python3
"""Generic Worker (fallback)

Reads a Service Request as JSON from stdin and produces a draft artefact.
This is the place where, in production, an LLM call would happen.
For the demo it writes a structured placeholder draft so the dispatch loop
is provably working for any `service: worker` / `mode: draft` request.
"""
import sys
import os


def main():
    req = __import__("json").load(sys.stdin)

    out_loc = req["expected_output"]["location"]
    os.makedirs(os.path.dirname(out_loc), exist_ok=True)

    constraints = req.get("constraints", {})
    ld = req["input"].get("learning_design", "?")
    rid = req.get("id", req.get("task", "worker"))
    must = constraints.get("must", [])
    must_not = constraints.get("must_not", [])

    text = (
        f"# Entwurf: {rid}\n\n"
        f"Basierend auf: {ld}\n"
        f"Sprache: {constraints.get('language')}\n"
        f"Zielgruppe: {constraints.get('audience')}\n"
        f"Umfang: {constraints.get('length') or constraints.get('max_length')}\n"
        f"Ton: {constraints.get('tone')}\n\n"
    )
    if must:
        text += "**Muss enthalten:**\n" + "\n".join(f"- {m}" for m in must) + "\n\n"
    if must_not:
        text += "**Darf nicht:**\n" + "\n".join(f"- {m}" for m in must_not) + "\n\n"
    text += "(Hier würde ein Worker-Modell den tatsächlichen Entwurf erzeugen.)\n"

    with open(out_loc, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"worker '{rid}' wrote {out_loc}")


if __name__ == "__main__":
    main()
