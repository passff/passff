# PassFF Installation Guide

This extension requires **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** to be installed and set up with a password repository. Make sure you can execute `pass show some-password-name` in a terminal before continuing.

To make the most of the extension, you should format your password files according to [our expected format](/README.md#password-configuration).

For the extension, you need the extension in your browser *and* what's called the "host application". The host application is what allows the extension to communicate with `pass` on your system.

## Installing the extension

#### Official release
Install the current release for your browser:
- [Firefox](https://addons.mozilla.org/firefox/addon/passff)
- Chrome (coming soon)
- Opera (coming soon)

#### Previous release
Download the XPI file from [our releases page](https://github.com/nwallace/passff/releases).
###### Firefox
Unsigned extensions are only available with Firefox Developer Edition. Visit "about:debugging#addons", then click "Load Temporary Add-on".
###### Chrome
Visit "chrome://extensions", check "Developer mode", then click "Load unpacked extension".
###### Opera
Simply drag and drop the XPI file onto your browser!

#### Latest from GitHub
Clone the repository. Then, from the project's `src/` directory, execute `make`. This will create an XPI file in the project's `bin/` directory that you can install in your browser as described above.

## Installing the host application
For the extension to communicate with your system's `pass` script, you need to install what's called the host application.

#### Official release
Download the `install_host_app.sh` script from [our releases page](https://github.com/nwallace/passff/releases) and execute it.

#### Latest from GitHub
Clone the repository. Then, from the project's `host/` directory, execute the installation script for your desired browser (`--firefox`, `--chrome`, `--opera`). Omit the browser flag to install it for any browser you have on your system.

  ```
  $ ./install_host_app.sh --firefox
  ```

This will link the host application JSON file appropriately for your browser.

If this doesn't work, you can link the file yourself. First, change the "path" value in the `passff.json` file to be the absolute path to the project's `host/passff.py` file. Then symlink (or copy) the file `host/passff.json` to the appropriate location for your browser and OS:

- Firefox
  - Linux
    - Per-user: `~/.mozilla/native-messaging-hosts/passff.json`
    - System-wide: `/usr/{lib,lib64,share}/mozilla/native-messaging-hosts/passff.json`
  - OS X
    - `/Library/Application Support/Mozilla/NativeMessagingHosts/passff.json`
  - Windows
    - Per-user: `Path contained in registry key HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\passff`
    - System-wide: `Path contained in registry key HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts\passff`
- Chrome
  - Linux
    - Per-user: `~/.config/google-chrome/NativeMessagingHosts/passff.json`
    - System-wide: `/etc/opt/chrome/native-messaging-hosts/passff.json`
  - OS X
    - Per-user: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/passff.json`
    - System-wide: `/Library/Google/Chrome/NativeMessagingHosts/passff.json`
  - Windows
    - Per-user: `HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\passff`
    - System-wide: `HKEY_LOCAL_MACHINE\SOFTWARE\Google\Chrome\NativeMessagingHosts\passff`
- Chromium
  - Linux
    - Per-user: `~/.config/chromium/NativeMessagingHosts/passff.json`
    - System-wide: `/etc/chromium/native-messaging-hosts/passff.json`
  - OS X
    - Per-user: `~/Library/Application Support/Chromium/NativeMessagingHosts/passff.json`
    - System-wide: `/Library/Application Support/Chromium/NativeMessagingHosts/passff.json`
- Opera
  - Same as Chrome
