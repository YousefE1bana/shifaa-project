from __future__ import annotations

import math
import re
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageBreakIfNotEmpty,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[2]
DELIVERABLE_DIR = ROOT / "ECU-Deliverables"
ASSET_DIR = DELIVERABLE_DIR / "assets"
MARKDOWN_PATH = DELIVERABLE_DIR / "Chapter-1-Project-Analysis.md"
PDF_PATH = DELIVERABLE_DIR / "Chapter-1-Project-Analysis.pdf"

NAVY = "123044"
TEAL = "19788C"
TEAL_DARK = "0D5968"
TEAL_LIGHT = "E8F4F6"
CYAN = "41B7C7"
INK = "1E2933"
MUTED = "62727D"
LINE = "CBD8DE"
PALE = "F4F7F8"
GOLD = "C99832"
RED = "A83A3A"
GREEN = "2D7D65"


def hx(value: str):
    return HexColor(f"#{value.lstrip('#')}")


def font_path(name: str) -> str:
    return str(Path("C:/Windows/Fonts") / name)


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Calibri", font_path("calibri.ttf")))
    pdfmetrics.registerFont(TTFont("Calibri-Bold", font_path("calibrib.ttf")))
    pdfmetrics.registerFont(TTFont("Calibri-Italic", font_path("calibrii.ttf")))


def pil_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(font_path("calibrib.ttf" if bold else "calibri.ttf"), size=size)


def rounded_box(draw: ImageDraw.ImageDraw, xy, fill, outline=LINE, radius=24, width=3):
    draw.rounded_rectangle(xy, radius=radius, fill=f"#{fill}", outline=f"#{outline}", width=width)


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_centered_text(draw, box, text, font, fill=INK, line_gap=6):
    x1, y1, x2, y2 = box
    lines = wrap_lines(draw, text, font, x2 - x1 - 28)
    heights = [draw.textbbox((0, 0), line, font=font)[3] for line in lines]
    total = sum(heights) + line_gap * max(0, len(lines) - 1)
    y = y1 + (y2 - y1 - total) / 2
    for line, height in zip(lines, heights):
        width = draw.textbbox((0, 0), line, font=font)[2]
        draw.text((x1 + (x2 - x1 - width) / 2, y), line, font=font, fill=f"#{fill}")
        y += height + line_gap


