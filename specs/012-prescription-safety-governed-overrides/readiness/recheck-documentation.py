"""Read-only repository documentation scan. JSON goes to stdout; no files are written.

Run with python -B. Scans tracked textual docs plus untracked readiness docs,
hashes PDFs and optionally extracts text using the existing pypdf installation.
Findings are review candidates, never clinical/legal or governance approvals.
"""
import collections
import hashlib
import importlib.metadata
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[3]
PACKAGE = Path(__file__).resolve().parent
TEXT = {'.md', '.mdx', '.txt', '.rst', '.adoc'}
BINARY = {'.pdf', '.docx', '.odt'}


def git(*args):
    return subprocess.check_output(['git', '-c', 'core.longpaths=true', '-C', str(ROOT), *args]).decode('utf-8').strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def visible(text):
    # Ignore code fences/inline code while preserving source offsets.
    text = re.sub(r'(?ms)^\s*(`{3,}|~{3,})[^\n]*\n.*?^\s*\1\s*$',
                  lambda m: re.sub(r'[^\n]', ' ', m.group()), text)
    return re.sub(r'`[^`\n]+`', lambda m: ' ' * len(m.group()), text)


def heading_slugs(text):
    slugs, duplicates = set(), collections.Counter()
    for heading in re.findall(r'(?m)^#{1,6}\s+(.+?)\s*#*\s*$', visible(text)):
        base = heading.lower().replace(' ', '-')
        base = ''.join(c for c in base if c in '-_' or unicodedata.category(c)[0] in 'LN')
        index = duplicates[base]
        duplicates[base] += 1
        slugs.add(base + (f'-{index}' if index else ''))
    slugs.update(re.findall(r'(?:id|name)=[\"\']([^\"\']+)', text))
    return slugs


def rows(path, pattern):
    return [line for line in path.read_text(encoding='utf-8-sig').splitlines()
            if re.match(pattern, line)]


tracked = git('ls-files', '-z').split('\0')
tracked = [p for p in tracked if p]
untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0')
local_docs = [p for p in untracked if p and
              p.startswith(PACKAGE.relative_to(ROOT).as_posix() + '/') and
              Path(p).suffix.lower() in TEXT | BINARY]
paths = sorted(set(p for p in tracked if Path(p).suffix.lower() in TEXT | BINARY) | set(local_docs))
inventory, issues, claims, pdfs = [], [], [], []
counts = collections.Counter()
risk = re.compile(r'approved|authorization|production.ready|preservation.PASS|'
                  r'PRE_SPECIFY|PLAN_DRAFTED|23 open|open items|27/23/60/6/3|'
                  r'taskstoissues|Spec Kit|OPEN-[A-Z]+-\d{3}', re.I)
for name in paths:
    path = ROOT / name
    item = {'path': name, 'sha256': digest(path), 'bytes': path.stat().st_size,
            'tracked': name in tracked, 'kind': 'historical-feature-record' if name.startswith('specs/0')
            and not name.startswith(PACKAGE.relative_to(ROOT).as_posix()) else 'current-or-supporting-document'}
    counts[path.suffix.lower()] += 1
    if path.suffix.lower() in BINARY:
        if path.suffix.lower() == '.pdf':
            try:
                from pypdf import PdfReader
                reader = PdfReader(path)
                pages = [page.extract_text() or '' for page in reader.pages]
                pdfs.append({'path': name, 'pages': len(pages), 'textCharacters': sum(map(len, pages)),
                             'readerVersion': importlib.metadata.version('pypdf'),
                             'riskMatches': [{'page': i + 1, 'text': line[:400]} for i, page in enumerate(pages)
                                             for line in page.splitlines() if risk.search(line)],
                             'limitation': 'Text extraction only; layout and external/legal claims not validated.'})
            except (ImportError, OSError, ValueError) as exc:
                issues.append({'path': name, 'kind': 'unread-binary', 'detail': str(exc)})
        else:
            issues.append({'path': name, 'kind': 'unread-binary', 'detail': 'Inventory only; needs explicit review.'})
        inventory.append(item)
        continue
    text = path.read_text(encoding='utf-8-sig')
    item['lines'] = len(text.splitlines())
    inventory.append(item)
    for number, line in enumerate(text.splitlines(), 1):
        if risk.search(line):
            claims.append({'path': name, 'line': number, 'text': line[:700], 'status': 'CANDIDATE_NOT_VERIFIED'})
    if path.suffix.lower() not in {'.md', '.mdx'}:
        continue
    cleaned = visible(text)
    targets = []
    # Inline links (balanced path parentheses are outside this bounded parser).
    for match in re.finditer(r'!?\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+[^)]+)?\)', cleaned):
        targets.append((match.start(), match.group(1).strip('<>')))
    # Definitions cover reference-style targets once per definition.
    for match in re.finditer(r'(?m)^\s*\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)', cleaned):
        targets.append((match.start(), match.group(1).strip('<>')))
    for offset, target in targets:
        counts['links'] += 1
        line = cleaned.count('\n', 0, offset) + 1
        if re.match(r'^(https?://|mailto:|app:|codex:|plugin:|data:)', target, re.I):
            counts['external-or-app-links-not-fetched'] += 1
            continue
        if '<' in target or '>' in target or '*' in target or '{' in target:
            issues.append({'path': name, 'line': line, 'target': target, 'kind': 'template-link'})
            continue
        if re.match(r'^(?:[A-Z]:[\\/]|file:|/D:|/C:)', target, re.I):
            issues.append({'path': name, 'line': line, 'target': target, 'kind': 'machine-specific-link'})
            continue
        parsed = urlsplit(target)
        destination = unquote(parsed.path)
        resolved = ROOT / destination.lstrip('/') if destination.startswith('/') else path.parent / destination
        if not destination:
            resolved = path
        resolved = resolved.resolve()
        if not resolved.exists():
            issues.append({'path': name, 'line': line, 'target': target, 'kind': 'missing-local-target'})
            continue
        counts['existing-local-targets'] += 1
        anchor = unquote(parsed.fragment)
        if not anchor or not resolved.is_file():
            continue
        bound = re.fullmatch(r'L(\d+)(?:-L?(\d+))?', anchor)
        if bound:
            lines = len(resolved.read_text(encoding='utf-8-sig').splitlines())
            first, last = int(bound[1]), int(bound[2] or bound[1])
            if not 1 <= first <= last <= lines:
                issues.append({'path': name, 'line': line, 'target': target, 'kind': 'invalid-line-range'})
        elif resolved.suffix.lower() in {'.md', '.mdx'} and anchor not in heading_slugs(resolved.read_text(encoding='utf-8-sig')):
            issues.append({'path': name, 'line': line, 'target': target, 'kind': 'heading-anchor-review-candidate'})

