#!/usr/bin/env python3
"""Build the scientific proposal PDF from its Markdown source.

Usage:
    python scripts/build_scientific_proposal.py
    python scripts/build_scientific_proposal.py --source path.md --output path.pdf

The script intentionally uses a small, repository-local Markdown subset so the
proposal remains reproducible without a desktop publishing application.
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "PTSpace_wissenschaftliches_Proposal.md"
DEFAULT_OUTPUT = ROOT / "PTSpace_wissenschaftliches_Proposal.pdf"

BLUE = colors.HexColor("#1F4E79")
MID_BLUE = colors.HexColor("#D9EAF7")
PALE_BLUE = colors.HexColor("#EEF5FA")
TEXT = colors.HexColor("#20252A")
MUTED = colors.HexColor("#66727D")
GRID = colors.HexColor("#AFC3D2")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ProposalTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=BLUE,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "ProposalSubtitle",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=TEXT,
            spaceAfter=16,
        ),
        "h1": ParagraphStyle(
            "ProposalH1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=17,
            textColor=BLUE,
            spaceBefore=11,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "ProposalH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=BLUE,
            spaceBefore=8,
            spaceAfter=3,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "ProposalBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.65,
            leading=11.35,
            textColor=TEXT,
            alignment=TA_LEFT,
            spaceAfter=5.2,
            splitLongWords=True,
            allowWidows=0,
            allowOrphans=0,
        ),
        "small": ParagraphStyle(
            "ProposalSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=10,
            textColor=MUTED,
            spaceAfter=4,
            splitLongWords=True,
        ),
        "quote": ParagraphStyle(
            "ProposalQuote",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.8,
            leading=11.6,
            leftIndent=8 * mm,
            rightIndent=5 * mm,
            borderColor=MID_BLUE,
            borderWidth=0,
            borderPadding=5,
            backColor=PALE_BLUE,
            textColor=TEXT,
            spaceBefore=3,
            spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "ProposalBullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.55,
            leading=11.1,
            leftIndent=4 * mm,
            firstLineIndent=0,
            spaceAfter=2,
            textColor=TEXT,
        ),
        "table": ParagraphStyle(
            "ProposalTable",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.35,
            leading=9.25,
            textColor=TEXT,
            splitLongWords=True,
        ),
        "table_head": ParagraphStyle(
            "ProposalTableHead",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.4,
            leading=9.3,
            textColor=colors.white,
            splitLongWords=True,
        ),
        "literature": ParagraphStyle(
            "ProposalLiterature",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.35,
            leading=9.4,
            leftIndent=4 * mm,
            firstLineIndent=-4 * mm,
            textColor=TEXT,
            spaceAfter=3.4,
            splitLongWords=True,
        ),
    }


def _inline(text: str) -> str:
    """Convert a deliberately small Markdown inline subset to ReportLab markup."""
    escaped = html.escape(text.strip(), quote=False)
    escaped = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", escaped)
    return escaped


def _is_separator(line: str) -> bool:
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", c) for c in cells)


def _table_widths(columns: int, available: float) -> list[float]:
    ratios = {
        2: [0.32, 0.68],
        3: [0.25, 0.35, 0.40],
        4: [0.19, 0.26, 0.27, 0.28],
        5: [0.16, 0.20, 0.21, 0.21, 0.22],
    }.get(columns)
    if ratios is None:
        ratios = [1 / columns] * columns
    return [available * ratio for ratio in ratios]


def _build_table(lines: list[str], styles: dict[str, ParagraphStyle], available: float):
    parsed = [[cell.strip() for cell in row.strip().strip("|").split("|")] for row in lines]
    if len(parsed) > 1 and _is_separator(lines[1]):
        parsed.pop(1)
    columns = max(len(row) for row in parsed)
    normalized = [row + [""] * (columns - len(row)) for row in parsed]
    data = []
    for row_index, row in enumerate(normalized):
        style = styles["table_head"] if row_index == 0 else styles["table"]
        data.append([Paragraph(_inline(cell), style) for cell in row])
    table = LongTable(
        data,
        colWidths=_table_widths(columns, available),
        repeatRows=1,
        hAlign="LEFT",
        splitByRow=True,
    )
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for row_index in range(1, len(data)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PALE_BLUE))
    table.setStyle(TableStyle(commands))
    return table


def _flush_paragraph(
    buffer: list[str],
    story: list,
    styles: dict[str, ParagraphStyle],
    literature_mode: bool,
) -> None:
    if not buffer:
        return
    text = " ".join(part.strip() for part in buffer if part.strip())
    if text:
        style = styles["literature"] if literature_mode else styles["body"]
        story.append(Paragraph(_inline(text), style))
    buffer.clear()


def parse_markdown(source: str, available_width: float) -> list:
    styles = _styles()
    lines = source.splitlines()
    story: list = []
    paragraph: list[str] = []
    bullet_items: list[str] = []
    quote_lines: list[str] = []
    literature_mode = False
    title_seen = False
    subtitle_seen = False

    def flush_bullets() -> None:
        nonlocal bullet_items
        if not bullet_items:
            return
        items = [
            ListItem(Paragraph(_inline(item), styles["bullet"]), leftIndent=4 * mm)
            for item in bullet_items
        ]
        story.append(
            ListFlowable(
                items,
                bulletType="bullet",
                start="circle",
                leftIndent=8 * mm,
                bulletFontName="Helvetica",
                bulletFontSize=5,
                bulletColor=BLUE,
                spaceAfter=5,
            )
        )
        bullet_items = []

    def flush_quote() -> None:
        nonlocal quote_lines
        if quote_lines:
            story.append(Paragraph(_inline(" ".join(quote_lines)), styles["quote"]))
            quote_lines = []

    index = 0
    while index < len(lines):
        raw = lines[index].rstrip()
        stripped = raw.strip()

        if stripped == "<!-- pagebreak -->":
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            flush_quote()
            story.append(PageBreak())
            index += 1
            continue

        if stripped.startswith("|"):
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            flush_quote()
            table_lines = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            story.append(_build_table(table_lines, styles, available_width))
            story.append(Spacer(1, 6))
            continue

        if stripped.startswith("- "):
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_quote()
            bullet_items.append(stripped[2:].strip())
            index += 1
            continue

        if stripped.startswith(">"):
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            quote_lines.append(stripped.lstrip(">").strip())
            index += 1
            continue

        if stripped.startswith("# "):
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            flush_quote()
            text = stripped[2:].strip()
            if not title_seen:
                story.append(Spacer(1, 12 * mm))
                story.append(Paragraph(_inline(text), styles["title"]))
                story.append(HRFlowable(width="100%", thickness=1.2, color=BLUE, spaceAfter=8))
                title_seen = True
            else:
                story.append(Paragraph(_inline(text), styles["h1"]))
            index += 1
            continue

        if stripped.startswith("## "):
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            flush_quote()
            text = stripped[3:].strip()
            if title_seen and not subtitle_seen:
                story.append(Paragraph(_inline(text), styles["subtitle"]))
                subtitle_seen = True
            else:
                story.append(Paragraph(_inline(text), styles["h1"]))
                literature_mode = text.startswith("12. Literatur")
            index += 1
            continue

        if stripped.startswith("### "):
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            flush_quote()
            story.append(Paragraph(_inline(stripped[4:].strip()), styles["h2"]))
            index += 1
            continue

        if not stripped:
            _flush_paragraph(paragraph, story, styles, literature_mode)
            flush_bullets()
            flush_quote()
            index += 1
            continue

        paragraph.append(stripped)
        index += 1

    _flush_paragraph(paragraph, story, styles, literature_mode)
    flush_bullets()
    flush_quote()
    return story


def _header_footer(canvas, doc) -> None:
    canvas.saveState()
    width, height = LETTER
    canvas.setStrokeColor(MID_BLUE)
    canvas.setLineWidth(0.4)
    canvas.line(doc.leftMargin, height - 14 * mm, width - doc.rightMargin, height - 14 * mm)
    canvas.setFont("Helvetica", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - doc.rightMargin, height - 10.5 * mm, "Entwurf, Stand: 3. August 2026")
    canvas.line(doc.leftMargin, 13 * mm, width - doc.rightMargin, 13 * mm)
    canvas.drawString(doc.leftMargin, 8.5 * mm, "Pedagogical Thinking Space Proposal")
    canvas.drawRightString(width - doc.rightMargin, 8.5 * mm, f"Seite {doc.page}")
    canvas.restoreState()


def build(source_path: Path, output_path: Path) -> None:
    source = source_path.read_text(encoding="utf-8")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=LETTER,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=19 * mm,
        bottomMargin=18 * mm,
        title="Pedagogical Thinking Space - Wissenschaftliches Proposal",
        author="Joachim Happel / Pedagogical Thinking Space",
        subject="Systemisch-reflexiver KI-Companion für professionelle Unterrichtsentwicklung",
        creator="scripts/build_scientific_proposal.py",
    )
    story = parse_markdown(source, doc.width)
    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not args.source.exists():
        parser.error(f"Source file not found: {args.source}")
    build(args.source.resolve(), args.output.resolve())
    print(f"Built {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
