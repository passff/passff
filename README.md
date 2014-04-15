passff
======

[zx2c4 pass](http://www.zx2c4.com/projects/password-store/) manager addon for firefox


### Overview
This plugin will allow you to access your [pass](http://www.zx2c4.com/projects/password-store/) repository directly from firefox.

It will try to auto fill and auto submit the login form if a matching password entry is found

### Installation
- You have to have pass installed on your computer
- You will also need a working password repository
- Download the last release of the plugin [here](https://github.com/jvenant/passff/releases).
- You can then manually install the plugin in Firefox from the addons page (Firefox/Add-ons/Install Add-on from File...)

### Usage
A black icon with a P should appear in your Firefox toolbar.
From here, you will be able to browse your password repository.
The shortcut to open the menu is : **Ctrl-y**
From here, you will be able to browse your password repository
or to search using a case sensitive **Fuzzy matching** algorithm.
So considering this repository
* Internet
 * MySite1
 * MySite2
* CoolStuf
  * SuperSite1
  * SuperSite2

&lt;Ctrl-y&gt;M1&lt;Enter&gt; will send you and authenticate you on MySite1 (&lt;Shift-Enter&gt; to open in a new tab)


Current supported features are :
- Fill and submit
- Goto, fill and submit
- Copy login to clipboard
- Copy password to clipboard

Additionnally, if you added an url property in your password info you will be able to go there clicking directly on the password menu (left-click same tab, middle-click new tab)

the accepted format for the password info is :  
&lt;the_password&gt;  
login: &lt;the_login&gt;  
url: &lt;the_url&gt;  

PassFF will also try to find login password and url inside the direct child of a pass node.
For example, if you have as structure like this :
* www
  * supersite.com
    * login
    * user
  * mysite.com

PassFF will 
* get the login from the "login" entry for supersite.com
* get the login form the "login" field inside the mysite.com entry for mysite.com (see format above)  

Fields names can be set in the preferences


from the plugin preferences you will be able to set :
- Inputs (A comma separated list of input names. Input field names in a html page containing one of those values will be filled with the corresponding value.)
  - Passwords inputs names.
  - Login inputs names.
- Fields (A comma separated list of field names. The first matching field in the password data or in the store tree will be used as the corresponding value.)
  - Login fields names.
  - Password fields names.
  - Url fields names.
- Pass Scrit params
  - The pass script path.
  - Pass home. If empty, use User home.
  - Location of the gpg agent info file containing environment variables (relative to the home).


### The keyboard addicts will be happy

This is a beta. For test purpose only
=========
