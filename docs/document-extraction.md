# Company document extraction

Open **Documents** to choose any NSE ticker and find primary disclosures. Select a discovered PDF and choose **Index document**; the server verifies the source and issuer, extracts physical PDF pages and builds cited research passages. **Inspect extracted text** opens the result before research. You can also upload an original annual report or earnings-call transcript with company, reporting period and date.

The library filters by company or free text and exposes **Inspect text**, original PDF and company research. The inspector switches physical PDF pages and exports text or JSON, including metadata, passages and SHA-256 where available. New imports retain full extracted page text. Existing bundled documents and older browser imports expose their indexed passages instead; overlaps are labelled, and these are not claimed to be a complete PDF transcription.

Imported text remains in IndexedDB on the current browser/device. Parsing runs on the server. Relevant passages go to the configured model for research. This is not cross-device document storage. User-uploaded issuer and period labels are supplied by the uploader and are not independently verified. Discovery checks issuer identity but unknown reporting periods remain unspecified.

Text PDFs up to 15 MB / 350 pages are supported. Scans require external OCR first. Text reading order and tabular layout may need comparison with the original PDF. No OCR or universal financial table extraction is claimed.

Verification: real 24-page HCLTech PDF upload preserves all page texts, creates research chunks, and matches the original file's SHA-256. Shared-document extraction is isolated by document/issuer, retains physical pages and rejects unknown IDs. Non-PDF uploads are rejected before indexing.
