# PassFF Contributing Guide

Thanks for your interest in contributing to PassFF!

To get started, you'll need to clone the repository and install the extension from your local copy. Instructions can be found [here](INSTALLATION.md#latest-from-github).

## Development
For development or temporary testing in Firefox open `about:debugging` and choose to load the add-on temporarily by selecting the file `src/manifest.json` in your git working directory.

You'll probably want to enable debugging. Open the PassFF preferences from the menu or from `about:addons` and enable the preference "Enable logging to Javascript console".

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