coverage = ROOT / 'docs/governance/SHIFAA-Completion-Coverage.md'
ledgers = {}
for family in ('FR', 'NFR'):
    entries = rows(coverage, rf'^\|\s*{family}-[A-Z0-9]+-\d{{3}}\s*\|\s*(DONE|PARTIAL|PLANNED|BLOCKED|DEFERRED_POST_MVP)\s*\|')
    ledgers[family] = {'rows': len(entries), 'categories': dict(collections.Counter(row.split('|')[2].strip() for row in entries)),
                       'uniqueIds': len(set(row.split('|')[1].strip() for row in entries))}
def remaining_register(path, section):
    text = path.read_text(encoding='utf-8-sig')
    selected = re.search(rf'(?ms)^### {section} Remaining open items\s*\n(.*?)(?=^## |\Z)', text).group(1)
    return [line for line in selected.splitlines() if re.match(r'^\|\s*OPEN-[A-Z]+-\d{3}\s*\|', line)]

prd = remaining_register(ROOT / 'shifaa-prd.md', '10.2')
master = remaining_register(ROOT / 'SHIFAA-Implementation-Plan-MASTER.md', '14.2')
normalize = lambda entries: {row.split('|')[1].strip(): [v.strip() for v in row.split('|')[1:7]] for row in entries}
catalog = rows(ROOT / 'docs/architecture/SHIFAA-API-Catalog.md', r'^\|\s*`[A-Za-z][A-Za-z0-9]+`\s*\|\s*`(?:GET|POST|PATCH|PUT|DELETE)\b')
print(json.dumps({'recordKind': 'READ_ONLY_DOCUMENTATION_RECHECK_CANDIDATES',
                  'runtime': {'python': sys.version, 'git': git('--version')},
                  'base': {'root': str(ROOT), 'branch': git('branch', '--show-current'), 'head': git('rev-parse', 'HEAD'),
                           'originMain': git('rev-parse', 'origin/main')},
                  'counts': dict(counts), 'trackedMarkdown': sum(Path(p).suffix.lower() in {'.md', '.mdx'} for p in tracked),
                  'inventory': inventory, 'linkIssues': issues, 'riskClaimCandidates': claims, 'pdfExtraction': pdfs,
                  'coverageLedger': ledgers, 'canonicalOpenRegister': {'PRD': len(prd), 'Master': len(master),
                      'uniquePRD': len(normalize(prd)), 'firstSixColumnsMatch': normalize(prd) == normalize(master)},
                  'catalogHttpRows': len(catalog),
                  'limitations': ['Scans every tracked textual document and local readiness text; historical records are not rewritten.',
                                  'Regex risk matches are candidates, not approval findings or proof.',
                                  'Links inside code fences, dynamic MDX, nested link parentheses and implicit shortcut references are not fully parsed.',
                                  'Heading slugs are approximate; review candidates require manual confirmation.',
                                  'External links not fetched; clinical/legal facts and present vendor/licensing validity not established.',
                                  'No lifecycle command, database reset, verification harness or runtime test executed.']}, indent=2, ensure_ascii=True))
