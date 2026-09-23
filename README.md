# Bug Hunter Toolset

> [!NOTE]
> This document was written by AI.

A curated collection of offensive security, bug bounty, and reconnaissance automation tools.

---

## Tools Overview

| Tool | Language / Stack | Description |
| :--- | :--- | :--- |
| **[inscope](file:///c:/tools/bughunter_tool/inscope)** | Go | Blazing-fast scope filter for stdin streams supporting `.scope` file discovery, regexes, and negative patterns. |
| **[regexhunter](file:///c:/tools/bughunter_tool/regexhunter)** | Python / Chrome Extension | High-throughput regex extraction tool & browser extension for endpoint, secret, and pattern discovery. |
| **[cookie-cli](file:///c:/tools/bughunter_tool/cookie-cli)** | Node.js / Chrome Extension | Extract active session cookies directly from browser sessions into terminal workflows. |
| **[ifcp](file:///c:/tools/bughunter_tool/ifcp)** | Python / cURL | Advanced, high-efficiency web cache poisoning and unkeyed header reflection fuzzer. |
| **[fff](file:///c:/tools/bughunter_tool/fff)** | Go | Fairly Fast Fetcher — high-speed concurrent HTTP response retriever for stdin URLs. |
| **[zap](file:///c:/tools/bughunter_tool/zap)** | Bash | Web enumeration and reconnaissance automation script. |

---

## Directory Structure

```text
bughunter_tool/
├── cookie-cli/        # Browser session cookie extractor & CLI daemon
├── fff/               # High-speed HTTP response fetcher
├── ifcp/              # Cache poisoning fuzzer
├── inscope/           # Go scope filtering utility
├── regexhunter/       # Pattern & secret extraction tool and extension
├── zap/               # Web reconnaissance script
└── .gitignore         # Configured to ignore scopes, logs, binaries, and caches
```

---

## Quick Start

### `inscope`
```bash
cd inscope
go build -o inscope
cat urls.txt | ./inscope -u example.com
```

### `regexhunter`
```bash
cd regexhunter
pip install -e .
regexhunter --help
```

### `cookie-cli`
```bash
cd cookie-cli
npm install
node server.js
# In another terminal:
node cli.js -d example.com
```

---

## Contributing & Security

This repository is intended strictly for authorized security assessments and bug bounty engagements. Ensure proper authorization before testing any target.
