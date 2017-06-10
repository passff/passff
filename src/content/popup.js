/* jshint node: true */
'use strict';

const PassFF = require('../modules/main').PassFF;
const Menu = require('../modules/menu').Menu;

let promised_init = PassFF.init(false);
window.onload = () => promised_init.then(() => Menu.init());
