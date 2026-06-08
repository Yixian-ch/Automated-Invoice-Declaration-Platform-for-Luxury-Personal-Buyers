"""
LIDP OCR Microservice — PaddleOCR-based invoice parser.

Specialised for French Bordereau de Vente à l'Exportation (BVE) documents,
with fallback heuristics for general luxury-retail invoices.

POST /process
  Body: { "content": "<base64>", "mime_type": "application/pdf" | "image/jpeg" | ... }
  Returns: OcrResult JSON

GET /health
  Returns: { "status": "ok" }
"""

from __future__ import annotations

import base64
import io
import logging
import re
import tempfile
import os
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
from pdf2image import convert_from_bytes
from PIL import Image
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr-service")

app = FastAPI(title="LIDP OCR Service")

ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


# ─── Request / Response models ────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    content: str        # base64-encoded bytes
    mime_type: str = "application/pdf"


class ExtractedField(BaseModel):
    """A single extracted field with its confidence score."""
    value: Any = None
    confidence: float = 0.0


class LineItem(BaseModel):
    description: str
    quantity: Optional[float] = None
    amount_ttc: Optional[float] = None
    confidence: float = 0.0


class OcrResult(BaseModel):
    # Core fields (vetoed below 0.6)
    merchant_name: ExtractedField = ExtractedField()
    purchase_date: ExtractedField = ExtractedField()
    grand_total_amount: ExtractedField = ExtractedField()
    # Non-core fields
    buyer_name: ExtractedField = ExtractedField()
    line_items: list[LineItem] = []
    # Validation
    arithmetic_check: Optional[str] = None   # "pass" | "fail" | None
    needs_review: bool = False
    review_reasons: list[str] = []
    # Overall
    confidence: float = 0.0
    raw_text: str = ""


# ─── Image helpers ────────────────────────────────────────────────────────────

def _pdf_to_images(data: bytes) -> list[np.ndarray]:
    pil_images = convert_from_bytes(data, dpi=200)
    return [np.array(img) for img in pil_images]


def _image_to_array(data: bytes) -> list[np.ndarray]:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return [np.array(img)]


def _run_ocr(
    arrays: list[np.ndarray],
) -> tuple[list[str], float, list[tuple[float, float, float, str, float]], float]:
    """Run PaddleOCR; group word boxes into logical lines by Y proximity.

    Returns (lines, avg_confidence, raw_boxes, page_width) where raw_boxes is a
    flat list of (y_mid, x_min, x_max, text, conf) sorted by (y_mid, x_min),
    preserving individual word-level coordinates for column-aware extraction.
    page_width is the pixel width of the first page image.
    """
    all_boxes: list[tuple[float, float, float, str, float]] = []
    page_width: float = float(arrays[0].shape[1]) if arrays else 1000.0

    for arr in arrays:
        result = ocr_engine.ocr(arr, cls=True)
        if not result:
            continue
        for page in result:
            if not page:
                continue
            for item in page:
                box, (text, conf) = item[0], item[1]
                text = text.strip()
                if not text:
                    continue
                ys = [pt[1] for pt in box]
                xs = [pt[0] for pt in box]
                y_mid = (min(ys) + max(ys)) / 2
                x_min = min(xs)
                x_max = max(xs)
                all_boxes.append((y_mid, x_min, x_max, text, float(conf)))

    if not all_boxes:
        return [], 0.0, [], page_width

    all_boxes.sort(key=lambda b: (b[0], b[1]))

    lines: list[str] = []
    confidences: list[float] = []
    current_row: list[tuple[float, float, float, str, float]] = []
    row_y: float = all_boxes[0][0]

    for box in all_boxes:
        if abs(box[0] - row_y) < 12:
            current_row.append(box)
        else:
            if current_row:
                current_row.sort(key=lambda b: b[1])
                lines.append(" ".join(b[3] for b in current_row))
                confidences.extend(b[4] for b in current_row)
            current_row = [box]
            row_y = box[0]

    if current_row:
        current_row.sort(key=lambda b: b[1])
        lines.append(" ".join(b[3] for b in current_row))
        confidences.extend(b[4] for b in current_row)

    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return lines, avg_conf, all_boxes, page_width


