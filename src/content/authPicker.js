/* jshint node: true */
'use strict';

let promised_init = PassFF.init(false);
window.onload = () => promised_init.then(() => PassFF.Menu.init(true));
