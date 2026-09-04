#!/usr/bin/env python3
"""Render docket analysis memos to static HTML for the multi-docket site."""

from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TOOL = Path(__file__).resolve().parents[1]
OUT = TOOL / "site-overviews"

MEMOS = [
    {
        "docket": "FDA-2025-N-0287",
        "short": "FDA FHIR / RWD RFI",
        "source": ROOT / "FDA-2025-N-0287" / "FDA-2025-N-0287-comment-analysis.md",
        "dashboard": "./",
    },
    {
        "docket": "HHS-ONC-2026-0001",
        "short": "HHS Health Sector AI RFI",
        "source": ROOT / "HHS-ONC-2026-0001" / "HHS-ONC-2026-0001-comment-analysis.md",
        "dashboard": "./",
    },
]


def inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        r'<a href="\2">\1</a>',
        text,
    )
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    return text


def render_markdown(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    in_list = False
    list_tag = "ul"

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            out.append(f"</{list_tag}>")
            in_list = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?\s*:?-+", lines[i + 1].strip()):
            close_list()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            header = [c.strip() for c in rows[0].strip("|").split("|")]
            body = rows[2:]
            out.append("<table>")
            out.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in header) + "</tr></thead>")
            out.append("<tbody>")
            for row in body:
                cells = [c.strip() for c in row.strip("|").split("|")]
                out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
            out.append("</tbody></table>")
            continue

        if stripped == "---":
            close_list()
            out.append("<hr>")
            i += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading:
            close_list()
            level = len(heading.group(1))
            text = heading.group(2)
            slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
            out.append(f'<h{level} id="{slug}">{inline(text)}</h{level}>')
            i += 1
            continue

        ul = re.match(r"^[-*]\s+(.*)$", stripped)
        ol = re.match(r"^\d+\.\s+(.*)$", stripped)
        if ul or ol:
            tag = "ul" if ul else "ol"
            item = (ul or ol).group(1)
            if not in_list or list_tag != tag:
                close_list()
                list_tag = tag
                out.append(f"<{tag}>")
                in_list = True
            out.append(f"<li>{inline(item)}</li>")
            i += 1
            continue

        if stripped == "":
            close_list()
            i += 1
            continue

        close_list()
        para = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith("#") or nxt.startswith("|") or nxt == "---":
                break
            if re.match(r"^[-*]\s+", nxt) or re.match(r"^\d+\.\s+", nxt):
                break
            para.append(nxt)
            i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")

    close_list()
    return "\n".join(out)


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="stylesheet" href="../fonts/gotham.css">
  <style>
    :root {{
      --hl7-red: #ec2227;
      --hl7-black: #010101;
      --hl7-light-blue: #5f9baf;
      --hl7-blue: #005a8c;
      --hl7-green: #0f8e48;
      --hl7-aqua-dk: #29434D;
      --hl7-blue-dk: #001140;
      --hl7-dark-gray: #747679;
      --page-bg: #f3f5f6;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'HCo Gotham', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--page-bg);
      color: var(--hl7-black);
      line-height: 1.65;
    }}
    header {{
      background: var(--hl7-black);
      border-bottom: none;
      padding: 0;
    }}
    .brand-bar {{ height: 4px; background: var(--hl7-red); }}
    header .container {{ padding-top: 1.1rem; padding-bottom: 1.1rem; }}
    .container {{ max-width: 46rem; margin: 0 auto; padding: 0 1.25rem; }}
    .crumbs {{
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      font-size: 0.9rem;
    }}
    .crumbs a {{ color: var(--hl7-light-blue); text-decoration: none; }}
    .crumbs a:hover {{ color: #ffffff; text-decoration: underline; }}
    article {{ padding: 2.5rem 0 4rem; }}
    h1 {{ font-size: 1.9rem; line-height: 1.25; margin: 0 0 1rem; color: var(--hl7-blue-dk); }}
    h2 {{ font-size: 1.4rem; margin: 2.25rem 0 0.85rem; color: var(--hl7-blue-dk); }}
    h3 {{ font-size: 1.15rem; margin: 1.75rem 0 0.6rem; color: var(--hl7-aqua-dk); }}
    p {{ margin: 0.75rem 0; color: var(--hl7-aqua-dk); }}
    a {{ color: var(--hl7-blue); }}
    hr {{ border: 0; border-top: 1px solid #d4d6d8; margin: 1.75rem 0; }}
    ul, ol {{ margin: 0.6rem 0 0.9rem 1.25rem; color: var(--hl7-aqua-dk); }}
    li {{ margin: 0.35rem 0; }}
    code {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88em;
      background: #eef6fa;
      color: var(--hl7-blue-dk);
      padding: 0.1em 0.35em;
      border-radius: 0.25rem;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0 1.25rem;
      font-size: 0.92rem;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 17, 64, 0.06);
    }}
    th, td {{
      text-align: left;
      vertical-align: top;
      padding: 0.55rem 0.7rem;
      border-bottom: 1px solid #e4e6e8;
    }}
    th {{ background: #eef6fa; color: var(--hl7-blue); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }}
    td:last-child {{ text-align: inherit; }}
    footer {{
      text-align: center;
      padding: 2rem 0 2.5rem;
      color: var(--hl7-dark-gray);
      font-size: 0.875rem;
    }}
    footer a {{ color: var(--hl7-blue); text-decoration: none; }}
    @media (max-width: 640px) {{
      h1 {{ font-size: 1.55rem; }}
      table {{ display: block; overflow-x: auto; }}
    }}
  </style>
</head>
<body>
  <header>
    <div class="brand-bar"></div>
    <div class="container">
      <nav class="crumbs">
        <a href="../">← All dockets</a>
        <a href="{dashboard}">Browse comments</a>
      </nav>
    </div>
  </header>
  <main class="container">
    <article>
{body}
    </article>
  </main>
  <footer>
    <div class="container">
      Independent synthesis of public comments, not an agency position.
      · <a href="{dashboard}">Open the interactive dashboard</a>
    </div>
  </footer>
</body>
</html>
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for memo in MEMOS:
        md = memo["source"].read_text(encoding="utf-8")
        title = md.splitlines()[0].lstrip("# ").strip()
        body = render_markdown(md)
        html_out = TEMPLATE.format(
            title=html.escape(title),
            dashboard=memo["dashboard"],
            body=body,
        )
        dest = OUT / f"{memo['docket']}.html"
        dest.write_text(html_out, encoding="utf-8")
        print(f"wrote {dest}")


if __name__ == "__main__":
    main()
