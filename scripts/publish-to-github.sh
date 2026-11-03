#!/usr/bin/env bash
# npm run publish:github — publish committed MobiPet changes to the public GitHub repository.
#
# Development happens in this folder; the public repository is a separate copy in ../mobipet-github
# with its own, unrelated history. This script never pushes from this folder: it copies the committed
# files across (minus local-only ones), runs the privacy scan, shows what changed, and only on "y"
# commits and pushes `main` from the public copy.
set -euo pipefail

DEV="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$(cd "$DEV/.." && pwd)/mobipet-github"
GIT_PUB=(git -C "$PUB")

die() { echo "✗ $*" >&2; exit 1; }

# Safety checks
[ -d "$PUB/.git" ] || die "No public copy at $PUB (expected a separate git repository)."
[ -z "$(git -C "$DEV" status --porcelain)" ] || die "This folder has uncommitted changes. Commit them first (locally), then publish."
[ -z "$(git -C "$DEV" remote)" ] || die "This development repository has a git remote. It must never have one: remove it before publishing."
pub_root="$("${GIT_PUB[@]}" rev-list --max-parents=0 HEAD | tail -1)"
if git -C "$DEV" cat-file -e "${pub_root}^{commit}" 2>/dev/null; then
  die "The public copy shares history with this folder. Refusing to publish."
fi
[ -z "$("${GIT_PUB[@]}" status --porcelain)" ] || die "The public copy has uncommitted changes. Review them in $PUB first."

# Pick up anything edited on GitHub (for example the README team section) before syncing.
"${GIT_PUB[@]}" pull --ff-only --quiet origin main

# Sync
# Committed files only, minus local docs, tooling, data and secrets. .env.example is the only env file.
EXCLUDE='^(CLAUDE\.md|docs/|\.claude/|\.vscode/|\.idea/|server/data/|dist/|dist-demo/|node_modules/|\.gitignore$|\.github/|\.publish-)'
# More local-only paths, kept out of git so their names never reach the public copy.
LOCAL_EXCLUDE="$DEV/.publish-exclude"
[ -f "$LOCAL_EXCLUDE" ] || die "Missing $LOCAL_EXCLUDE (local list of paths never to publish). Refusing to publish without it."
list="$(mktemp)"
trap 'rm -f "$list"' EXIT
git -C "$DEV" ls-files | grep -vE "$EXCLUDE" | grep -vE '(^|/)\.DS_Store$|\.zip$|\.log$|(^|/)\.env($|\.)' \
  | grep -vE -f <(grep -v '^#' "$LOCAL_EXCLUDE" | grep -v '^[[:space:]]*$') > "$list"
echo ".env.example" >> "$list"

# Keep the public README's team section as the team wrote it.
team="$(mktemp)"
perl -0ne 'print $1 if /(<!-- TEAM:START.*?<!-- TEAM:END -->)/s' "$PUB/README.md" > "$team" || true

rsync -a --files-from="$list" "$DEV/" "$PUB/"

if [ -s "$team" ]; then
  TEAM_FILE="$team" perl -0pi -e 'BEGIN { local $/; open my $f, "<", $ENV{TEAM_FILE}; $t = <$f> } s/<!-- TEAM:START.*?<!-- TEAM:END -->/$t/s' "$PUB/README.md"
fi
rm -f "$team"

# Remove files that no longer exist here. Never touches .git, .github or the public .gitignore.
"${GIT_PUB[@]}" ls-files | grep -vE '^(\.github/|\.gitignore$)' | while read -r f; do
  grep -qxF "$f" "$list" || "${GIT_PUB[@]}" rm -q -- "$f"
done

# Privacy scan
if ! "$DEV/scripts/privacy-scan.sh" "$PUB"; then
  echo "Restoring the public copy to its last published state."
  "${GIT_PUB[@]}" reset -q --hard HEAD
  "${GIT_PUB[@]}" clean -q -fd # leaves ignored folders (node_modules, dist-demo) alone
  exit 1
fi

# Review and publish
"${GIT_PUB[@]}" add -A
if "${GIT_PUB[@]}" diff --cached --quiet; then
  echo "Nothing to publish: the public copy already matches."
  exit 0
fi
echo
echo "Changes to publish to https://github.com/tuu92392-000/MobiPet:"
"${GIT_PUB[@]}" diff --cached --stat
echo
# No terminal to ask (e.g. run by a tool) counts as "no".
answer=n
read -r -p "Publish these changes? (y/n) " answer < /dev/tty || answer=n
if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
  "${GIT_PUB[@]}" reset -q --hard HEAD
  "${GIT_PUB[@]}" clean -q -fd
  echo "Not published. The public copy was put back as it was."
  exit 0
fi

"${GIT_PUB[@]}" commit -q -m "Publish update: $(date '+%Y-%m-%d %H:%M')"
# main only: never --all, --mirror or --tags.
"${GIT_PUB[@]}" push origin main
echo "Published. GitHub Actions now rebuilds the demo: https://tuu92392-000.github.io/MobiPet/"