# ─── Amount parsing ───────────────────────────────────────────────────────────

# Matches French-style amounts: "1 380,00" "10 603,00" or dot-decimal "1380.00"
_AMOUNT_FR_RE = re.compile(r"\b([\d][\d\s]{0,9}[,]\d{2})\b")
_AMOUNT_EN_RE = re.compile(r"\b([\d][\d\s]{0,9}[.]\d{2})\b")


def _parse_amount(text: str) -> Optional[float]:
    """Parse a decimal amount from French (1 380,00) or English (1380.00) notation."""
    m = _AMOUNT_FR_RE.search(text)
    if m:
        raw = m.group(1).replace(" ", "").replace(",", ".")
        try:
            return float(raw)
        except ValueError:
            pass
    m2 = _AMOUNT_EN_RE.search(text)
    if m2:
        raw = m2.group(1).replace(" ", "")
        try:
            return float(raw)
        except ValueError:
            pass
    return None


# ─── BVE-specific extraction ──────────────────────────────────────────────────

# Section headers on a BVE
_BVE_MARKER_RE = re.compile(
    r"bordereau\s+de\s+vente|BVE|détaxe|vente\s+à\s+l.export",
    re.IGNORECASE,
)
_BVE_MERCHANT_HDR_RE = re.compile(r"COMMER[CÇ]ANT", re.IGNORECASE)
_BVE_BUYER_HDR_RE = re.compile(r"ACHETEUR", re.IGNORECASE)
_BVE_ITEMS_HDR_RE = re.compile(r"MARCHANDISES", re.IGNORECASE)
_BVE_DATE_RE = re.compile(
    r"date\s+d[\'’][\xc9e]?mission\s+(?:du\s+)?BVE\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    re.IGNORECASE,
)
_BVE_TOTAL_RE = re.compile(
    r"montant\s+total\s+TTC\s*[:\-]?\s*([\d\s]+[,.]\d{2})",
    re.IGNORECASE,
)

# Fallback generic patterns
_DATE_RE = re.compile(
    r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b"
)
_TOTAL_LABEL_RE = re.compile(
    r"(grand\s*total|total\s*(?:ttc|ht|amount|due|general)|montant\s*total|total\s+g[eé]n[eé]ral|total)",
    re.IGNORECASE,
)
_INVOICE_NO_RE = re.compile(
    r"(?:invoice|inv|facture|bill|receipt|re[çc]u|no\.?|n°|ref\.?)[\s:#\-]*([A-Z0-9\-/]{3,20})",
    re.IGNORECASE,
)


def _is_bve(lines: list[str]) -> bool:
    full = "\n".join(lines[:30])
    return bool(_BVE_MARKER_RE.search(full))


_COL_TOLERANCE = 50  # px — how far outside a header's x range we still accept


def _col_boxes(
    boxes: list[tuple[float, float, float, str, float]],
    hdr_box: tuple[float, float, float, str, float],
) -> list[tuple[float, float, float, str, float]]:
    """Return boxes strictly below hdr_box whose x range overlaps the header column."""
    hdr_y = hdr_box[0]
    col_x_min = hdr_box[1] - _COL_TOLERANCE
    col_x_max = hdr_box[2] + _COL_TOLERANCE
    return [
        b for b in boxes
        if b[0] > hdr_y          # below the header
        and b[1] >= col_x_min    # box starts within column
        and b[2] <= col_x_max    # box ends within column
        and b[3].strip()         # non-empty
    ]


def _find_hdr_box(
    boxes: list[tuple[float, float, float, str, float]],
    pattern: re.Pattern,
) -> Optional[tuple[float, float, float, str, float]]:
    """Find the first raw box whose text matches pattern."""
    for b in boxes:
        if pattern.search(b[3]):
            return b
    return None


