passff
======

[![Join the chat at https://gitter.im/jvenant/passff](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/jvenant/passff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

**[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** manager addon for Firefox


### Overview
This plugin will allow you to access your **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** repository directly from Firefox.

It will try to auto fill and auto submit the login form if a matching password entry is found.

### Installation
- You need **[zx2c4 pass](http://www.zx2c4.com/projects/password-store/)** installed on your computer
- You will also need a working password repository
- Download the last release of the plugin **[here](https://github.com/jvenant/passff/releases)**.
- You can then manually install the plugin in Firefox from the addons page (Firefox/Add-ons/Install Add-on from File...)

### Usage
A black icon with a P should appear in your Firefox toolbar.
From here, you will be able to browse your password repository
or to search using a case sensitive **Fuzzy matching** algorithm.
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

Additionally, if you added a url property in your password info, you will be able to go there clicking directly on the password menu. (left-click same tab, middle-click new tab)

The accepted format for the password info is:
&lt;the_password&gt;
login: &lt;the_login&gt;
url: &lt;the_url&gt;

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

### Issues with OS X

If you're experiencing problems running passff on OS X, first try using the "through shell" approach in the preferences.

You could also try setting "Pass command" to ````/bin/bash```` and "Pass command line arguments" to ````--login [pass binary location]````. If pass was installed with the default Homebrew configuration, the ````[pass binary location]```` should be ````/usr/local/bin/pass````.

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
