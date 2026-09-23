# inscope

> [!NOTE]
> This document was written by AI.

A blazing-fast, lightweight scope filter written in Go designed for bug bounty hunters and penetration testers. Filter subdomains, URLs, and endpoints from standard input (`stdin`) to guarantee only authorized targets pass through your automation pipelines.

---

## Features

- **Hierarchical Scope Discovery**: Searches for a `.scope` file in the current working directory and recursively walks up parent directories until one is found.
- **Negative Scope Rules (Antipatterns)**: Prefix any line in `.scope` with `!` to explicitly exclude out-of-scope domains or targets.
- **Relative Path Preservation**: Automatically preserves relative paths (e.g., `/api/v1/users`, `./main.js`, `v2/graphql`) so web crawlers and JS scrapers don't drop valuable endpoints.
- **Protocol & URL Normalization**: Handles full URLs (`https://`, `http://`), protocol-relative URLs (`//sub.domain.com`), and extracts hostnames accurately for scope matching.
- **Quick Checks Without a File**:
  - `-u <domains>`: Quick domain check for one or more comma-separated domains (automatically covers the apex domain and all subdomains).
  - `-E <regex>`: Quick regular expression check.
- **Zero External Dependencies**: Built entirely using Go's standard library.

---

## Installation

### From Source

```bash
git clone https://github.com/<your-username>/inscope.git
cd inscope
go build -o inscope
```

To install directly into your `$GOPATH/bin`:

```bash
go install .
```

---

## Usage

### 1. Using a `.scope` File

Create a `.scope` file in your target directory (or any parent directory):

```text
# Match example.com and all subdomains
(^|\.)example\.com$

# Match another authorized target
(^|\.)target-api\.net$

# Exclude third-party services or out-of-scope targets
!out-of-scope\.example\.com$
!zendesk\.com$
```

Pipe your tool output directly into `inscope`:

```bash
cat subdomains.txt | inscope
```

```bash
subfinder -d example.com -silent | inscope | httpx -silent
```

```bash
katana -u https://example.com -silent | inscope
```

```bash
gau example.com | inscope > inscope-urls.txt
```

---

### 2. Quick Domain Check (`-u`)

Filter inputs for a domain and all its subdomains on the fly without creating a `.scope` file:

```bash
cat urls.txt | inscope -u example.com
```

You can pass multiple comma-separated domains:

```bash
cat urls.txt | inscope -u "example.com,api-target.com"
```

---

### 3. Quick Regex Check (`-E`)

Filter using a custom regular expression pattern:

```bash
cat hosts.txt | inscope -E '^.*\.prod\.internal\.domain\.com$'
```

---

## CLI Options

| Flag | Description | Example |
| :--- | :--- | :--- |
| `-u` | Quick domain check (matches domain and subdomains) | `-u example.com` or `-u "example.com,other.org"` |
| `-E` | Quick regex pattern check | `-E '(?i).*\.target\.com'` |
| `-h` | Display help and usage information | `-h` |

---

## License

MIT License.