def _extract_bve(
    lines: list[str],
    boxes: list[tuple[float, float, float, str, float]],
    page_width: float = 1000.0,
) -> OcrResult:
    """BVE-specialised extractor: section-aware, column-filtered, per-field confidence."""
    full_text = "\n".join(lines)
    review_reasons: list[str] = []

    # ── merchant_name ──────────────────────────────────────────────────────
    # BVE has three columns side-by-side: COMMERÇANT | ACHETEUR | OPERATEUR.
    # OCR merges same-Y boxes into one line, mixing all three columns.
    # Fix: find the COMMERÇANT header box, then only take boxes directly below
    # it that fall within that column's X range (± tolerance).
    merchant_name = ExtractedField()
    merch_hdr = _find_hdr_box(boxes, _BVE_MERCHANT_HDR_RE)
    if merch_hdr is not None:
        col_boxes = _col_boxes(boxes, merch_hdr)
        for b in col_boxes:
            candidate = b[3].strip()
            if len(candidate) >= 3 and not re.match(r"^\d+", candidate):
                conf = 0.93 if candidate.isupper() else 0.78
                merchant_name = ExtractedField(value=candidate, confidence=conf)
                break
    # Fallback: line-scan (used when boxes are unavailable or column empty)
    if merchant_name.value is None:
        for i, line in enumerate(lines):
            if _BVE_MERCHANT_HDR_RE.search(line):
                for j in range(i + 1, min(i + 4, len(lines))):
                    candidate = lines[j].strip()
                    if len(candidate) >= 3 and not re.match(r"^\d+", candidate):
                        conf = 0.93 if candidate.isupper() else 0.78
                        merchant_name = ExtractedField(value=candidate, confidence=conf)
                        break
                break
    if merchant_name.value is None:
        # URL-based fallback (lower confidence)
        for line in lines:
            lower = line.lower()
            for known, name in [
                ("samaritaine", "LA SAMARITAINE"),
                ("galerieslafayette", "GALERIES LAFAYETTE"),
                ("lafayette", "GALERIES LAFAYETTE"),
                ("louisvuitton", "LOUIS VUITTON"),
                ("louis-vuitton", "LOUIS VUITTON"),
                ("dior.com", "CHRISTIAN DIOR"),
                ("chanel.com", "CHANEL"),
                ("hermes.com", "HERMÈS"),
                ("hermès.com", "HERMÈS"),
                ("gucci.com", "GUCCI"),
                ("printemps", "PRINTEMPS"),
            ]:
                if known in lower:
                    merchant_name = ExtractedField(value=name, confidence=0.72)
                    break
            if merchant_name.value:
                break

    # ── purchase_date ──────────────────────────────────────────────────────
    purchase_date = ExtractedField()
    m = _BVE_DATE_RE.search(full_text)
    if m:
        purchase_date = ExtractedField(value=m.group(1), confidence=0.93)
    else:
        for line in lines:
            if re.search(r"\bdate\b", line, re.IGNORECASE):
                dm = _DATE_RE.search(line)
                if dm:
                    purchase_date = ExtractedField(value=dm.group(1), confidence=0.65)
                    break
        if purchase_date.value is None:
            dm = _DATE_RE.search(full_text)
            if dm:
                purchase_date = ExtractedField(value=dm.group(1), confidence=0.50)

    # ── grand_total_amount ─────────────────────────────────────────────────
    grand_total = ExtractedField()
    m = _BVE_TOTAL_RE.search(full_text)
    if m:
        amt = _parse_amount(m.group(1))
        if amt is not None:
            grand_total = ExtractedField(value=amt, confidence=0.97)
    if grand_total.value is None:
        for i, line in enumerate(lines):
            if _TOTAL_LABEL_RE.search(line):
                combined = line + (" " + lines[i + 1] if i + 1 < len(lines) else "")
                amt = _parse_amount(combined)
                if amt is not None:
                    grand_total = ExtractedField(value=amt, confidence=0.70)
                    break

    # ── buyer_name — also column-filtered to avoid OPERATEUR text ──────────
    buyer_name = ExtractedField()
    buyer_hdr = _find_hdr_box(boxes, _BVE_BUYER_HDR_RE)
    if buyer_hdr is not None:
        col_boxes = _col_boxes(boxes, buyer_hdr)
        nom: Optional[str] = None
        prenom: Optional[str] = None
        for b in col_boxes[:8]:
            chunk = b[3].strip()
            nm = re.search(r"[Nn]om\s*[:\-]?\s*(.+)", chunk)
            pm = re.search(r"[Pp]r[ée]nom\s*[:\-]?\s*(.+)", chunk)
            if nm:
                nom = nm.group(1).strip()
            if pm:
                prenom = pm.group(1).strip()
            if not nm and not pm and re.match(r"^[A-Z]{2,}", chunk):
                nom = chunk
        if nom or prenom:
            parts = " ".join(p for p in [prenom, nom] if p)
            buyer_name = ExtractedField(value=parts or None, confidence=0.82)
    # Fallback: line-scan
    if buyer_name.value is None:
        for i, line in enumerate(lines):
            if _BVE_BUYER_HDR_RE.search(line):
                nom = None
                prenom = None
                for j in range(i + 1, min(i + 8, len(lines))):
                    chunk = lines[j].strip()
                    nm = re.search(r"[Nn]om\s*[:\-]?\s*(.+)", chunk)
                    pm = re.search(r"[Pp]r[ée]nom\s*[:\-]?\s*(.+)", chunk)
                    if nm:
                        nom = nm.group(1).strip()
                    if pm:
                        prenom = pm.group(1).strip()
                    if not nm and not pm and re.match(r"^[A-Z]{2,}", chunk):
                        nom = chunk
                if nom or prenom:
                    parts = " ".join(p for p in [prenom, nom] if p)
                    buyer_name = ExtractedField(value=parts or None, confidence=0.82)
                break

    # ── line_items (column-aware using raw box X coordinates) ─────────────
    # MARCHANDISES table columns (left→right):
    #   N° | Description | Numéro d'identification | Quantité | Taux TVA | Montant TVA | Montant TTC
    # X boundaries as fractions of page_width (empirically measured on BVE PDFs):
    #   Description  : 0%–55%
    #   Quantité     : 55%–68%  (small integer, e.g. "1", "2")
    #   Taux TVA     : 62%–72%  (contains "20,00%" — skip for extraction)
    #   Montant TVA  : 70%–82%
    #   Montant TTC  : 78%–100% (rightmost — this is what we want for amount_ttc)
    line_items: list[LineItem] = []

    _SECTION_END_RE = re.compile(
        r"(ACHETEUR|COMMER[CÇ]ANT|TOTAL\s+TTC|montant\s+total)",
        re.IGNORECASE,
    )
    _HDR_ROW_RE = re.compile(
        r"(d[eé]signation|quantit[eé]|montant|taux|description|n[°o]\b|num[eé]ro|identification)",
        re.IGNORECASE,
    )

    items_hdr = _find_hdr_box(boxes, _BVE_ITEMS_HDR_RE)
    if items_hdr is not None:
        section_start_y = items_hdr[0]

        section_end_y = float("inf")
        for b in boxes:
            if b[0] > section_start_y and _SECTION_END_RE.search(b[3]):
                section_end_y = b[0]
                break

        section_boxes = [
            b for b in boxes
            if section_start_y < b[0] < section_end_y
        ]

        # Column X cut-offs
        desc_x_max = page_width * 0.55
        qty_x_min  = page_width * 0.50
        qty_x_max  = page_width * 0.70
        ttc_x_min  = page_width * 0.78

        # Group section boxes into rows by Y proximity (15 px tolerance)
        rows: list[list[tuple]] = []
        cur_row: list[tuple] = []
        cur_y: float = section_boxes[0][0] if section_boxes else 0.0
        for b in section_boxes:
            if abs(b[0] - cur_y) < 15:
                cur_row.append(b)
            else:
                if cur_row:
                    rows.append(sorted(cur_row, key=lambda x: x[1]))
                cur_row = [b]
                cur_y = b[0]
        if cur_row:
            rows.append(sorted(cur_row, key=lambda x: x[1]))

        for row in rows:
            row_text = " ".join(b[3] for b in row)
            if _HDR_ROW_RE.search(row_text):
                continue

            # Description: leftmost boxes that contain letters
            desc_boxes = [
                b for b in row
                if b[2] <= desc_x_max and re.search(r"[A-Za-zÀ-ÿ]{2,}", b[3])
            ]
            if not desc_boxes:
                continue
            description = " ".join(b[3] for b in sorted(desc_boxes, key=lambda x: x[1]))
            if len(description) < 3:
                continue

            # Quantity: boxes in Quantité column, explicitly excluding "%" values
            qty: Optional[float] = None
            qty_boxes = [
                b for b in row
                if b[1] >= qty_x_min and b[2] <= qty_x_max and "%" not in b[3]
            ]
            for qb in qty_boxes:
                qm = re.fullmatch(r"(\d+(?:[,.]\d+)?)", qb[3].strip())
                if qm:
                    try:
                        qty = float(qm.group(1).replace(",", "."))
                        break
                    except ValueError:
                        pass

            # Montant TTC: rightmost column (not Montant TVA)
            amt_ttc: Optional[float] = None
            ttc_boxes = sorted(
                [b for b in row if b[1] >= ttc_x_min],
                key=lambda x: x[1],
            )
            for tb in ttc_boxes:
                amt = _parse_amount(tb[3])
                if amt is not None:
                    amt_ttc = amt
                    break
            # Fallback: rightmost box in the row that parses as an amount
            if amt_ttc is None:
                for rb in sorted(row, key=lambda x: -x[1]):
                    amt = _parse_amount(rb[3])
                    if amt is not None:
                        amt_ttc = amt
                        break

            conf = 0.85 if amt_ttc is not None else 0.55
            line_items.append(LineItem(
                description=description,
                quantity=qty,
                amount_ttc=amt_ttc,
                confidence=conf,
            ))

    else:
        # Fallback: line-based extraction when no box data available for MARCHANDISES
        in_table = False
        for i, line in enumerate(lines):
            if _BVE_ITEMS_HDR_RE.search(line):
                in_table = True
                continue
            if not in_table:
                continue
            if re.search(r"(ACHETEUR|COMMER[CÇ]ANT|TOTAL\s+TTC|montant\s+total)", line, re.IGNORECASE):
                break
            amt = _parse_amount(line)
            if re.search(r"(d[eé]signation|quantit[eé]|montant|amount|description)", line, re.IGNORECASE):
                continue
            if not re.search(r"[A-Za-zÀ-ÿ]{3,}", line):
                continue
            qty_m = re.search(r"\b([1-9]\d?)\b", line)
            qty = float(qty_m.group(1)) if qty_m else None
            desc_raw = re.split(r"\s+\d[\d\s]*[,.]", line)[0].strip()
            if not desc_raw:
                desc_raw = re.sub(r"[\d\s,.:]+$", "", line).strip()
            if len(desc_raw) < 3:
                continue
            conf = 0.85 if amt is not None else 0.55
            line_items.append(LineItem(
                description=desc_raw,
                quantity=qty,
                amount_ttc=amt,
                confidence=conf,
            ))

    # ── arithmetic_check ───────────────────────────────────────────────────
    arithmetic_check: Optional[str] = None
    if line_items and grand_total.value is not None:
        items_with_amount = [li for li in line_items if li.amount_ttc is not None]
        if items_with_amount:
            items_sum = sum(li.amount_ttc for li in items_with_amount)
            diff = abs(items_sum - grand_total.value)
            arithmetic_check = "pass" if diff < 0.01 else "fail"

    # ── needs_review ──────────────────────────────────────────────────────
    CORE_THRESHOLD = 0.6
    if merchant_name.confidence < CORE_THRESHOLD:
        review_reasons.append(f"merchant_name confidence too low ({merchant_name.confidence:.2f})")
    if purchase_date.confidence < CORE_THRESHOLD:
        review_reasons.append(f"purchase_date confidence too low ({purchase_date.confidence:.2f})")
    if grand_total.confidence < CORE_THRESHOLD:
        review_reasons.append(f"grand_total_amount confidence too low ({grand_total.confidence:.2f})")
    if arithmetic_check == "fail":
        review_reasons.append("arithmetic check failed: line items sum ≠ grand total")

    needs_review = len(review_reasons) > 0

    # ── overall confidence ─────────────────────────────────────────────────
    core_confs = [merchant_name.confidence, purchase_date.confidence, grand_total.confidence]
    overall = round(sum(core_confs) / len(core_confs), 4)

    return OcrResult(
        merchant_name=merchant_name,
        purchase_date=purchase_date,
        grand_total_amount=grand_total,
        buyer_name=buyer_name,
        line_items=line_items,
        arithmetic_check=arithmetic_check,
        needs_review=needs_review,
        review_reasons=review_reasons,
        confidence=overall,
        raw_text="\n".join(lines),
    )


