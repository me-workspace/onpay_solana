"""Build WHITEPAPER.pdf from WHITEPAPER.md using Python-Markdown + headless MS Edge."""
import os
import subprocess
import sys
from pathlib import Path

import markdown

DOCS_DIR = Path(__file__).parent
MD_PATH = DOCS_DIR / "WHITEPAPER.md"
HTML_PATH = DOCS_DIR / "_whitepaper.html"
PDF_PATH = DOCS_DIR / "WHITEPAPER.pdf"

CSS = """
@page {
  size: A4;
  margin: 2cm 2cm 2.2cm 2cm;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: -apple-system, "Segoe UI", sans-serif;
    font-size: 9pt;
    color: #888;
  }
}

:root {
  --ink: #0f172a;
  --mute: #475569;
  --line: #e2e8f0;
  --brand: #14b8a6;
  --brand-dark: #0d9488;
  --bg-code: #f1f5f9;
  --bg-tech: #0f172a;
  --bg-tech-text: #e2e8f0;
}

* { box-sizing: border-box; }

html, body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: var(--ink);
  margin: 0;
  padding: 0;
}

/* Cover page */
.cover {
  page-break-after: always;
  min-height: 88vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 3rem 0;
  border-bottom: 4px solid var(--brand);
}
.cover h1 {
  font-size: 42pt;
  margin: 0 0 0.3em 0;
  color: var(--ink);
  letter-spacing: -1px;
  line-height: 1.05;
}
.cover .subtitle {
  font-size: 18pt;
  color: var(--brand-dark);
  margin: 0 0 2em 0;
  font-weight: 500;
}
.cover .meta {
  font-size: 11pt;
  color: var(--mute);
  line-height: 1.9;
}
.cover .meta strong { color: var(--ink); }

h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
  color: var(--ink);
  line-height: 1.25;
  page-break-after: avoid;
}

h1 {
  font-size: 24pt;
  margin-top: 2em;
  margin-bottom: 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 3px solid var(--brand);
  page-break-before: always;
}
h1:first-of-type { page-break-before: auto; }

h2 {
  font-size: 16pt;
  margin-top: 1.8em;
  margin-bottom: 0.5em;
  color: var(--brand-dark);
}

h3 {
  font-size: 13pt;
  margin-top: 1.5em;
  margin-bottom: 0.4em;
}

h4 {
  font-size: 11.5pt;
  margin-top: 1.2em;
  margin-bottom: 0.3em;
  color: var(--mute);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

p { margin: 0.6em 0; }

strong { color: var(--ink); font-weight: 600; }
em { color: var(--mute); }

ul, ol {
  margin: 0.6em 0;
  padding-left: 1.4em;
}
li { margin: 0.25em 0; }

blockquote {
  margin: 1em 0;
  padding: 0.7em 1.2em;
  border-left: 4px solid var(--brand);
  background: #f0fdfa;
  color: var(--mute);
  font-style: italic;
}
blockquote p { margin: 0.3em 0; }

code {
  font-family: "SF Mono", "Consolas", "Monaco", "Courier New", monospace;
  font-size: 9pt;
  background: var(--bg-code);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--brand-dark);
}

pre {
  background: var(--bg-tech);
  color: var(--bg-tech-text);
  padding: 1em 1.2em;
  border-radius: 6px;
  overflow-x: hidden;
  font-size: 8.5pt;
  line-height: 1.45;
  page-break-inside: avoid;
  white-space: pre-wrap;
  word-wrap: break-word;
}
pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}
th {
  background: var(--brand);
  color: #fff;
  text-align: left;
  padding: 7px 10px;
  font-weight: 600;
}
td {
  border-bottom: 1px solid var(--line);
  padding: 7px 10px;
  vertical-align: top;
}
tr:nth-child(even) td { background: #f8fafc; }

hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 2em 0;
}

a { color: var(--brand-dark); text-decoration: none; }

/* Table of contents list gets two columns */
.toc ul { list-style: none; padding-left: 0; }
.toc li { padding: 2px 0; font-size: 10pt; }

/* Page break helpers */
.page-break { page-break-before: always; }
"""


def main() -> int:
    if not MD_PATH.exists():
        print(f"ERROR: {MD_PATH} not found", file=sys.stderr)
        return 1

    md_text = MD_PATH.read_text(encoding="utf-8")

    # Strip YAML frontmatter if present
    if md_text.startswith("---"):
        end = md_text.find("---", 3)
        if end != -1:
            md_text = md_text[end + 3 :].lstrip()

    html_body = markdown.markdown(
        md_text,
        extensions=["extra", "tables", "fenced_code", "toc", "sane_lists", "nl2br"],
    )

    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>OnPay — Complete Project Document</title>
<style>{CSS}</style>
</head>
<body>
<div class="cover">
<h1>OnPay</h1>
<div class="subtitle">Any-to-Stable Payment Gateway on Solana</div>
<div class="meta">
<strong>Complete Project Document</strong> &mdash; Business &amp; Technical<br>
Version 1.0 &middot; April 2026<br>
<br>
Solana Frontier Hackathon 2026<br>
Colosseum &middot; Payments &amp; Remittance<br>
<br>
<em>Flexible Input, Stable Output &mdash; Built in Bali</em>
</div>
</div>
{html_body}
</body>
</html>
"""

    HTML_PATH.write_text(full_html, encoding="utf-8")
    print(f"Wrote HTML: {HTML_PATH}")

    # Find MS Edge
    edge_candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    edge = next((p for p in edge_candidates if Path(p).exists()), None)
    if not edge:
        print("ERROR: MS Edge not found at expected locations", file=sys.stderr)
        return 2

    html_uri = "file:///" + str(HTML_PATH).replace("\\", "/")

    cmd = [
        edge,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={PDF_PATH}",
        html_uri,
    ]
    print("Running:", " ".join(f'"{c}"' if " " in c else c for c in cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        print("Edge stderr:", result.stderr, file=sys.stderr)
        print("Edge stdout:", result.stdout, file=sys.stderr)
        return result.returncode

    if not PDF_PATH.exists():
        print("ERROR: PDF was not created", file=sys.stderr)
        return 3

    size_kb = PDF_PATH.stat().st_size / 1024
    print(f"OK: {PDF_PATH} ({size_kb:.1f} KB)")

    try:
        HTML_PATH.unlink()
    except Exception:
        pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
