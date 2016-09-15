passff
======

[![Join the chat at https://gitter.im/jvenant/passff](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/jvenant/passff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

**[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** manager addon for Firefox  
**Official signed version can be found on the [mozilla addon page](https://addons.mozilla.org/firefox/addon/passff)**


### Overview
This plugin will allow you to access your **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** repository directly from Firefox.

It will try to auto fill and auto submit the login form if a matching password entry is found.

### Installation
- You need **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** installed on your computer
- You will also need a working password repository
- Download the last release of the plugin **[here](https://github.com/jvenant/passff/releases)**.
- You can then manually install the plugin in Firefox from the addons page (Firefox/Add-ons/Install Add-on from File...)

Alternatively, to use the git version:
- Clone this repository
- From the <code>$LOCAL_CLONE/src/</code> directory, execute <code>make</code>
- Manually install the resulting plugin from the <code>$LOCAL_CLONE/bin/</code> directory

### Usage
A black icon with a P should appear in your Firefox toolbar.
From here, you will be able to browse your password repository
or search using a case sensitive **Fuzzy matching** algorithm.
The shortcut to open the menu is: **Ctrl-y**
So considering this repository
* Internet
 * MySite1
 * MySite2
* CoolStuf
 * SuperSite1
 * SuperSite2

&lt;Ctrl-y&gt;M1&lt;Enter&gt; will send and authenticate you on MySite1 (&lt;Shift-Enter&gt; to open in a new tab)

Current supported features are:
- Fill and submit
- Goto, fill and submit
- Copy login to clipboard
- Copy password to clipboard

Additionally, if you added the url property in your password info, you will be able to go there by clicking directly on the password menu. (left-click same tab, middle-click new tab)

An accepted format for the password info is:
```
<the_password>
login: <the_login>
url: <the_url>
<other_inputfield_name> : <inputfield_value>
```
Additional password, username, and url tags may be defined through the preferences dialog.

PassFF will also try to find login password and url inside the direct child of a pass node.
For example, if you have a structure like this:
* www
  * supersite.com
    * login
    * user
  * mysite.com

PassFF will
* get the login from the "login" entry for supersite.com
* get the login form the "login" field inside the mysite.com entry for mysite.com (see format above)

Fields names can be set in the preferences.

From the plugin preferences you will be able to set:
- Inputs (A comma separated list of input names. Input field names in a html page containing one of those values will be filled with the corresponding value.)
  - Passwords input names.
  - Login input names.
- Fields (A comma separated list of field names. The first matching field in the password data or in the store tree will be used as the corresponding value.)
  - Login field names.
  - Password field names.
  - Url field names.
- Pass Scrit params
  - The pass script path.
  - Pass home. If empty, use User home.
  - Location of the gpg agent info file containing environment variables (relative to the home).

### See the logs

To enable debug mode, just go in the addon preferences and check the "Enable logs" check box at the bottom of the dialog box. You then have to open the Browser console (Tools/Web Developper/Browser console)
You should see many lines about passff. You could Filter on "[PassFF]" if you want

### Issues

If you're experiencing problems running passff on OS X, try using the "through shell" approach in the preferences (under "Pass Script").

**NOTE:** This method may also be applicable if GPG fails to provide a pin entry
dialog, or if you experience otherwise unexplained issues with incorrect login
and/or password data.

Configure the script's execution parameters appropriately:

* Set "User home" to the absolute path to your home directory
* Set "Pass command" to the path to the ````pass```` binary (if installed with homebrew, the default location is ````/usr/local/bin/pass````)
* Set "Pass shell" to your preferred shell (e.g. ````/bin/bash````)
* Set "Shell arguments" to ````--login````

With those settings in place, the plugin should be able to find your passwords.

If you're still having trouble, it may be due to a bug present in version 1.6.5 and earlier of pass. From your shell, check the output of ````pass list````. If the passwords listed end with ````.gpg````, then your version of pass contains the bug. The bug was fixed in [this commit](http://git.zx2c4.com/password-store/commit/?id=a619988f7986d72f4e0ac7256ce48596df6a2a34). You must update your version of ````pass```` or manually apply [this patch](http://git.zx2c4.com/password-store/patch/?id=a619988f7986d72f4e0ac7256ce48596df6a2a34) to the pass script on your machine.  Once ````pass list```` lists passwords with the ````.gpg```` stripped off, the plugin should work!

### People contributing to the project

Development and improvements
 * [Tobias Umbach](https://github.com/sometoby)
 * [Lenz Weber](https://github.com/phryneas)
 * [tuxor1337](https://github.com/tuxor1337)

Russian translation : [Grigorii Horos](https://github.com/horosgrisa)

### Thanks

This plugin uses [subprocess](https://github.com/bit/subprocess) to launch the pass script.


This is a beta. For testing purposes only.
==========================================
