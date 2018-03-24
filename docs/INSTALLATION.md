# PassFF Installation Guide

This extension requires **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** to be installed and set up with a password repository. Make sure you can execute `pass show some-password-name` in a terminal before continuing.

To make the most of the extension, you should format your password files according to [our expected format](/README.md#password-configuration).

For the extension, you need the extension in your browser *and* what's called the **[host application](https://github.com/passff/passff-host)**. The host application is what allows the extension to communicate with `pass` on your system.

## Installing the extension

Install the current release for your browser:
- [Firefox](https://addons.mozilla.org/firefox/addon/passff)
- Chrome and Chromium (coming soon)
- Opera (coming soon)

Previous releases are available for download as XPI files from [our releases page](https://github.com/passff/passff/releases). However, this is strongly discouraged for security reasons!

#### Latest from GitHub
Clone the repository. Then, from the project's `src/` directory, execute `make VERSION=testing`. This will create an XPI file in the project's `bin/testing/` directory that you can install in your browser. Note that Firefox will not accept unsigned extensions unless you deactivate `xpinstall.signatures.required` in `about:config`.

For development or temporary testing in Firefox open `about:debugging` and choose to load the add-on temporarily by selecting the file `src/manifest.json` in your git working directory.

## Installing the host application
For the extension to communicate with your system's `pass` script, you need to install what's called the host application from [the official GitHub repository](https://github.com/passff/passff-host).

