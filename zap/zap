#!/bin/bash
FUZZ_WORD="FUZZ"
CHANGE_LAST=false
CHANGE_FIRST=false
APPEND_MODE=false
EXTRACT_DIRECTORIES=false
EXTRACT_KEYS=false
EXTRACT_VALUES=false
EXTRACT_SUBDOMAINS=false
EXTRACT_JS=false

show_help() {
  cat << EOF
Usage: zap [FUZZ_WORD] [OPTIONS]

Options:
  -f        Replace only the last parameter value
  -s        Replace only the first parameter value
  -a        Append FUZZ_WORD to parameter values instead of replacing
  -mode directory    Extract directory names from URLs
  -mode key          Extract parameter keys from query string
  -mode value        Extract parameter values from query string
  -mode subdomain    Extract subdomain names from URLs
  -mode js           Extract URLs that end with .js extension
  -h        Show this help menu

Example Usage:
  cat urls.txt | zap               # Replace all parameter values with "FUZZ"
  cat urls.txt | zap TEST          # Replace all parameter values with "TEST"
  cat urls.txt | zap -a            # Append "FUZZ" to all parameter values
  cat urls.txt | zap -s -a         # Append "FUZZ" only to the first parameter value
  cat urls.txt | zap -mode directory # Extract all directory names
  cat urls.txt | zap -mode key     # Extract all parameter keys
  cat urls.txt | zap -mode value   # Extract all parameter values
  cat urls.txt | zap -mode subdomain # Extract all subdomain names
  cat urls.txt | zap -mode js      # Extract all JavaScript URLs
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f) CHANGE_LAST=true ;;
    -s) CHANGE_FIRST=true ;;
    -a) APPEND_MODE=true ;;
    -mode) 
      case "$2" in
        directory) EXTRACT_DIRECTORIES=true ;;
        key) EXTRACT_KEYS=true ;;
        value) EXTRACT_VALUES=true ;;
        subdomain) EXTRACT_SUBDOMAINS=true ;;
        js) EXTRACT_JS=true ;;
        *) 
          echo "Error: Unknown mode '$2'. Use 'directory', 'key', 'value', 'subdomain', or 'js'."
          exit 1
          ;;
      esac
      shift
      ;;
    -h) show_help; exit 0 ;;
    *) FUZZ_WORD="$1" ;;
  esac
  shift
done

# Escape special characters for sed
ESCAPED_FUZZ=$(printf '%s\n' "$FUZZ_WORD" | sed -e 's/[\/&]/\\&/g')

# Read URLs from stdin
while IFS= read -r line; do
  if $EXTRACT_DIRECTORIES; then
    # Extract directories from URL path (between slashes and before ?)
    # Remove protocol and domain, then extract path directories
    PATH_PART="${line#*://*/}"  # Remove protocol and domain
    PATH_PART="${PATH_PART%%\?*}"  # Remove query string
    PATH_PART="${PATH_PART%%#*}"   # Remove fragment
    
    # Split by slashes and extract directory names
    IFS='/' read -ra DIRS <<< "$PATH_PART"
    for dir in "${DIRS[@]}"; do
      # Only output non-empty directory names
      if [[ -n "$dir" && "$dir" != *"."* ]]; then
        echo "$dir"
      fi
    done
  elif $EXTRACT_KEYS; then
    # Extract parameter keys from query string (between ? and = or & and =)
    if [[ "$line" == *"?"* && "$line" == *"="* ]]; then
      QUERY="${line#*\?}"
      QUERY="${QUERY%%#*}"  # Remove fragment if present
      for param in ${QUERY//&/ }; do
        if [[ "$param" == *"="* ]]; then
          echo "${param%%=*}"
        fi
      done
    fi
  elif $EXTRACT_VALUES; then
    # Extract parameter values from query string (between = and & or after =)
    if [[ "$line" == *"?"* && "$line" == *"="* ]]; then
      QUERY="${line#*\?}"
      QUERY="${QUERY%%#*}"  # Remove fragment if present
      for param in ${QUERY//&/ }; do
        if [[ "$param" == *"="* ]]; then
          echo "${param#*=}"
        fi
      done
    fi
  elif $EXTRACT_SUBDOMAINS; then
    # Extract subdomains from URL
    if [[ "$line" == *"://"* ]]; then
      # Remove protocol
      DOMAIN_PART="${line#*://}"
      # Remove path, query string and fragment
      DOMAIN_PART="${DOMAIN_PART%%/*}"
      DOMAIN_PART="${DOMAIN_PART%%\?*}"
      DOMAIN_PART="${DOMAIN_PART%%#*}"
      
      # Remove port if present
      DOMAIN_PART="${DOMAIN_PART%:*}"
      
      # Split domain by dots
      IFS='.' read -ra DOMAIN_PARTS <<< "$DOMAIN_PART"
      
      # If we have at least 3 parts (subdomain.domain.tld), extract subdomains
      if [[ ${#DOMAIN_PARTS[@]} -ge 3 ]]; then
        # All parts except the last two (domain and TLD) are subdomains
        for ((i=0; i<${#DOMAIN_PARTS[@]}-2; i++)); do
          echo "${DOMAIN_PARTS[$i]}"
        done
      fi
    fi
  elif $EXTRACT_JS; then
    # Extract URLs that end with .js extension
    if [[ "$line" == *".js"* ]]; then
      # Check if the URL path ends with .js (ignoring query parameters and fragments)
      PATH_PART="${line#*://*/}"
      PATH_PART="${PATH_PART%%\?*}"
      PATH_PART="${PATH_PART%%#*}"
      
      if [[ "$PATH_PART" == *".js" ]]; then
        echo "$line"
      fi
    fi
  else
    if [[ "$line" == *"="* ]]; then
      if $CHANGE_LAST || $CHANGE_FIRST; then
        IFS='&' read -ra PARAMS <<< "${line#*\?}"
        BASE="${line%%\?*}"

        if $CHANGE_LAST; then
          INDEX=$((${#PARAMS[@]}-1))
        else
          INDEX=0
        fi

        KEY=${PARAMS[$INDEX]%%=*}
        VALUE=${PARAMS[$INDEX]#*=}

        if $APPEND_MODE; then
          PARAMS[$INDEX]="$KEY=${VALUE}${ESCAPED_FUZZ}" 
        else
          PARAMS[$INDEX]="$KEY=${ESCAPED_FUZZ}"
        fi

        echo "$BASE?$(IFS='&'; echo "${PARAMS[*]}")"
      else
        if $APPEND_MODE; then
          echo "$line" | sed -E "s|=([^&]*)|=\1${ESCAPED_FUZZ}|g"
        else
          echo "$line" | sed -E "s|=[^&]*|=${ESCAPED_FUZZ}|g"
        fi
      fi
    fi
  fi
done | sort -u
