# PassFF Contributing Guide

Thanks for your interest in contributing to PassFF!

To get started, you'll need clone the repository and install the extension from your local copy. Instructions can be found [here](docs/INSTALLATION.md).

If you're using Firefox, you'll need to use Firefox Developer Edition, since unsigned extensions aren't permitted in the normal build.

## Development
Once you've built and installed the XPI file into your browser, you're ready to make changes. When you're ready to run your changes, rebuild the XPI file (by running `make` again), then reload the extension.

#### Debugging
You'll probably want to enable debugging. Follow the instructions for your browser:
- For Firefox, visit "about:debugging#addons" and check "Enable add-on debugging".
- For Chrome, visit "chrome://extensions", and check Developer Mode.
- For Opera, visit "opera:extensions" and enable Developer Mode.


## Style guide
Please follow these conventions and amend to them when necessary.

#### Indentation
Two spaces please!

#### Line length
At most 90 characters.

#### Semicolons
Always terminate statements with semicolons.

#### Braces

On the same line as the statement.

```
// good
if (true) {
  // your code here
}

// bad
if (true)
{
  // your code here
}
```
