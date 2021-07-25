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

##### zx2c4 pass repository
This extension requires **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** to be installed and set up with a password repository. Make sure you can execute `pass show some-password-name` in a terminal before continuing.

##### Host application
For the extension to communicate with your system's `pass` script, you need to install what's called the host application from [the official GitHub repository](https://github.com/passff/passff-host).
The host application allows the extension to communicate with `pass` on your system.

##### PassFF extension
Install the current release of PassFF for your browser:
  - [Firefox](https://addons.mozilla.org/firefox/addon/passff)

Previous releases are available for download as XPI files from [our releases page](https://github.com/passff/passff/releases). However, this is strongly discouraged for security reasons!

##### A graphical *pinentry* program
This program prompts you for your passphrase. One is probably already installed.
If PassFF does not work, install one of these programs:
  - For Ubuntu/Debian: `pinentry-gtk` or `pinentry-qt` or `pinentry-fltk`
  - For CentOS/RHEL: `pinentry-qt4` or `pinentry-qt`
  - For MacOS: `pinentry-mac`

If that does not work for you, you may have to configure GnuPG to use the right pinentry program. See the [Troubleshooting](#troubleshooting) section.

Note: Since the host app runs non-interactively, **a console *pinentry* such as `pinentry-ncurses` is useless** and may render PassFF unusable if this is the default pinentry.

##### One-time-password (OTP) Authentication
PassFF can generate tokens to fill OTP input fields if the [pass-otp](https://github.com/tadfisher/pass-otp) extension is installed and the key URI is configured in the password file.

### Password formats
To make the most of the extension, you should format your password files according to our expected formats.

If you only want the extension to fill out passwords, you don't need any special format for your password files. But if you follow our formats, the extension can also visit the website's URL and fill out the username and other input fields for you.

##### Multi-line format
This is the *preferred organizational scheme used by the author* of [pass](https://www.passwordstore.org/).

```
<the_password>
login: <the_login>
url: <the_url>
<other_inputfield_name>: <inputfield_value>
```

You can change or configure additional names for the `login` and `url` fields in preferences.

If there are no colons (`:`) on any of the lines, and there are at least 2 lines, then the first two lines are assumed
to contain the password and login name respectively:

```
<the_password>
<the_login>
<ignored_content>
```

If there is only a single line, or none of the provided fields matches a login field name, the username is taken from
the filename, e.g. `example.com/janedoe` will have a default username of `janedoe`:

```
<the_password>
url: <the_url>
<other_inputfield_name>: <inputfield_value>
```

If your login credentials do not include any login name information (only a password), you can instruct PassFF to omit
filling any login name by adding `login: PASSFF_OMIT_FIELD` to your pass entry. The same keyword can be used for
credentials without password, but only login name.

Lines besides the login and URL that match the format `<other_inputfield_name>: <value>` can be used to fill in input
fields besides the login and password fields. The left hand side of the colon should match the input field's `name` or
`id` attribute.

Examples
```
nu8kzeo2Aese
login: bob
url: https://github.com/login
```

```
Sae7gohsooquahCoh3ie
alice
```

```
AephieryZ2Ya
login: kevin
url: example.com
otpauth://totp/Example:alice@google.com?secret=JBSWY3DPEHPK3PXP&issuer=Example
pin: 1234
```

##### File-structure format
Alternatively, you can organize your login information with file structure. For example, if you have this file structure:
* www
  * supersite.com
    * login
    * password
    * url
    * totp
  * mysite.com

PassFF will
* get the login from the "login", the url from the "url" and the password from the "password" file under supersite.com
* get the login from the "login" field inside the mysite.com entry for mysite.com (see [format above](#multi-line-format))

The file structure approach does not support custom input fields.

Note that the file structure format is recognized and assumed by PassFF whenever a file name matches a reserved field name such as `user`, `url`, `password` or `login`. This might cause unexpected behavior in cases where there is a file in [multi-line format](#multi-line-format) whose name happens to be a reserved field name.

##### Improve Suggestions

Unless you activate the preference "Index URL fields on startup", the auto-suggestions in the menus are based on matches of the current web page's URL against the *names* of password store entries. In the following, you find an explanation how you can improve matching quality by adapting the names and paths of your password store entries.

Generally speaking, the match quality is best if the exact hostname as well as all alphanumeric parts of the URL's path appear exactly in your entry's name. An entry is excluded from the matching if no part of the hostname is contained in its name. Matching (parts of) the hostname is more important than matching parts from the rest of the URL.

For the URL `https://bugs.gentoo.org/index.cgi?GoAheadAndLogIn=1`, best match quality is reached if your password store entry contains the strings `bugs.gentoo.org`, `index` and `GoAheadAndLogIn` in arbitrary order, but for it to be ranked in the matching process at all, it's enough for it to contain the strings `bugs` or `gentoo`.

*Example (Only one entry per hostname):* If you don't have multiple credentials for one hostname in your password store, you get the best results from naming the entries after the exact hostname. In this scenario, if you name an entry `/some/arbitrary/path/bugs.gentoo.org`, it will always rank highest on `https://bugs.gentoo.org/index.cgi?GoAheadAndLogIn=1`.

*Example (More than one entry per hostname):* If you happen to have several credentials for one hostname, you could name a directory in your password store after the hostname and list the different credentials inside that directory. Suppose you have different credentials for each of the following URLs:
```
https://my.example.com/cloud
https://my.example.com/blog?login
https://my.example.com/blog?admin
```
You could store them in your password store as
```
/some/path/my.example.com/cloud
/some/path/my.example.com/blog-login
/some/path/my.example.com/blog-admin
```
However, the following will work equally well:
```
/business/cloud/my.example.com
/personal/my.example.com-blog-login
/personal/my.example.com-blog-admin
```

For the rare case where you need several entries for one hostname but with different ports (e.g. if you have different
entries for `http://example.com:2000/` and `http://example.com/`), you might want to include the port number `2000`
into the name of the entry for `http://example.com:2000/`:
```
/business/cloud/example.com:2000
/business/cloud/example.com-2000
/business/cloud/example.com/port2000
```

### Configuration and preferences

##### Extension preferences
Accessible from the gear button in the toolbar menu, preferences let you fine-tune the behaviour of PassFF.
Some of them are described below:

- Inputs (A comma separated list of input names. Input field names in a web page *containing* one of those values will be filled with the corresponding value.)
  - Passwords input names
  - Login input names
  - OTP input names
- Fields (A comma separated list of field names. The first matching field in the password data or in the store tree will be used as the corresponding value.)
  - Login field names
  - Password field names
  - URL field names
  - OTP Auth field names
  - Regex for hiding items (tests the full path to the item)
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
  - Add the input field's name in the *OTP input names* for (auto)filling,
  - Select a password to fill the input fields.

#### Adding new passwords
In order to add a password in your repository, select the 'plus' (+) icon in the toolbar menu.

### Issues
If you're having problems, the most common causes are misconfigured preferences or an incorrect installation of the host application. You can get more information by [debugging the extension](docs/CONTRIBUTING.md).

First, [make sure the host application is installed correctly](https://github.com/passff/passff-host).

Configure the script's execution parameters appropriately in the host app `passff.py`: E.g., set `COMMAND` to the path to the `pass` binary (if installed with homebrew, the default location is `/usr/local/bin/pass`). With those settings in place, the extension should be able to find your passwords.

### Troubleshooting

##### I use an old version of Firefox and I have weird behaviours
PassFF is developed for the [last version of **Firefox**](https://en.wikipedia.org/wiki/Firefox_version_history#Current_and_future_releases).
PassFF should also work on previous versions above Firefox 50, which introduced [*native messaging*](https://blog.mozilla.org/addons/2016/08/25/webextensions-in-firefox-50/) for WebExtensions.
However, HTTP authentication is available from Firefox 54 onwards.

##### I get a window saying: *gpg: decryption failed: No secret key*
##### Nothing happens when I click on a password and select an action
##### PassFF does not prompt me for the passphrase
##### PassFF works but only intermittently
It may be a problem with your pin-entry program, while your gpg-agent sometimes caches your passphrase.

Possible solutions:
  - [Install a graphical pinentry program](#A-graphical-pinentry-program)
  - Configure GnuPG to call your pinentry program
    - Add the line `pinentry-program /path/to/your/pinentry` to `~/.gnupg/gpg-agent.conf`
    - You may need to create this file.
    - See https://wiki.archlinux.org/index.php/GnuPG#pinentry

Related issues:
 * [No dialog opening up on Arch Linux](https://github.com/passff/passff/issues/330)
 * [Decryption failed on MacOS](https://github.com/passff/passff/issues/325)
 * [Script execution failed on CentOS](https://github.com/passff/passff/issues/367)

##### The icon/toolbar menu suggests no or the wrong entries

See the section [Improve Suggestions](https://github.com/passff/passff#improve-suggestions) above.

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

### Similar projects

- https://github.com/hsanson/chrome-pass: Simplistic login data alternative for Chrome
- https://github.com/browserpass/browserpass-extension: cross-browser, fancier extension that seems to only handle logins