def arrow(draw, start, end, fill=TEAL_DARK, width=5, dashed=False):
    x1, y1 = start
    x2, y2 = end
    if dashed:
        steps = max(1, int(math.dist(start, end) / 24))
        for i in range(0, steps, 2):
            a = i / steps
            b = min(1, (i + 1) / steps)
            draw.line((x1 + (x2 - x1) * a, y1 + (y2 - y1) * a,
                       x1 + (x2 - x1) * b, y1 + (y2 - y1) * b), fill=f"#{fill}", width=width)
    else:
        draw.line((x1, y1, x2, y2), fill=f"#{fill}", width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    head = 18
    p1 = (x2 - head * math.cos(angle - math.pi / 6), y2 - head * math.sin(angle - math.pi / 6))
    p2 = (x2 - head * math.cos(angle + math.pi / 6), y2 - head * math.sin(angle + math.pi / 6))
    draw.polygon([(x2, y2), p1, p2], fill=f"#{fill}")


def draw_actor(draw, cx, cy, label, side="left"):
    line = f"#{NAVY}"
    draw.ellipse((cx - 18, cy - 78, cx + 18, cy - 42), outline=line, width=5)
    draw.line((cx, cy - 42, cx, cy + 24), fill=line, width=5)
    draw.line((cx - 30, cy - 12, cx + 30, cy - 12), fill=line, width=5)
    draw.line((cx, cy + 24, cx - 26, cy + 66), fill=line, width=5)
    draw.line((cx, cy + 24, cx + 26, cy + 66), fill=line, width=5)
    font = pil_font(29, True)
    box = (cx - 115, cy + 72, cx + 115, cy + 140)
    draw_centered_text(draw, box, label, font, NAVY, 3)


def create_use_case_diagram(path: Path) -> None:
    canvas = PILImage.new("RGB", (1900, 1250), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((70, 45), "SHIFAA — System-Level Use Cases", font=pil_font(54, True), fill=f"#{NAVY}")
    draw.text((72, 112), "Academic model; authorization remains governed by the API and RLS contracts", font=pil_font(28), fill=f"#{MUTED}")
    boundary = (330, 185, 1570, 1165)
    rounded_box(draw, boundary, "FBFDFD", TEAL, 30, 4)
    draw.text((370, 207), "SHIFAA PLATFORM", font=pil_font(30, True), fill=f"#{TEAL_DARK}")

    actors = [
        (150, 340, "Patient"),
        (150, 650, "Guardian / Delegate"),
        (150, 970, "Emergency Contact"),
        (1750, 315, "Clinic / Doctor"),
        (1750, 545, "Pharmacy Staff"),
        (1750, 765, "Hospital / Lab Staff"),
        (1750, 1000, "Admin / DPO"),
    ]
    for x, y, label in actors:
        draw_actor(draw, x, y, label)

    cases = [
        (430, 295, 855, 400, "Register, authenticate and verify identity"),
        (995, 295, 1420, 400, "View consent and exercise privacy rights"),
        (430, 470, 855, 575, "Discover, book, queue and complete encounter"),
        (995, 470, 1420, 575, "Check and sign a safe prescription"),
        (430, 645, 855, 750, "Receive and dispense an exact serialized pack"),
        (995, 645, 1420, 750, "Triage, allocate bed, transfer and discharge"),
        (430, 820, 855, 925, "Process, verify and release laboratory results"),
        (995, 820, 1420, 925, "Activate SOS and minimum emergency share"),
        (430, 995, 855, 1100, "Use advisory AI routing (synthetic MVP)"),
        (995, 995, 1420, 1100, "Govern facilities, roles, content and audit"),
    ]
    links = [
        ((255, 330), (430, 345)), ((255, 355), (995, 345)), ((255, 390), (430, 520)),
        ((255, 650), (995, 345)), ((255, 675), (430, 520)), ((255, 710), (995, 870)),
        ((255, 970), (995, 870)),
        ((1645, 315), (1420, 520)), ((1645, 350), (430, 520)),
        ((1645, 545), (855, 700)), ((1645, 765), (1420, 700)), ((1645, 800), (855, 870)),
        ((1645, 1000), (1420, 1045)), ((1645, 975), (995, 345)),
    ]
    for start, end in links:
        draw.line((*start, *end), fill="#DCE6EA", width=4)
    # Render use-case shapes after associations so connectors never obscure labels.
    for box in cases:
        rounded_box(draw, box[:4], TEAL_LIGHT, "A9CDD4", 52, 3)
        draw_centered_text(draw, box[:4], box[4], pil_font(29, True), TEAL_DARK, 5)
    canvas.save(path, quality=95)


def create_foundation_flow(path: Path) -> None:
    canvas = PILImage.new("RGB", (1900, 1220), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((70, 45), "Foundation Slice — Registration to Patient Profile", font=pil_font(52, True), fill=f"#{NAVY}")
    draw.text((72, 112), "FR-AUTH-001..008 | explicit pending and failure states | one committed effect", font=pil_font(28), fill=f"#{MUTED}")

    main = [
        (75, 260, 330, 390, "1. Choose locale and view notice"),
        (390, 260, 645, 390, "2. Register internal UUID account"),
        (705, 260, 960, 390, "3. Verify OTP / credential"),
        (1020, 260, 1275, 390, "4. Submit identity proof"),
        (1580, 235, 1825, 415, "5. Record consent and create verified / review-pending profile"),
    ]
    for box in main:
        rounded_box(draw, box[:4], TEAL_LIGHT, "A9CDD4", 24, 3)
        draw_centered_text(draw, box[:4], box[4], pil_font(28, True), TEAL_DARK)
    for a, b in zip(main[:3], main[1:4]):
        arrow(draw, (a[2] + 12, 325), (b[0] - 12, 325))

    diamond = [(1425, 245), (1545, 325), (1425, 405), (1305, 325)]
    draw.polygon(diamond, fill=f"#{PALE}", outline=f"#{GOLD}")
    draw.line(diamond + [diamond[0]], fill=f"#{GOLD}", width=4)
    draw_centered_text(draw, (1320, 270, 1530, 380), "Verification outcome?", pil_font(27, True), NAVY)
    arrow(draw, (1275, 325), (1300, 325))
    arrow(draw, (1550, 325), (1572, 325), GREEN)
    draw.text((1535, 278), "verified", font=pil_font(22, True), fill=f"#{GREEN}")

    branches = [
        (1225, 555, 1515, 680, "Manual review\n(case → manual_review)", GOLD),
        (1590, 555, 1845, 680, "Failed / rejected\n(no fabricated success)", RED),
    ]
    # Branch connectors are drawn first; boxes cover the connector endpoints.
    arrow(draw, (1425, 410), (1370, 545), GOLD)
    arrow(draw, (1425, 410), (1715, 545), RED)
    arrow(draw, (1515, 610), (1660, 405), GOLD, dashed=True)
    for x1, y1, x2, y2, label, color in branches:
        rounded_box(draw, (x1, y1, x2, y2), "FFFFFF", color, 22, 4)
        draw_centered_text(draw, (x1, y1, x2, y2), label, pil_font(27, True), color)

    controls = (145, 825, 1755, 1090)
    rounded_box(draw, controls, PALE, LINE, 24, 3)
    draw.text((185, 855), "Cross-cutting controls", font=pil_font(34, True), fill=f"#{NAVY}")
    control_items = [
        (190, 925, 510, 1030, "Idempotency and replay-safe terminal results"),
        (550, 925, 870, 1030, "AES-GCM identity encryption and HMAC blind index"),
        (910, 925, 1230, 1030, "API authorization + forced RLS + minimum fields"),
        (1270, 925, 1700, 1030, "Atomic domain + audit + outbox + stored response"),
    ]
    for box in control_items:
        rounded_box(draw, box[:4], "FFFFFF", "B9C9CF", 18, 2)
        draw_centered_text(draw, box[:4], box[4], pil_font(24, True), INK)
    canvas.save(path, quality=95)


def create_architecture_diagram(path: Path) -> None:
    canvas = PILImage.new("RGB", (1900, 1230), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((70, 45), "SHIFAA — Proposed Modular-Monolith Architecture", font=pil_font(52, True), fill=f"#{NAVY}")
    draw.text((72, 112), "Six authoritative applications | one Core API | PostgreSQL system of record | adapter isolation", font=pil_font(28), fill=f"#{MUTED}")

    app_labels = ["Patient\nExpo", "Clinic\nPWA", "Pharmacy\nPWA", "Hospital\nPWA", "Lab\nPWA", "Admin\nPWA"]
    app_boxes = []
    for i, label in enumerate(app_labels):
        x1 = 75 + i * 300
        box = (x1, 215, x1 + 250, 345)
        app_boxes.append(box)
        rounded_box(draw, box, TEAL_LIGHT, "8FC3CC", 22, 3)
        draw_centered_text(draw, box, label, pil_font(29, True), TEAL_DARK)

    api = (510, 465, 1390, 645)
    for box in app_boxes:
        arrow(draw, ((box[0] + box[2]) // 2, box[3] + 8), ((api[0] + api[2]) // 2, api[1] - 10), TEAL_DARK, 4)

    packages = (120, 770, 660, 1000)
    database = (750, 770, 1150, 1000)
    runtime = (1240, 770, 1780, 1000)
    arrow(draw, (730, 655), (390, 760), TEAL_DARK)
    arrow(draw, (950, 655), (950, 760), GREEN)
    arrow(draw, (1170, 655), (1510, 760), GOLD)
    rounded_box(draw, api, NAVY, NAVY, 28, 4)
    draw_centered_text(draw, api, "Core API — TypeScript / Fastify\nPolicy • use cases • transactions • REST /v1", pil_font(36, True), "FFFFFF", 8)
    rounded_box(draw, packages, "F5F8FA", "A8BCC5", 26, 3)
    rounded_box(draw, database, "EDF7F1", GREEN, 26, 4)
    rounded_box(draw, runtime, "FFF8E9", GOLD, 26, 3)
    draw_centered_text(draw, packages, "Shared Packages\ncontracts • core • auth • API client\ndesign system • i18n • observability • test kit", pil_font(28, True), NAVY, 7)
    draw_centered_text(draw, database, "PostgreSQL 17 + forced RLS\nSupabase Auth / Storage / Realtime\nconstraints • audit • idempotency • outbox", pil_font(28, True), GREEN, 7)
    draw_centered_text(draw, runtime, "Worker + Isolated AI Service\noutbox delivery • scheduled work\nsynthetic red-flag-first AI routing", pil_font(28, True), "815E13", 7)
    vendors = (280, 1080, 1620, 1170)
    rounded_box(draw, vendors, "FFFFFF", LINE, 20, 3)
    draw_centered_text(draw, vendors, "Contract-tested adapters: identity verification • SMS • PSP • EPTTS files • maps/search • object/KMS services", pil_font(27, True), MUTED)
    arrow(draw, (1510, 1010), (1510, 1070), MUTED, 4, dashed=True)
    canvas.save(path, quality=95)


def create_threat_diagram(path: Path) -> None:
    canvas = PILImage.new("RGB", (1900, 1230), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((70, 45), "SHIFAA — Cybersecurity Trust Boundaries", font=pil_font(52, True), fill=f"#{NAVY}")
    draw.text((72, 112), "STRIDE data-flow view | sensitive health, identity and operational state", font=pil_font(28), fill=f"#{MUTED}")

    # Trust boundaries
    draw.rounded_rectangle((60, 195, 430, 1145), radius=24, outline=f"#{GOLD}", width=5)
    draw.rounded_rectangle((500, 195, 1395, 1145), radius=24, outline=f"#{TEAL}", width=5)
    draw.rounded_rectangle((1465, 195, 1840, 1145), radius=24, outline=f"#{RED}", width=5)
    draw.text((90, 215), "UNTRUSTED CLIENT ZONE", font=pil_font(27, True), fill="#815E13")
    draw.text((535, 215), "SHIFAA CONTROLLED ZONE", font=pil_font(27, True), fill=f"#{TEAL_DARK}")
    draw.text((1500, 215), "EXTERNAL PROVIDERS", font=pil_font(27, True), fill=f"#{RED}")

    client_boxes = [
        (105, 315, 385, 430, "Patient mobile/web"),
        (105, 515, 385, 630, "Staff/admin PWAs"),
        (105, 715, 385, 830, "Emergency-link viewer"),
        (105, 915, 385, 1030, "Attacker / automated abuse"),
    ]
    for box in client_boxes:
        rounded_box(draw, box[:4], "FFF8E9", "D8BD7C", 20, 3)
        draw_centered_text(draw, box[:4], box[4], pil_font(27, True), NAVY)

    api = (585, 315, 1310, 480)
    rounded_box(draw, api, NAVY, NAVY, 26, 4)
    draw_centered_text(draw, api, "TB1 — Core API Gateway\nTLS • schema validation • rate limits • authN/Z • AAL/purpose • idempotency", pil_font(31, True), "FFFFFF", 7)

    data = (585, 620, 920, 815)
    async_box = (975, 620, 1310, 815)
    rounded_box(draw, data, "EDF7F1", GREEN, 24, 4)
    rounded_box(draw, async_box, "F2F2FA", "6B67A5", 24, 4)
    draw_centered_text(draw, data, "TB2 — PostgreSQL + RLS\nconstraints • encrypted fields\naudit • outbox • stored response", pil_font(27, True), GREEN, 6)
    draw_centered_text(draw, async_box, "Worker / AI boundary\nreceipts • retries • redaction\nstructured synthetic AI inputs", pil_font(27, True), "514D91", 6)

    ops = (585, 930, 1310, 1060)
    rounded_box(draw, ops, PALE, "A8BCC5", 22, 3)
    draw_centered_text(draw, ops, "Security operations: KMS/secrets • SIEM/alerts • backups/restore • SBOM/scanners • incident evidence", pil_font(27, True), NAVY)

    provider_boxes = [
        (1510, 315, 1795, 430, "Identity vendor"),
        (1510, 500, 1795, 615, "SMS / PSP"),
        (1510, 685, 1795, 800, "Maps / EPTTS"),
        (1510, 870, 1795, 985, "Object / KMS provider"),
    ]
    for box in provider_boxes:
        rounded_box(draw, box[:4], "FFF1F1", "D49A9A", 20, 3)
        draw_centered_text(draw, box[:4], box[4], pil_font(27, True), RED)

    for box in client_boxes[:3]:
        arrow(draw, (box[2] + 8, (box[1] + box[3]) // 2), (api[0] - 10, (api[1] + api[3]) // 2), GOLD, 4)
    arrow(draw, (385, 970), (580, 440), RED, 4, dashed=True)
    arrow(draw, (820, 490), (760, 610), GREEN, 5)
    arrow(draw, (1080, 490), (1140, 610), "6B67A5", 5)
    arrow(draw, (920, 715), (965, 715), TEAL_DARK, 4, dashed=True)
    for box in provider_boxes:
        arrow(draw, (1318, 710), (box[0] - 10, (box[1] + box[3]) // 2), RED, 4, dashed=True)
    arrow(draw, (950, 825), (950, 920), NAVY, 4)
    canvas.save(path, quality=95)


def generate_diagrams() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    create_use_case_diagram(ASSET_DIR / "chapter-1-use-case.png")
    create_foundation_flow(ASSET_DIR / "chapter-1-foundation-flow.png")
    create_architecture_diagram(ASSET_DIR / "chapter-1-architecture.png")
    create_threat_diagram(ASSET_DIR / "chapter-1-threat-model.png")


def inline_markup(text: str) -> str:
    # ReportLab's standard paragraph engine does not perform Arabic shaping.
    # The Markdown source retains the Arabic product name; omit the parenthetical
    # Arabic token from the English-language PDF rather than render it incorrectly.
    text = text.replace(" (شفاء)", "")
    placeholders: list[str] = []

    def keep(value: str) -> str:
        placeholders.append(value)
        return f"@@TOKEN{len(placeholders) - 1}@@"

    def link_repl(match):
        label = escape(match.group(1))
        href = escape(match.group(2), {'"': '&quot;'})
        return keep(f'<link href="{href}" color="#{TEAL_DARK}"><u>{label}</u></link>')

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, text)
    text = re.sub(r"`([^`]+)`", lambda m: keep(f'<font name="Helvetica-Bold" color="#{TEAL_DARK}">{escape(m.group(1))}</font>'), text)
    text = escape(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    for index, value in enumerate(placeholders):
        text = text.replace(f"@@TOKEN{index}@@", value)
    return text


class AcademicDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="content")
        # Draw running furniture after flowables so white-background tables and
        # figures can never mask headers or page numbers on continuation pages.
        self.addPageTemplates(PageTemplate(id="academic", frames=[frame], onPageEnd=self.draw_page))

    def draw_page(self, canvas, doc):
        if doc.page <= 1:
            return
        canvas.saveState()
        width, height = A4
        canvas.setStrokeColor(hx(LINE))
        canvas.setLineWidth(0.6)
        canvas.line(doc.leftMargin, height - 16 * mm, width - doc.rightMargin, height - 16 * mm)
        canvas.setFont("Helvetica-Bold", 8.5)
        canvas.setFillColor(hx(TEAL_DARK))
        canvas.drawString(doc.leftMargin, height - 12.5 * mm, "EGYPTIAN CHINESE UNIVERSITY")
        canvas.setFont("Helvetica", 8.5)
        canvas.setFillColor(hx(MUTED))
        canvas.drawRightString(width - doc.rightMargin, height - 12.5 * mm, "SHIFAA — Chapter 1: Project Analysis")
        canvas.setStrokeColor(hx(LINE))
        canvas.line(doc.leftMargin, 14 * mm, width - doc.rightMargin, 14 * mm)
        canvas.setFont("Helvetica", 8.5)
        canvas.setFillColor(hx(MUTED))
        canvas.drawString(doc.leftMargin, 9.5 * mm, "Academic Year 2026/2027")
        canvas.drawRightString(width - doc.rightMargin, 9.5 * mm, f"Page {doc.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            style_name = flowable.style.name
            if style_name in ("SectionHeading", "SubsectionHeading"):
                level = 0 if style_name == "SectionHeading" else 1
                text = flowable.getPlainText()
                key = f"heading-{self.seq.nextf('heading')}"
                flowable._bookmarkName = key
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=level, closed=False)
                self.notify("TOCEntry", (level, text, self.page, key))


def build_styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "BodyAcademic", parent=base["BodyText"], fontName="Helvetica", fontSize=10.5,
            leading=14.2, textColor=hx(INK), alignment=TA_JUSTIFY,
            spaceBefore=0, spaceAfter=7,
        ),
        "section": ParagraphStyle(
            "SectionHeading", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=17,
            leading=20, textColor=hx(TEAL_DARK), spaceBefore=0, spaceAfter=10,
            keepWithNext=True,
        ),
        "subsection": ParagraphStyle(
            "SubsectionHeading", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13.2,
            leading=16, textColor=hx(NAVY), spaceBefore=12, spaceAfter=6,
            keepWithNext=True,
        ),
        "subsub": ParagraphStyle(
            "SubsubHeading", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=11.4,
            leading=14, textColor=hx(TEAL_DARK), spaceBefore=9, spaceAfter=4,
            keepWithNext=True,
        ),
        "caption": ParagraphStyle(
            "FigureCaption", parent=base["BodyText"], fontName="Helvetica-Oblique", fontSize=8.8,
            leading=11, textColor=hx(MUTED), alignment=TA_CENTER, spaceBefore=4, spaceAfter=11,
        ),
        "table": ParagraphStyle(
            "TableCell", parent=base["BodyText"], fontName="Helvetica", fontSize=8.3,
            leading=10.3, textColor=hx(INK), spaceAfter=0,
        ),
        "table_header": ParagraphStyle(
            "TableHeader", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=8.4,
            leading=10.4, textColor=colors.white, spaceAfter=0,
        ),
        "bullet": ParagraphStyle(
            "ListAcademic", parent=base["BodyText"], fontName="Helvetica", fontSize=10.2,
            leading=13.8, textColor=hx(INK), spaceAfter=3,
        ),
        "callout": ParagraphStyle(
            "AuthorityCallout", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5,
            leading=12.8, textColor=hx(INK), spaceAfter=0,
        ),
        "toc_title": ParagraphStyle(
            "TOCTitle", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=18,
            leading=22, textColor=hx(TEAL_DARK), spaceAfter=12,
        ),
    }


def cover_story(styles):
    story = []
    story.append(Spacer(1, 24 * mm))
    kicker = ParagraphStyle("CoverKicker", fontName="Helvetica-Bold", fontSize=11, leading=14,
                            textColor=hx(TEAL), alignment=TA_CENTER, spaceAfter=14)
    title = ParagraphStyle("CoverTitle", fontName="Helvetica-Bold", fontSize=30, leading=34,
                           textColor=hx(NAVY), alignment=TA_CENTER, spaceAfter=10)
    subtitle = ParagraphStyle("CoverSubtitle", fontName="Helvetica", fontSize=16, leading=20,
                              textColor=hx(TEAL_DARK), alignment=TA_CENTER, spaceAfter=26)
    meta = ParagraphStyle("CoverMeta", fontName="Helvetica", fontSize=11, leading=16,
                          textColor=hx(MUTED), alignment=TA_CENTER, spaceAfter=5)
    story.append(Paragraph("EGYPTIAN CHINESE UNIVERSITY", kicker))
    story.append(Paragraph("SHIFAA", title))
    story.append(Paragraph("Integrated Digital Health Platform for Egypt", subtitle))
    band = Table([[Paragraph("CHAPTER 1", ParagraphStyle("Band", fontName="Helvetica-Bold", fontSize=11,
                                                         textColor=colors.white, alignment=TA_CENTER))],
                  [Paragraph("PROJECT ANALYSIS", ParagraphStyle("Band2", fontName="Helvetica-Bold", fontSize=20,
                                                                 textColor=colors.white, alignment=TA_CENTER))]],
                 colWidths=[120 * mm], rowHeights=[10 * mm, 16 * mm])
    band.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), hx(TEAL_DARK)),
        ("BOX", (0, 0), (-1, -1), 0.8, hx(CYAN)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(band)
    story.append(Spacer(1, 32 * mm))
    story.append(Paragraph("Prepared by the SHIFAA Graduation Project Team", meta))
    story.append(Paragraph("Academic Year 2026/2027", meta))
    story.append(Paragraph("Document date: 9 August 2026", meta))
    story.append(Spacer(1, 16 * mm))
    rule = Table([[""]], colWidths=[65 * mm], rowHeights=[1.2 * mm])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), hx(GOLD))]))
    story.append(rule)
    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("Normative baseline: SHIFAA PRD v2.1.0 and Master Implementation Plan v2.1.0", meta))
    story.append(PageBreak())
    return story


def document_control(styles):
    story = [Paragraph("Document Control", styles["section"])]
    data = [
        ["Document", "Chapter 1 — Project Analysis"],
        ["Institution", "Egyptian Chinese University"],
        ["Project", "SHIFAA — Integrated Digital Health Platform for Egypt"],
        ["Academic year", "2026/2027"],
        ["Authority", "Academic adaptation; PRD/Master and supporting contracts remain normative"],
        ["Scope state", "92 active FRs; 3 reserved post-MVP donation FRs; 24 NFRs"],
        ["AI status", "Mandatory synthetic graduation track under ADR-014; model choice remains OPEN-AI-001"],
    ]
    rows = []
    for label, value in data:
        rows.append([Paragraph(f"<b>{escape(label)}</b>", styles["table"]), Paragraph(escape(value), styles["table"]),])
    table = Table(rows, colWidths=[42 * mm, 118 * mm], repeatRows=0, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.45, hx(LINE)),
        ("BACKGROUND", (0, 0), (0, -1), hx(PALE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)
    story.append(Spacer(1, 7 * mm))
    callout_text = ("<b>Authority notice.</b> This submission summarizes approved scope and architecture. "
                    "New system models, AI methodology and threat analysis are academic analysis only; they do not "
                    "silently amend the PRD, close an OPEN item or authorize production processing.")
    callout = Table([[Paragraph(callout_text, styles["callout"])]], colWidths=[160 * mm])
    callout.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), hx(TEAL_LIGHT)),
        ("BOX", (0, 0), (-1, -1), 0.8, hx(TEAL)),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(callout)
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph("Table of Contents", styles["toc_title"]))
    toc_rows = [
        ("Document Control", "2"),
        ("1. Project Overview", "3"),
        ("2. Background Study", "5"),
        ("3. System Analysis", "6"),
        ("4. System Modeling", "9"),
        ("5. Technical Planning", "12"),
        ("6. Data Science and Artificial Intelligence Components", "16"),
        ("7. Cybersecurity Components", "19"),
    ]
    toc_table = Table(
        [[Paragraph(f"<b>{escape(label)}</b>", styles["body"]),
          Paragraph(page, styles["body"])] for label, page in toc_rows],
        colWidths=[148 * mm, 12 * mm],
        hAlign="LEFT",
    )
    toc_table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.35, hx(LINE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(toc_table)
    story.append(PageBreak())
    return story


def parse_table(lines, index, styles):
    table_lines = []
    while index < len(lines) and lines[index].strip().startswith("|"):
        table_lines.append(lines[index].strip())
        index += 1
    raw_rows = [[cell.strip() for cell in row.strip("|").split("|")] for row in table_lines]
    if len(raw_rows) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in raw_rows[1]):
        raw_rows.pop(1)
    ncols = len(raw_rows[0])
    width = 168 * mm
    if ncols == 2:
        first_lengths = [len(r[0]) for r in raw_rows[1:] if r]
        first = max(34 * mm, min(60 * mm, (sum(first_lengths) / max(1, len(first_lengths))) * 1.6 * mm))
        col_widths = [first, width - first]
    elif ncols == 3:
        col_widths = [35 * mm, 58 * mm, 75 * mm]
    elif ncols == 4:
        col_widths = [25 * mm, 45 * mm, 53 * mm, 45 * mm]
    else:
        col_widths = [width / ncols] * ncols
    rows = []
    for ridx, row in enumerate(raw_rows):
        style = styles["table_header"] if ridx == 0 else styles["table"]
        rows.append([Paragraph(inline_markup(cell), style) for cell in row])
    table = Table(rows, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), hx(TEAL_DARK)),
        ("GRID", (0, 0), (-1, -1), 0.4, hx(LINE)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, hx(PALE)]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Spacer(1, 2), table, Spacer(1, 8)], index


