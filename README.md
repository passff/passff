passff
======

[![Join the chat at https://gitter.im/jvenant/passff](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/jvenant/passff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

**[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** management extension for **Mozilla Firefox**. [Pending Chrome port](https://github.com/passff/passff/issues/105)

**Official signed version can be found on the [Mozilla add-on page](https://addons.mozilla.org/firefox/addon/passff)**

![passff](https://user-images.githubusercontent.com/1518387/33810636-8c95df16-de07-11e7-8857-283e7300ecff.png)

### Overview
This extension will allow you to access your **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** repository directly from your web browser.

You can choose to automatically fill and submit login forms if a matching password entry is found.

### Browser compatibility
* Firefox 50+ (or 54 for [full support](#i-use-an-old-version-of-firefox-and-i-have-weird-behaviours))

### Installation

##### xz2c4 pass repository
This extension requires **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** to be installed and set up with a password repository. Make sure you can execute `pass show some-password-name` in a terminal before continuing.

##### Host application
For the extension to communicate with your system's `pass` script, you need to install what's called the host application from [the official GitHub repository](https://github.com/passff/passff-host).
The host application allows the extension to communicate with `pass` on your system.

##### PassFF extension
Install the current release of PassFF for your browser:
  - [Firefox](https://addons.mozilla.org/firefox/addon/passff)

Previous releases are available for download as XPI files from [our releases page](https://github.com/passff/passff/releases). However, this is strongly discouraged for security reasons!

### Password formats
To make the most of the extension, you should format your password files according to our expected formats.

If you only want the extension to fill out passwords, you don't need any special format for your password files. But if you follow our formats, the extension can also visit the website's URL and fill out the username and other input fields for you.

##### Multi-line format
This is the *preferred organizational scheme used by the author* of [pass](https://www.passwordstore.org/).

```
<the_password>
login: <the_login>
url: <the_url>
<other_inputfield_name> : <inputfield_value>
```

You can change or configure additional names for the `login` and `url` fields in preferences.

Lines besides the login and URL that match the format `<other_inputfield_name>: <value>` can be used to fill in input fields besides the login and password fields. The left hand side of the colon should match the input field's `name` or `id` attribute.

Examples
```
nu8kzeo2Aese
login: bob
url: https://github.com/login

AephieryZ2Ya
login: kevin
url: example.com
otp: 421337
```

##### File-structure format
Alternatively, you can organize your login information with file structure. For example, if you have this file structure:
* www
  * supersite.com
    * login
    * user
  * mysite.com

PassFF will
* get the login from the "login" file under supersite.com
* get the login from the "login" field inside the mysite.com entry for mysite.com (see [format above](#multi-line-format))

The file structure approach does not support custom input fields, however.

### Configuration and preferences

##### Extension preferences
Accessible from the gear button in the toolbar menu, preferences let you fine-tune the behaviour of PassFF.
Some of them are described below:

- Inputs (A comma separated list of input names. Input field names in a web page *containing* one of those values will be filled with the corresponding value.)
  - Passwords input names
  - Login input names
- Fields (A comma separated list of field names. The first matching field in the password data or in the store tree will be used as the corresponding value.)
  - Login field names
  - Password field names
  - URL field names
- Adding Passwords
  - The default length for generating passwords
  - Whether or not to include special characters in generated passwords by default
  - Preferred new password method ("generate" or "insert")

##### Host application preferences
If you use a customized `pass` installation: environment variables, customized repository path or extensions, you may have to [configure the host application accordingly](https://github.com/passff/passff-host#preferences).

### Usage
Once installed, you should have a new icon in your toolbar. Click the icon to browse your password repository or search using a **fuzzy matching** algorithm.

##### Keyboard shortcuts
The default shortcut to open the menu is <kbd>ctrl</kbd>+<kbd>y</kbd>.

With the menu open, you can press <kbd>enter</kbd> to execute one of the following commands, according to your preferences:
- Goto, fill and submit
- Goto and fill
- Fill and submit
- Fill

##### Input menu
PassFF can *mark fillable input fields with the PassFF icon*. It adds an icon in the fields that PassFF can automatically fill. The icon is clickable and pops up a menu to select the password.
PassFF fills the input fields and optionally submit depending on your preferences. You can always override this behavior by clicking the pencil (Fill) or the paper plane (Fill & Submit).

This feature can be disabled in the preferences.

#### Contextual menu
In *any* input field, fillable or not, you can access a contextual menu (right-click) in order to:
  - Add the input field's name in the *Login input names* for (auto)filling,
  - Select a password to fill the input fields.

#### Adding new passwords
In order to add a password in your repository, select the 'plus' (+) icon in the toolbar menu.

### Issues
If you're having problems, the most common causes are misconfigured preferences or an incorrect installation of the host application. You can get more information by [debugging the extension](docs/CONTRIBUTING.md).

First, [make sure the host application is installed correctly](https://github.com/passff/passff-host).

Configure the script's execution parameters appropriately in the host app `passff.py`: E.g., set `COMMAND` to the path to the `pass` binary (if installed with homebrew, the default location is `/usr/local/bin/pass`). With those settings in place, the extension should be able to find your passwords.

### Troubleshooting

#### I use an old version of Firefox and I have weird behaviours
PassFF is developed for the [last version of **Firefox**](https://en.wikipedia.org/wiki/Firefox_version_history#Current_and_future_releases).
PassFF should also work on previous versions above Firefox 50, which introduced [*native messaging*](https://blog.mozilla.org/addons/2016/08/25/webextensions-in-firefox-50/) for WebExtensions.
However, HTTP authentication is available from Firefox 54 onwards.

#### Nothing happens when I click on a password and select an action
#### PassFF does not prompt me for the passphrase
#### PassFF works but only intermittently
It may be a problem with your pin-entry program, while your gpg-agent sometimes caches your passphrase.

Possible solution: install another pinentry program:
* MacOS:
  * `brew install pinentry-mac`
  * Add `pinentry-program /usr/local/bin/pinentry-mac` to `~/.gnupg/gpg-agent.conf`. You may need to create this file.
* GNU/Linux:
  * https://wiki.archlinux.org/index.php/GnuPG#pinentry

See:
 * https://github.com/passff/passff/issues/325
 * https://github.com/passff/passff/issues/330

### Contributing

##### Is the documentation too obscure?
Open a new issue. We will gratefully clarify the doc.

##### Would you like to translate PassFF?
Open a new issue to tell us about it, or make a pull request.

##### Would you like to code?
See [CONTRIBUTING](docs/CONTRIBUTING.md).

### Thanks
Development and improvements
 * [Johan Venant](https://github.com/jvenant)
 * [Tobias Umbach](https://github.com/sometoby)
 * [Lenz Weber](https://github.com/phryneas)
 * [Thomas Vogt](https://github.com/tuxor1337)

Russian translation : [Grigorii Horos](https://github.com/horosgrisa)
