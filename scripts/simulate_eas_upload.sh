#!/usr/bin/env bash
set -euo pipefail

# Simulate which files would be included in the EAS upload based on .easignore
# Supports both blacklist-style (gitignore-like excludes) and whitelist-style
# (leading '**' followed by '!'-prefixed includes). The script builds a tar of
# the matched files so you can inspect what would be uploaded.

patterns_file=".easignore"
if [ ! -f "$patterns_file" ]; then
  echo "ERROR: $patterns_file not found in repo root"
  exit 1
fi

tmpdir=$(mktemp -d)
out="$tmpdir/eas_sim.tar"

shopt -s globstar nullglob

declare -a include_patterns
declare -a exclude_patterns

while IFS= read -r rawline || [ -n "$rawline" ]; do
  # strip comments and CR
  line="${rawline%%#*}"
  line="${line//$'\r'/}"
  # trim whitespace
  line="$(echo -n "$line" | sed 's/^\s*//;s/\s*$//')"
  [ -z "$line" ] && continue

  if [[ "$line" == !* ]]; then
    pat="${line:1}"
    pat="${pat#./}"
    pat="${pat#/}"
    include_patterns+=("$pat")
  else
    pat="${line}"
    pat="${pat#./}"
    pat="${pat#/}"
    exclude_patterns+=("$pat")
  fi
done < "$patterns_file"

# Build initial list of all files under repo (excluding .git)
mapfile -t all_files < <(find . -type f -not -path './.git/*' | sed 's|^./||')

matches_pattern() {
  local path="$1" pat="$2"
  pat="${pat#./}"; pat="${pat#/}"
  # handle directory pattern ending with /**
  if [[ "$pat" == */** ]]; then
    prefix="${pat%%/**}"
    case "$path" in
      $prefix/*) return 0;;
      *) return 1;;
    esac
  fi
  case "$path" in
    $pat) return 0;;
    *) return 1;;
  esac
}

# Determine whitelist mode: if first non-comment line is '**'
first_line=$(sed -n '1,20p' "$patterns_file" | sed -e 's/^\s*//' -e 's/\s*$//' | sed -n '/^\(\!.*\|[^#].*\)/p' | head -n1 || true)
whitelist_mode=false
if [ "$first_line" = "**" ]; then
  whitelist_mode=true
fi

declare -a final_files

if $whitelist_mode; then
  # start empty and add include patterns
  for pat in "${include_patterns[@]}"; do
    pat="${pat#./}"; pat="${pat#/}"
    # expand glob without eval (safe against special chars)
    for em in $pat; do
      [ -f "$em" ] && final_files+=("${em#./}")
    done
  done
else
  # blacklist mode: start with all files, then remove matches of exclude_patterns
  for f in "${all_files[@]}"; do
    skip=false
    for ex in "${exclude_patterns[@]}"; do
      if matches_pattern "$f" "$ex"; then
        skip=true
        break
      fi
    done
    $skip || final_files+=("$f")
  done
  # re-apply includes
  for pat in "${include_patterns[@]}"; do
    p="${pat#./}"
    for em in $p; do
      [ -f "$em" ] && final_files+=("${em#./}")
    done
  done
fi

# Always include critical config files
for req in .easignore package.json app.json eas.json tsconfig.json; do
  [ -f "$req" ] && final_files+=("$req")
done

# Deduplicate preserving order
IFS=$'\n' read -r -d '' -a uniq_files < <(printf "%s\n" "${final_files[@]}" | awk '!seen[$0]++' && printf '\0')

if [ "${#uniq_files[@]}" -eq 0 ]; then
  echo "No files would be uploaded after applying .easignore" >&2
  exit 1
fi

filelist="$tmpdir/filelist.txt"
printf "%s\n" "${uniq_files[@]}" > "$filelist"
tar -C "$(pwd)" -cf "$out" -T "$filelist"

echo "Simulated EAS upload archive: $out"
echo
echo "Included ${#uniq_files[@]} files:"
printf "%s\n" "${uniq_files[@]}"

echo
du -h "$out" || true

echo
cp "$out" ./eas_simulated_upload.tar 2>/dev/null || true
if [ -f ./eas_simulated_upload.tar ]; then
  echo "Also copied to: ./eas_simulated_upload.tar"
fi

exit 0
