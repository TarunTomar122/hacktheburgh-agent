#!/bin/sh
# Stitch a run's per-tab browser videos (RECORD_VIDEO=<dir>) into one MP4, in the order the tabs were opened, at 2x speed.
#   sh scripts/stitch-video.sh docs/night-runs/<run>/video docs/night-runs/<run>/run.mp4
set -e
dir="$1"; out="$2"
list=$(mktemp)
for f in $(ls -trU "$dir"/*.webm); do
  # skip tabs that never showed anything (tiny files)
  [ "$(stat -f%z "$f")" -gt 60000 ] && echo "file '$PWD/$f'" >> "$list"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -filter:v "setpts=0.5*PTS,scale=1040:-2" -an -c:v libx264 -preset veryfast -crf 30 "$out"
rm "$list"
echo "$out $(du -h "$out" | cut -f1)"
