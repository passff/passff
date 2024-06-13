# PassFF Contributing Guide

Thanks for your interest in contributing to PassFF!

## Development

To get started, you'll need to [fork and clone the repository](https://help.github.com/articles/fork-a-repo/).

Please run `npm install` in the root of the repository to set up the pre-commit hooks.

For development or temporary testing in Firefox, open `about:debugging` and choose to load the add-on temporarily by selecting the file `src/manifest.json` in your git working directory.
For auto-reloading the extension on changes in a new profile, check out [Mozilla's Web-ext](https://github.com/mozilla/web-ext).
You may also use the _Firefox Debugger_ for faster and easier debugging. [Quick introduction to Firefox Debugger](https://mozilladevelopers.github.io/playground/debugger/).

You'll probably want to enable debug logs. Open the PassFF preferences from the menu or from `about:addons` and enable the preference "Enable logging to the JavaScript web console".

If you'd like to easily toggle dark mode, you can also add `ui.systemUsesDarkTheme` as the number `1` in `about:config`.

## Style guide

If you have run `npm install` at least once, your JavaScript code will be prettified before each commit, so you do not have to worry about coding style.

## Building (only useful for the maintainer, don't do it)

From the project's root directory, execute `make VERSION=testing`. This will create an XPI file in the project's `bin/testing/` directory that you can install in your browser.

Note that Firefox will not accept unsigned extensions unless you deactivate `xpinstall.signatures.required` in `about:config`.
