
# ZAP - URL Parameter Fuzzing & Extraction Tool

A powerful Bash script for URL parameter manipulation, fuzzing, and extraction. ZAP helps security researchers, bug bounty hunters, and penetration testers work with URLs more efficiently.

## Features

### 🔧 Parameter Manipulation
- **Replace all parameter values** with a custom word
- **Replace only first/last parameter** values
- **Append fuzz word** to existing parameter values
- Customizable fuzz word (default: `FUZZ`)

### 🔍 Extraction Modes
- **Directory names** - Extract all directory paths from URLs
- **Parameter keys** - Extract all query parameter names
- **Parameter values** - Extract all query parameter values  
- **Subdomains** - Extract all subdomain components
- **JavaScript files** - Filter and extract `.js` file URLs

## Installation

```bash
git clone https://github.com/def0ultt/zap.git
cd zap
chmod +x zap
sudo ln -s $(pwd)/zap /usr/local/bin/zap
```



## Usage

### Basic Parameter Fuzzing
```bash
# Replace all parameter values with "FUZZ"
cat urls.txt | zap

# Replace all parameter values with "TEST"
cat urls.txt | zap TEST

# Append "FUZZ" to all parameter values
cat urls.txt | zap -a

# Replace only the last parameter value
cat urls.txt | zap -f

# Replace only the first parameter value  
cat urls.txt | zap -s
# Replace only the first parameter value with xss payload  
cat urls.txt | zap '"/><script>alert(5)</script>' -s 
```

### Extraction Modes
```bash
# Extract directory names
cat urls.txt | zap -mode directory

# Extract parameter keys
cat urls.txt | zap -mode key

# Extract parameter values
cat urls.txt | zap -mode value

# Extract subdomains
cat urls.txt | zap -mode subdomain

# Extract JavaScript files
cat urls.txt | zap -mode js
```

## Examples

### Input URLs
```
https://shop.example.com/api/v1/users?id=123&token=abc&action=view
https://cdn.test.example.com/static/js/app.min.js?version=2.1
https://example.com/admin/dashboard/config?settings=default
```

### Example Outputs

**Parameter Fuzzing:**
```bash
cat urls.txt | zap
```
```
https://shop.example.com/api/v1/users?id=FUZZ&token=FUZZ&action=FUZZ
https://example.com/admin/dashboard/config?settings=FUZZ
```

**Extract Keys:**
```bash
cat urls.txt | zap -mode key
```
```
id
token
action
settings
```

**Extract Subdomains:**
```bash
cat urls.txt | zap -mode subdomain
```
```
shop
cdn
test
```

**Extract Directories:**
```bash
cat urls.txt | zap -mode directory
```
```
api
v1
users
admin
dashboard
config
```

**Extract JS Files:**
```bash
cat urls.txt | zap -mode js
```
```
https://cdn.test.example.com/static/js/app.min.js?version=2.1
```

## Options

| Option | Description |
|--------|-------------|
| `-f` | Replace only the last parameter value |
| `-s` | Replace only the first parameter value |
| `-a` | Append fuzz word to parameter values |
| `-mode directory` | Extract directory names from URL paths |
| `-mode key` | Extract parameter keys from query string |
| `-mode value` | Extract parameter values from query string |
| `-mode subdomain` | Extract subdomain names |
| `-mode js` | Extract URLs ending with .js extension |
| `-h` | Show help menu |

## Use Cases

### 🐛 Bug Bounty Hunting
- Quickly prepare URLs for parameter fuzzing
- Extract potential injection points
- Identify all JavaScript files for source code analysis

### 🔍 Reconnaissance  
- Map application structure via directories
- Discover all API endpoints and parameters
- Identify subdomains for broader attack surface

### 🛠️ Development & Testing
- Test API endpoints with different parameters
- Analyze URL structures in web applications
- Extract and audit JavaScript dependencies



## Installation Verification

After installation, verify it works:
```bash
echo "https://example.com/test?param=value" | zap
```
Should output:
```
https://example.com/test?param=FUZZ
```



## Disclaimer

This tool is intended for educational purposes, security research, and authorized testing only. Users are responsible for complying with all applicable laws and regulations.

## Support

If you find this tool useful, please give it a ⭐ on GitHub!