def _extract_generic(lines: list[str]) -> OcrResult:
    """Fallback extractor for non-BVE invoices (best-effort heuristics)."""
    full_text = "\n".join(lines)
    review_reasons: list[str] = []

    # merchant_name — first meaningful line, or URL-based
    merchant_val: Optional[str] = None
    merchant_conf = 0.50
    for line in lines:
        lower = line.lower()
        for keyword, name in [
            ("galerieslafayette", "Galeries Lafayette"),
            ("lafayette", "Galeries Lafayette"),
            ("louisvuitton", "Louis Vuitton"),
            ("louis-vuitton", "Louis Vuitton"),
            ("dior.com", "Dior"),
            ("chanel.com", "Chanel"),
            ("hermes.com", "Hermès"),
            ("printemps", "Printemps"),
        ]:
            if keyword in lower:
                merchant_val, merchant_conf = name, 0.80
                break
        if merchant_val:
            break
    if not merchant_val:
        candidates = [l for l in lines[:8] if len(l) > 3]
        if candidates:
            merchant_val = candidates[0]
            merchant_conf = 0.50

    # purchase_date
    date_val: Optional[str] = None
    date_conf = 0.0
    dm = _DATE_RE.search(full_text)
    if dm:
        date_val = dm.group(1)
        date_conf = 0.60

    # grand_total_amount
    total_val: Optional[float] = None
    total_conf = 0.0
    for i, line in enumerate(lines):
        if _TOTAL_LABEL_RE.search(line):
            combined = line + (" " + lines[i + 1] if i + 1 < len(lines) else "")
            amt = _parse_amount(combined)
            if amt is not None:
                total_val, total_conf = amt, 0.70
                break
    if total_val is None:
        all_amounts = sorted(
            [a for a in (_parse_amount(l) for l in lines) if a is not None and a > 0],
            reverse=True,
        )
        if all_amounts:
            total_val, total_conf = all_amounts[0], 0.45

    CORE_THRESHOLD = 0.6
    if merchant_conf < CORE_THRESHOLD:
        review_reasons.append(f"merchant_name confidence too low ({merchant_conf:.2f})")
    if date_conf < CORE_THRESHOLD:
        review_reasons.append(f"purchase_date confidence too low ({date_conf:.2f})")
    if total_conf < CORE_THRESHOLD:
        review_reasons.append(f"grand_total_amount confidence too low ({total_conf:.2f})")

    needs_review = len(review_reasons) > 0
    core_confs = [merchant_conf, date_conf, total_conf]
    overall = round(sum(core_confs) / len(core_confs), 4)

    return OcrResult(
        merchant_name=ExtractedField(value=merchant_val, confidence=merchant_conf),
        purchase_date=ExtractedField(value=date_val, confidence=date_conf),
        grand_total_amount=ExtractedField(value=total_val, confidence=total_conf),
        buyer_name=ExtractedField(),
        line_items=[],
        arithmetic_check=None,
        needs_review=needs_review,
        review_reasons=review_reasons,
        confidence=overall,
        raw_text="\n".join(lines),
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process", response_model=OcrResult)
def process(req: ProcessRequest):
    try:
        data = base64.b64decode(req.content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 content")

    try:
        mime = req.mime_type.lower()
        if "pdf" in mime:
            arrays = _pdf_to_images(data)
        else:
            arrays = _image_to_array(data)

        lines, _, boxes, page_width = _run_ocr(arrays)

        if _is_bve(lines):
            logger.info("Detected BVE document — using BVE extractor")
            result = _extract_bve(lines, boxes, page_width)
        else:
            logger.info("Non-BVE document — using generic extractor")
            result = _extract_generic(lines)

        return result

    except Exception as exc:
        logger.exception("OCR processing failed")
        raise HTTPException(status_code=500, detail=str(exc))
