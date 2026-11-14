#!/usr/bin/env bash
# Prints the next release version.
# Usage: next-version.sh <latest tag or empty> <commit message>
#
# No previous release -> v1.0.0. Otherwise the patch number grows by one, unless the commit
# message contains [minor] or [major].
set -euo pipefail

latest="${1:-}"
message="${2:-}"

if [[ "$latest" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  major=${BASH_REMATCH[1]}
  minor=${BASH_REMATCH[2]}
  patch=${BASH_REMATCH[3]}
  case "$message" in
    *"[major]"*) major=$((major + 1)); minor=0; patch=0 ;;
    *"[minor]"*) minor=$((minor + 1)); patch=0 ;;
    *) patch=$((patch + 1)) ;;
  esac
else
  major=1; minor=0; patch=0
fi

echo "v$major.$minor.$patch"
