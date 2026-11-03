#!/usr/bin/env bash
# Secret and privacy scan for the public copy. Usage: scripts/privacy-scan.sh <folder>
# Exits 1 and lists every hit if it finds API keys or tokens, this computer's username or home path,
# the git author's name or email, or any extra local-only pattern listed in .publish-private.
# Personal values are read at run time, so they are never written into the repository.
set -u
DIR="${1:?usage: privacy-scan.sh <folder>}"
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=dist-demo)
hits=0

# Documented placeholders, not real values.
PLACEHOLDERS='(your-key-here|<your[^>]*>|=[[:space:]]*$)'

check() { # label, extended regex, [extra grep flags]
  local label="$1" pattern="$2"; shift 2
  local found
  found=$(grep -rInE "${EXCLUDES[@]}" "$@" -e "$pattern" "$DIR" 2>/dev/null | grep -vE "$PLACEHOLDERS" | cut -c1-200)
  if [ -n "$found" ]; then
    echo "✗ $label"; echo "$found" | sed 's/^/    /'; hits=$((hits + 1))
  else
    echo "✓ $label"
  fi
}

check "Anthropic API keys" 'sk-ant-[A-Za-z0-9_-]{8,}'
check "API key variables with a value" '(ANTHROPIC_API_KEY|OPENAI_API_KEY|API_KEY)[[:space:]]*=[[:space:]]*[^[:space:]#]+'
check "Hard-coded keys, secrets or tokens" "(api[_-]?key|secret|access[_-]?token)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_./+=-]{16,}['\"]" -i
check "GitHub, AWS, Slack tokens or private keys" '(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)'
check "Long random-looking tokens (outside package-lock)" '[A-Za-z0-9+/]{40,}' --exclude=package-lock.json
check "This computer's username or home path" "($(whoami)|$HOME|/Users/[A-Za-z0-9._-]+/|C:\\\\Users\\\\)" -i
name=$(git config --global user.name 2>/dev/null || true); email=$(git config --global user.email 2>/dev/null || true)
[ -n "$name" ] && check "Git author name" "$name" -i
[ -n "$email" ] && check "Git author email" "$email" -i
check "Email addresses" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(edu|com|org|net|io)\b' --exclude=package-lock.json
# Extra local-only patterns (e.g. names tied to earlier versions), one regex per line, kept out of git.
PRIVATE="$(dirname "$0")/../.publish-private"
if [ -f "$PRIVATE" ]; then
  extra=$(grep -v '^#' "$PRIVATE" | grep -v '^[[:space:]]*$' | paste -sd '|' -)
  [ -n "$extra" ] && check "Local private patterns (.publish-private)" "($extra)"
else
  echo "! No .publish-private file: skipped the local private-pattern check"
fi
[ -f "$DIR/.env" ] && { echo "✗ .env file present"; hits=$((hits + 1)); }
if [ "$hits" -gt 0 ]; then echo "Privacy scan found $hits problem(s). Nothing was published."; exit 1; fi
echo "Privacy scan passed."
