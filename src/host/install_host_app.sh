#!/usr/bin/env bash

# This script is derived from `install.sh` in Danny van Kooten's "browserpass":
# https://github.com/dannyvankooten/browserpass

set -e

APP_NAME="passff"
HOST_URL="https://raw.githubusercontent.com/passff/passff/master/src/host/passff.py"
MANIFEST_URL="https://raw.githubusercontent.com/passff/passff/master/src/host/passff.json"

# Find target dirs for various browsers & OS'es
# https://developer.chrome.com/extensions/nativeMessaging#native-messaging-host-location
# https://wiki.mozilla.org/WebExtensions/Native_Messaging
if [ $(uname -s) == 'Darwin' ]; then
  if [ "$(whoami)" == "root" ]; then
    TARGET_DIR_CHROME="/Library/Google/Chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="/Library/Application Support/Chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="/Library/Application Support/Mozilla/NativeMessagingHosts"
    TARGET_DIR_VIVALDI="/Library/Application Support/Vivaldi/NativeMessagingHosts"
  else
    TARGET_DIR_CHROME="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    TARGET_DIR_VIVALDI="$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"
  fi
else
  if [ "$(whoami)" == "root" ]; then
    TARGET_DIR_CHROME="/etc/opt/chrome/native-messaging-hosts"
    TARGET_DIR_CHROMIUM="/etc/chromium/native-messaging-hosts"
    TARGET_DIR_FIREFOX="/usr/lib/mozilla/native-messaging-hosts"
    TARGET_DIR_VIVALDI="/etc/vivaldi/native-messaging-hosts"
  else
    TARGET_DIR_CHROME="$HOME/.config/google-chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="$HOME/.config/chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="$HOME/.mozilla/native-messaging-hosts"
    TARGET_DIR_VIVALDI="$HOME/.config/vivaldi/NativeMessagingHosts"
  fi
fi

function usage {
  echo "Usage: $0 [OPTION] [chrome|chromium|firefox|opera|vivaldi]

  Options:
    -l, --local    Install files from disk instead of downloading them
    -h, --help     Show this message"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    chrome)
      BROWSER_NAME="Chrome"
      TARGET_DIR="$TARGET_DIR_CHROME"
      ;;
    chromium)
      BROWSER_NAME="Chromium"
      TARGET_DIR="$TARGET_DIR_CHROMIUM"
      ;;
    firefox)
      BROWSER_NAME="Firefox"
      TARGET_DIR="$TARGET_DIR_FIREFOX"
      ;;
    opera)
      BROWSER_NAME="Opera"
      TARGET_DIR="$TARGET_DIR_VIVALDI"
      ;;
    vivaldi)
      BROWSER_NAME="Vivaldi"
      TARGET_DIR="$TARGET_DIR_VIVALDI"
      ;;
    -l|--local)
      USE_LOCAL_FILES=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$TARGET_DIR" ]; then
  usage
  exit 1
fi

HOST_FILE_PATH="$TARGET_DIR/$APP_NAME.py"
MANIFEST_FILE_PATH="$TARGET_DIR/$APP_NAME.json"
ESCAPED_HOST_FILE_PATH="${HOST_FILE_PATH////\\/}"

echo "Installing $BROWSER_NAME host config"

# Create config dir if not existing
mkdir -p "$TARGET_DIR"

if [ "$USE_LOCAL_FILES" = true ]; then
  DIR="$( cd "$( dirname "$0" )" && pwd )"
  cp "$DIR/passff.py"   "$HOST_FILE_PATH"
  cp "$DIR/passff.json" "$MANIFEST_FILE_PATH"
else
  # Download native host script and manifest
  curl -sSL "$HOST_URL"     > "$HOST_FILE_PATH"
  curl -sSL "$MANIFEST_URL" > "$MANIFEST_FILE_PATH"
fi

# Replace path to host
sed -i -e "s/PLACEHOLDER/$ESCAPED_HOST_FILE_PATH/" "$MANIFEST_FILE_PATH"

# Set permissions for the manifest so that all users can read it.
chmod a+x "$HOST_FILE_PATH"
chmod o+r "$MANIFEST_FILE_PATH"

echo "Native messaging host for $BROWSER_NAME has been installed to $TARGET_DIR."
