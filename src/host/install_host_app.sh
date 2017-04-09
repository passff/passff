#!/usr/bin/env bash

# This script is derived from `install.sh` in Danny van Kooten's "browserpass":
# https://github.com/dannyvankooten/browserpass

set -e

DIR="$( cd "$( dirname "$0" )" && pwd )"
APP_NAME="passff"
HOST_FILE="$DIR/passff.py"

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
    TARGET_DIR_VIVALDI="/etc/chromium/native-messaging-hosts"
  else
    TARGET_DIR_CHROME="$HOME/.config/google-chrome/NativeMessagingHosts"
    TARGET_DIR_CHROMIUM="$HOME/.config/chromium/NativeMessagingHosts"
    TARGET_DIR_FIREFOX="$HOME/.mozilla/native-messaging-hosts"
    TARGET_DIR_VIVALDI="$HOME/.config/vivaldi/NativeMessagingHosts"
  fi
fi

ESCAPED_HOST_FILE=${HOST_FILE////\\/}

case $1 in
--chrome)
  BROWSER_NAME="Chrome"
  TARGET_DIR="$TARGET_DIR_CHROME"
  ;;
--chromium)
  BROWSER_NAME="Chromium"
  TARGET_DIR="$TARGET_DIR_CHROMIUM"
  ;;
--firefox)
  BROWSER_NAME="Firefox"
  TARGET_DIR="$TARGET_DIR_FIREFOX"
  ;;
--opera)
  BROWSER_NAME="Opera"
  TARGET_DIR="$TARGET_DIR_VIVALDI"
  ;;
--vivaldi)
  BROWSER_NAME="Vivaldi"
  TARGET_DIR="$TARGET_DIR_VIVALDI"
  ;;
*)
    echo "Usage: $0 [--chrome|--chromium|--firefox|--opera|--vivaldi]"
    exit 1
    ;;
esac

echo "Installing $BROWSER_NAME host config"

# Create config dir if not existing
mkdir -p "$TARGET_DIR"

# Copy manifest host config file
cp "$DIR/passff.json" "$TARGET_DIR/$APP_NAME.json"

# Replace path to host
sed -i -e "s/PLACEHOLDER/$ESCAPED_HOST_FILE/" "$TARGET_DIR/$APP_NAME.json"

# Set permissions for the manifest so that all users can read it.
chmod o+r "$TARGET_DIR/$APP_NAME.json"
	
echo "Native messaging host for $BROWSER_NAME has been installed to $TARGET_DIR."

