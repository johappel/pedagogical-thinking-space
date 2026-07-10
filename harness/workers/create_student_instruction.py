#!/usr/bin/env python3
"""Worker: create_student_instruction

Reads a Service Request as JSON from stdin and produces a draft artefact.
This is the place where, in production, an LLM call would happen.
For the demo it writes a placeholder so the dispatch loop is provably working.
"""
import sys, json, os


def main():
    req = json.load(sys.stdin)

    out_loc = req["expected_output"]["location"]
    os.makedirs(os.path.dirname(out_loc), exist_ok=True)

    constraints = req.get("constraints", {})
    ld = req["input"].get("learning_design", "?")

    # --- HERE a real worker would call a model, e.g. ---
    # model = route_model(req.get("model_hint", "cheap_fast"))
    # draft = model.generate(prompt_from(req))
    # For the demo we just stamp the request into a file:
    text = (
        f"# Entwurf: {req.get('task')}\n\n"
        f"Basierend auf: {ld}\n"
        f"Sprache: {constraints.get('language')}\n"
        f"Zielgruppe: {constraints.get('audience')}\n"
        f"Max. Länge: {constraints.get('max_length')}\n\n"
        f"(Hier würde ein Worker-Modell den tatsächlichen Entwurf erzeugen.)\n"
    )

    with open(out_loc, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"worker '{req.get('task')}' wrote {out_loc}")


if __name__ == "__main__":
    main()
