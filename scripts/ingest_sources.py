"""Download primary-source PDFs and build FINN's reproducible page-aware corpus.

Usage: python scripts/ingest_sources.py [--refresh] [--offline]
Requires pypdf. Add official URLs and metadata to data/sources.json for more issuers.
Dates are document/announcement dates, not necessarily the financial period end.
PDF page numbers are one-based physical pages, suitable for URL #page anchors.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def chunks_for_page(text: str, limit: int = 1500, overlap: int = 150):
    text = re.sub(r"\s+", " ", text).strip()
    cursor = 0
    while cursor < len(text):
        end = min(cursor + limit, len(text))
        if end < len(text):
            boundary = text.rfind(" ", cursor + 1000, end)
            if boundary > cursor:
                end = boundary
        chunk = text[cursor:end].strip()
        if chunk:
            yield chunk
        if end == len(text):
            break
        cursor = max(cursor + 1, end - overlap)


def download(url: str, target: Path):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 FINN-Research/0.1"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=75) as response:
                payload = response.read(40 * 1024 * 1024 + 1)
            if len(payload) > 40 * 1024 * 1024:
                raise ValueError("PDF exceeds the 40 MB ingestion limit")
            if not payload.lstrip().startswith(b"%PDF"):
                raise ValueError("Source did not return a PDF")
            temporary = target.with_suffix(".pdf.part")
            temporary.write_bytes(payload)
            temporary.replace(target)
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    (DATA / "raw").mkdir(parents=True, exist_ok=True)
    sources = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))
    documents, chunks, failures = [], [], []
    for source in sources:
        try:
            target = DATA / "raw" / f"{source['id']}.pdf"
            if not target.exists() or args.refresh:
                if args.offline:
                    raise FileNotFoundError(f"Missing offline PDF: {target.name}")
                download(source["url"], target)
            reader = PdfReader(target)
            document = {**source, "pages": len(reader.pages), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
            count_before = len(chunks)
            for page_number, page in enumerate(reader.pages, 1):
                for index, text in enumerate(chunks_for_page(page.extract_text() or ""), 1):
                    chunks.append({"id": f"{source['id']}-p{page_number}-c{index}", "documentId": source["id"], "ticker": source["ticker"], "page": page_number, "text": text})
            if len(chunks) == count_before:
                raise ValueError("No extractable text; OCR is required")
            documents.append(document)
            print(f"OK {source['id']}: {len(reader.pages)} pages, {len(chunks) - count_before} chunks", flush=True)
        except Exception as error:
            failures.append({"id": source["id"], "error": str(error)})
            print(f"FAILED {source['id']}: {error}", flush=True)
    corpus = {"documents": documents, "chunks": chunks}
    (DATA / "corpus.json").write_text(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "ingestion-report.json").write_text(json.dumps({"documents": len(documents), "chunks": len(chunks), "failures": failures}, indent=2), encoding="utf-8")
    print(f"Built corpus: {len(documents)} documents, {len(chunks)} chunks; {len(failures)} failed")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
