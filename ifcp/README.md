# ifcp - Web Cache Poisoning & Reflection Fuzzer

> [!NOTE]
> This document was written by AI.

`ifcp` is an advanced, high-efficiency Cache Poisoning Fuzzer optimized for large-scale bug bounty reconnaissance and authorized penetration testing. It automatically injects deterministically isolated payloads across unkeyed HTTP headers concurrently to identify cache poisoning, redirect hijackings, and header reflections with 0% false positive rates.

---

## Features

- **Bulk Header Execution**: Injects **28+** unkeyed headers (`X-Forwarded-Host`, `X-Forwarded-Scheme`, `X-Original-Url`, etc.) simultaneously in batched HTTP requests to reduce bandwidth overhead by ~90%.
- **Deterministic Payload Tracking**: Generates isolated strings tagged per header to ensure organic reflections never trigger false positives.
- **Multi-Strategy Cache Routing**:
  - Standard Query: `?cp_probe=X`
  - Unkeyed Query Parameter: `?X=1`
  - Path Routing: `/X`
- **Smart Severity Analysis**: Analyzes `X-Cache`, `CF-Cache-Status`, `Age`, `X-Served-By`, and more to accurately distinguish **HIGH** (direct Cache Hit on clean probe) from **MEDIUM** (poisoning on unkeyed parameter/path) and **LOW** (isolated Header Reflection).
- **URL Normalization CPDoS Detection (`-un`)**: Detects Cache Poisoned Denial of Service via delimiter and normalization discrepancies (`%3F`, `%23`, `%2F`, `\`, `%5C`).
- **Structured Visual Reporting**: Clean box-drawing cards per vulnerability with real-time badges, cache evidence, and an executive scan summary report.
- **NDJSON Streaming**: Pipe `-j` / `--json` cleanly into `jq` or file storage.

---

## Installation

```bash
git clone https://github.com/def0ultt/ifcp.git
cd ifcp
chmod +x ifcp
sudo ln -s $(pwd)/ifcp /usr/local/bin/ifcp
```

Requires Python 3 and `requests`:
```bash
pip install requests
```

---

## Quick Start

### Test a Single URL
```bash
echo "https://example.com/login" | ifcp
```

### Pipe Subdomains or URLs
```bash
cat subdomains.txt | inscope | httpx -silent | ifcp
```

### Full Normalization CPDoS Testing with Unique Host Filter
```bash
cat urls.txt | ifcp -un -u -v
```

### Authenticated Scanning Through Proxy
```bash
cat urls.txt | ifcp -H "Cookie: session=abc123" -x "http://127.0.0.1:8080"
```

### Machine-Readable NDJSON Stream
```bash
cat urls.txt | ifcp -j > findings.jsonl
```

---

## Output Preview

```text
╭─ 🎯 TARGET: api.example.com  (2 findings) ─────────────────────────────────────╮
╰───────────────────────────────────────────────────────────────────────────────╯
┌── [ HIGH ] Cache Poisoning via X-Forwarded-Host ──────────────────────────────
│ Type      : Cache Poisoning (Severity: HIGH)   [ CACHE HIT ]
│ Header    : X-Forwarded-Host: https://cp_9x8a1b_x_forwarded_host.com
│ Strategy  : path_based, standard_query
│ Response  : HTTP 200 (15,420 bytes)
│ Evidence  : Resource Injection (src/href attribute), Response Body Reflection
│ Cache Info: X-Cache: HIT, Age: 42, CF-Cache-Status: HIT
│ Base URL  : https://api.example.com/v1/auth
│ Probe URL : https://api.example.com/v1/auth?cp_probe=cp_9x8a1b
└───────────────────────────────────────────────────────────────────────────────

════════════════════════════════════════════════════════════════════════════════
                            SCAN SUMMARY REPORT                            
════════════════════════════════════════════════════════════════════════════════
  URLs Tested            : 15
  Unique Target Hosts    : 2
  Total Findings         : 3
    • High Severity (Cache Hit) : 1
    • Medium Severity           : 1
    • Low Severity (Reflection) : 1
────────────────────────────────────────────────────────────────────────────────
  Top Headers Reflected / Poisoned:
    • X-Forwarded-Host          : 1 occurrence(s)
    • Contact                   : 1 occurrence(s)
════════════════════════════════════════════════════════════════════════════════
```

---

## Flags & Arguments

| Flag | Long Flag | Description |
| :--- | :--- | :--- |
| `-H` | `--header` | Custom HTTP header (can be specified multiple times) |
| `-w` | `--wordlist` | Custom header wordlist (one per line) |
| `-t` | `--timeout` | Request timeout in seconds (Default: `10`) |
| `-x` | `--proxy` | HTTP/SOCKS proxy (e.g. `http://127.0.0.1:8080`) |
| `-u` | `--unique` | Return only the single highest-severity finding per host |
| `-un`| `--url-normalization` | Enable URL normalization CPDoS detection |
| `-v` | `--verbose` | Print live scanning progress to `stderr` |
| `-q` | `--quiet` | Quiet mode: suppress banners, output only findings |
| | `--no-banner` | Suppress the ASCII logo banner |
| | `--no-color` | Disable ANSI color formatting |
| `-j` | `--json` | Output results in JSON Lines (NDJSON) format |

---

## Disclaimer

This tool is designed strictly for authorized penetration testing and bug bounty engagements. Do not test systems without proper authorization.