def parse_list(lines, index, styles, ordered):
    items = []
    pattern = r"^\s*\d+\.\s+(.+)" if ordered else r"^\s*-\s+(.+)"
    while index < len(lines):
        match = re.match(pattern, lines[index])
        if not match:
            break
        items.append(ListItem(Paragraph(inline_markup(match.group(1)), styles["bullet"]), leftIndent=15))
        index += 1
    flow = ListFlowable(
        items,
        bulletType="1" if ordered else "bullet",
        start="1" if ordered else "•",
        leftIndent=18,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=9.5,
        bulletColor=hx(TEAL_DARK),
        spaceBefore=1,
        spaceAfter=7,
    )
    return [flow], index


def parse_markdown(styles):
    lines = MARKDOWN_PATH.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("## 1. "))
    lines = lines[start:]
    story = []
    index = 0
    section_count = 0
    while index < len(lines):
        stripped = lines[index].strip()
        if not stripped:
            index += 1
            continue
        if stripped == "---":
            story.append(Spacer(1, 4))
            index += 1
            continue
        if stripped.startswith("## "):
            section_count += 1
            story.append(Paragraph(inline_markup(stripped[3:]), styles["section"]))
            index += 1
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:]), styles["subsection"]))
            index += 1
            continue
        if stripped.startswith("#### "):
            story.append(Paragraph(inline_markup(stripped[5:]), styles["subsub"]))
            index += 1
            continue
        image_match = re.fullmatch(r"!\[([^\]]+)\]\(([^)]+)\)", stripped)
        if image_match:
            image_path = (DELIVERABLE_DIR / image_match.group(2)).resolve()
            with PILImage.open(image_path) as img:
                ratio = img.height / img.width
            width = 165 * mm
            height = width * ratio
            image_flow = Image(str(image_path), width=width, height=height)
            image_flow.hAlign = "CENTER"
            block = [image_flow]
            if index + 2 < len(lines):
                next_text = lines[index + 2].strip() if not lines[index + 1].strip() else lines[index + 1].strip()
                if next_text.startswith("**Figure"):
                    block.append(Paragraph(inline_markup(next_text), styles["caption"]))
                    index += 2 if not lines[index + 1].strip() else 1
            story.append(KeepTogether(block))
            index += 1
            continue
        if stripped.startswith("|"):
            flows, index = parse_table(lines, index, styles)
            story.extend(flows)
            continue
        if re.match(r"^\d+\.\s+", stripped):
            flows, index = parse_list(lines, index, styles, True)
            story.extend(flows)
            continue
        if re.match(r"^-\s+", stripped):
            flows, index = parse_list(lines, index, styles, False)
            story.extend(flows)
            continue
        if stripped.startswith("> "):
            quote_lines = []
            while index < len(lines) and lines[index].strip().startswith("> "):
                quote_lines.append(lines[index].strip()[2:])
                index += 1
            callout = Table([[Paragraph(inline_markup(" ".join(quote_lines)), styles["callout"])]], colWidths=[165 * mm])
            callout.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), hx(TEAL_LIGHT)),
                ("LINEBEFORE", (0, 0), (0, -1), 3, hx(TEAL)),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]))
            story.extend([callout, Spacer(1, 8)])
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            nxt = lines[index].strip()
            if not nxt or nxt.startswith(("#", "|", "- ", "> ", "![")) or re.match(r"^\d+\.\s+", nxt):
                break
            paragraph_lines.append(nxt)
            index += 1
        story.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))
    return story


def build_pdf() -> None:
    register_fonts()
    styles = build_styles()
    doc = AcademicDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=21 * mm,
        rightMargin=21 * mm,
        topMargin=27 * mm,
        bottomMargin=27 * mm,
        title="SHIFAA — Chapter 1: Project Analysis",
        author="SHIFAA Graduation Project Team",
        subject="Egyptian Chinese University Graduation Project",
        creator="SHIFAA Documentation Workflow",
    )
    story = cover_story(styles)
    story.extend(document_control(styles))
    story.extend(parse_markdown(styles))
    doc.build(story)


def main() -> None:
    generate_diagrams()
    build_pdf()
    print(PDF_PATH)


if __name__ == "__main__":
    main()
