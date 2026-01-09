#!/bin/bash

# Download team logos from Discord CDN and save locally
TEAMS_DIR="/Users/rafu/pbo-site/public/images/teams"
mkdir -p "$TEAMS_DIR"

# Function to convert team name to filename
to_filename() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed "s/[^a-z0-9]/-/g" | sed "s/--*/-/g" | sed "s/^-//" | sed "s/-$//"
}

# Read each line and download
while IFS='|' read -r team_name url; do
    if [ -z "$url" ]; then continue; fi

    # Get file extension from URL
    ext="${url##*.}"
    ext="${ext%%\?*}"
    if [ "$ext" != "png" ] && [ "$ext" != "jpg" ] && [ "$ext" != "jpeg" ]; then
        ext="png"
    fi

    filename=$(to_filename "$team_name")
    filepath="$TEAMS_DIR/${filename}.${ext}"

    if [ -f "$filepath" ]; then
        echo "SKIP: $team_name (already exists)"
    else
        echo "Downloading: $team_name -> ${filename}.${ext}"
        curl -sL "$url" -o "$filepath"
        if [ $? -eq 0 ] && [ -s "$filepath" ]; then
            echo "  OK"
        else
            echo "  FAILED"
            rm -f "$filepath"
        fi
    fi
done < /tmp/team_logos.txt

echo ""
echo "Done! Downloaded to $TEAMS_DIR"
ls -la "$TEAMS_DIR"
