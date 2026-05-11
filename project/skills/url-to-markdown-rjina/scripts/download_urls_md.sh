#!/usr/bin/env bash
set -euo pipefail

out_dir=""
urls=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --out)
      if [ "$#" -lt 2 ]; then
        echo "missing value for --out" >&2
        exit 1
      fi
      out_dir="$2"
      shift 2
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        urls+=("$1")
        shift
      done
      ;;
    *)
      urls+=("$1")
      shift
      ;;
  esac
done

if [ -z "$out_dir" ]; then
  echo "missing required --out <output-folder>" >&2
  exit 1
fi

if [ "${#urls[@]}" -eq 0 ]; then
  echo "provide at least one URL" >&2
  exit 1
fi

mkdir -p "$out_dir"

slugify_url() {
  local raw="$1"
  local slug
  slug=$(printf '%s' "$raw" | sed -E 's#^https?://##; s#[^A-Za-z0-9._-]+#-#g; s#-+#-#g; s#(^-+|-+$)##g')
  if [ -z "$slug" ]; then
    slug="page"
  fi
  printf '%s' "$slug"
}

save_target_path() {
  local base="$1"
  local target="$out_dir/${base}.md"
  local n=2
  while [ -e "$target" ]; do
    target="$out_dir/${base}-${n}.md"
    n=$((n + 1))
  done
  printf '%s' "$target"
}

status=0

for url in "${urls[@]}"; do
  case "$url" in
    http://*|https://*) ;;
    *)
      echo "error\t$url\tURL must start with http:// or https://" >&2
      status=1
      continue
      ;;
  esac

  base=$(slugify_url "$url")
  target=$(save_target_path "$base")

  if curl -fsSL --retry 2 --retry-delay 1 "https://r.jina.ai/$url" -o "$target"; then
    printf 'saved\t%s\t%s\n' "$url" "$target"
  else
    echo "error\t$url\tfailed to fetch from r.jina.ai" >&2
    rm -f "$target"
    status=1
  fi
done

exit "$status"
