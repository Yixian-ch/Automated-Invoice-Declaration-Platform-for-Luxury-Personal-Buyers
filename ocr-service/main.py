"""
LIDP OCR Microservice — PaddleOCR-based invoice parser.

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
from typing import Optional

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

# Initialise PaddleOCR once at startup — det+rec+cls for multilingual invoices
# lang='en' covers Latin scripts; add 'ch' for Chinese if needed
ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


# ─── Request / Response models ────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    content: str        # base64-encoded bytes
    mime_type: str = "application/pdf"


class OcrResult(BaseModel):
    invoice_number: Optional[str] = None
    purchase_date: Optional[str] = None   # ISO 8601 date string
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    brand_name: Optional[str] = None
    item_description: Optional[str] = None
    currency: Optional[str] = None
    subtotal_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    grand_total_amount: Optional[float] = None
    confidence: float = 0.0
    raw_text: str = ""


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pdf_to_images(data: bytes) -> list[np.ndarray]:
    """Convert each PDF page to a numpy array for PaddleOCR."""
    pil_images = convert_from_bytes(data, dpi=200)
    return [np.array(img) for img in pil_images]


def _image_to_array(data: bytes) -> list[np.ndarray]:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return [np.array(img)]


def _run_ocr(arrays: list[np.ndarray]) -> tuple[list[str], float]:
    """Run PaddleOCR on each page image.

    Groups word-level boxes into logical lines by Y-coordinate so that
    label+value pairs on the same row are kept together (e.g. "Total  1500.00").
    """
    all_boxes: list[tuple[float, float, str, float]] = []  # (y_mid, x_min, text, conf)

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
                # box is [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]
                ys = [pt[1] for pt in box]
                xs = [pt[0] for pt in box]
                y_mid = (min(ys) + max(ys)) / 2
                x_min = min(xs)
                all_boxes.append((y_mid, x_min, text, float(conf)))

    if not all_boxes:
        return [], 0.0

    # Sort by vertical position then horizontal
    all_boxes.sort(key=lambda b: (b[0], b[1]))

    # Group into lines: boxes within ~10px of each other vertically are the same row
    lines: list[str] = []
    confidences: list[float] = []
    current_row: list[tuple[float, float, str, float]] = []
    row_y: float = all_boxes[0][0]

    for box in all_boxes:
        if abs(box[0] - row_y) < 12:
            current_row.append(box)
        else:
            if current_row:
                current_row.sort(key=lambda b: b[1])
                lines.append(" ".join(b[2] for b in current_row))
                confidences.extend(b[3] for b in current_row)
            current_row = [box]
            row_y = box[0]

    if current_row:
        current_row.sort(key=lambda b: b[1])
        lines.append(" ".join(b[2] for b in current_row))
        confidences.extend(b[3] for b in current_row)

    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return lines, avg_conf


# ─── Field extraction heuristics ─────────────────────────────────────────────

_CURRENCY_MAP = {
    "€": "EUR", "eur": "EUR",
    "$": "USD", "usd": "USD",
    "£": "GBP", "gbp": "GBP",
    "¥": "CNY", "cny": "CNY", "rmb": "CNY",
    "¥": "JPY", "jpy": "JPY",
    "chf": "CHF",
}

_INVOICE_NO_RE = re.compile(
    r"(?:invoice|inv|facture|bill|receipt|reçu|no\.?|n°|ref\.?)[\s:#\-]*([A-Z0-9\-/]{3,20})",
    re.IGNORECASE,
)
_DATE_RE = re.compile(
    r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b"
)
_AMOUNT_RE = re.compile(r"[\d\s]{1,6}[.,]\d{2}")
_TOTAL_LABEL_RE = re.compile(
    r"(grand\s*total|total\s*(?:ttc|ht|amount|due|general)|montant\s*total|total)",
    re.IGNORECASE,
)
_TAX_LABEL_RE = re.compile(
    r"(tva|vat|tax|taxe|impôt)",
    re.IGNORECASE,
)
_SUBTOTAL_LABEL_RE = re.compile(
    r"(subtotal|sous.?total|ht|hors\s*taxe|net\s*amount)",
    re.IGNORECASE,
)


def _parse_amount(text: str) -> Optional[float]:
    """Extract the first decimal amount from a string."""
    m = _AMOUNT_RE.search(text)
    if not m:
        return None
    raw = m.group(0).replace(" ", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _detect_currency(lines: list[str]) -> Optional[str]:
    full = " ".join(lines).lower()
    for symbol, code in _CURRENCY_MAP.items():
        if symbol in full:
            return code
    # check ISO codes
    for code in ["EUR", "USD", "GBP", "CNY", "JPY", "CHF"]:
        if code in full.upper():
            return code
    # Infer from known European luxury retailers (FR/EU sites → EUR)
    if any("lafayette" in l.lower() or ".fr" in l.lower() for l in lines):
        return "EUR"
    return None


def _detect_vendor(lines: list[str]) -> Optional[str]:
    """Heuristic: vendor is usually in the first 5 non-empty lines,
    or can be inferred from a website URL found anywhere in the text."""
    # Try URL-based detection first (reliable)
    for line in lines:
        lower = line.lower()
        if "galerieslafayette" in lower:
            return "Galeries Lafayette"
        if "louisvuitton" in lower or "louis-vuitton" in lower:
            return "Louis Vuitton"
        if "dior.com" in lower:
            return "Dior"
        if "chanel.com" in lower:
            return "Chanel"
        if "hermes.com" in lower or "hermès.com" in lower:
            return "Hermès"
        if "gucci.com" in lower:
            return "Gucci"
    # Fallback to first non-empty line
    candidates = [l for l in lines[:8] if len(l) > 3]
    return candidates[0] if candidates else None


def _detect_brand(lines: list[str]) -> Optional[str]:
    luxury = [
        "Louis Vuitton", "LV", "Chanel", "Hermès", "Hermes", "Gucci", "Prada",
        "Christian Dior", "Dior", "Burberry", "Versace", "Givenchy", "Balenciaga", "Saint Laurent",
        "YSL", "Bottega Veneta", "Fendi", "Valentino", "Celine", "Loewe",
        "Moncler", "Off-White", "Rolex", "Cartier", "Tiffany", "Bulgari",
        "Van Cleef", "Patek", "Audemars",
    ]
    full = " ".join(lines)
    for brand in luxury:
        if brand.lower() in full.lower():
            return brand
    return None


def extract_fields(lines: list[str]) -> dict:
    full_text = "\n".join(lines)

    # Invoice number
    invoice_number: Optional[str] = None
    m = _INVOICE_NO_RE.search(full_text)
    if m:
        invoice_number = m.group(1).strip()

    # Date — pick the first date found
    purchase_date: Optional[str] = None
    dm = _DATE_RE.search(full_text)
    if dm:
        purchase_date = dm.group(1)

    # Amounts — scan lines for label then grab adjacent amount
    grand_total: Optional[float] = None
    tax_amount: Optional[float] = None
    subtotal: Optional[float] = None

    for i, line in enumerate(lines):
        combined = line + (" " + lines[i + 1] if i + 1 < len(lines) else "")
        if _TOTAL_LABEL_RE.search(line) and grand_total is None:
            grand_total = _parse_amount(combined)
        if _TAX_LABEL_RE.search(line) and tax_amount is None:
            tax_amount = _parse_amount(combined)
        if _SUBTOTAL_LABEL_RE.search(line) and subtotal is None:
            subtotal = _parse_amount(combined)

    # Fallback: if no labeled total found, use the largest numeric amount in the text
    if grand_total is None:
        all_amounts = [_parse_amount(l) for l in lines]
        valid = sorted([a for a in all_amounts if a is not None and a > 0], reverse=True)
        if valid:
            grand_total = valid[0]
            # If tax was not found via label, use the amount near a TVA/20% line
            if tax_amount is None and len(valid) >= 2:
                for i, line in enumerate(lines):
                    if re.search(r"\b(tva|t\.v\.a|vat|tax|taxe|20%|19%)\b", line, re.IGNORECASE):
                        amt = _parse_amount(line)
                        if amt is None and i + 1 < len(lines):
                            amt = _parse_amount(lines[i + 1])
                        if amt and amt < grand_total:
                            tax_amount = amt
                            break

    # Vendor & brand
    vendor = _detect_vendor(lines)
    brand = _detect_brand(lines)

    # Item description — look for lines after "description", "item", "article"
    item_desc: Optional[str] = None
    for i, line in enumerate(lines):
        if re.search(r"\b(description|item|article|produit|désignation)\b", line, re.IGNORECASE):
            if i + 1 < len(lines):
                item_desc = lines[i + 1]
            break

    # Address — look for lines with typical address patterns (digits + street keywords)
    vendor_address: Optional[str] = None
    addr_re = re.compile(r"\d+.*?(rue|avenue|ave|blvd|street|str|road|rd|place|pl)\b", re.IGNORECASE)
    for line in lines:
        if addr_re.search(line):
            vendor_address = line
            break

    return {
        "invoice_number": invoice_number,
        "purchase_date": purchase_date,
        "vendor_name": vendor,
        "vendor_address": vendor_address,
        "brand_name": brand,
        "item_description": item_desc,
        "currency": _detect_currency(lines),
        "subtotal_amount": subtotal,
        "tax_amount": tax_amount,
        "grand_total_amount": grand_total,
    }


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

        lines, confidence = _run_ocr(arrays)
        fields = extract_fields(lines)

        return OcrResult(
            **fields,
            confidence=round(confidence, 4),
            raw_text="\n".join(lines),
        )
    except Exception as exc:
        logger.exception("OCR processing failed")
        raise HTTPException(status_code=500, detail=str(exc))
