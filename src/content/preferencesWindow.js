/* jshint node: true */
'use strict';

const PassFF = require('../modules/main').PassFF;
const Preferences = require('../modules/preferences').Preferences;

function update_callTypeUI() {
 document.querySelectorAll(".shell_radio,.direct_radio").forEach(function (el) {
   el.style.display = "none";
 });
 let cT = "direct";
 if (document.getElementById("pref_callType_shell").checked) {
   cT = "shell";
 }
 document.querySelectorAll("."+cT+"_radio").forEach(function (el) {
   el.style.display = "block";
 });
}

function pref_str_change_cb(key, isInt) {
  return function (evt) {
    let val = evt.target.value;
    if (isInt) val = parseInt(val);
    Preferences.pref_set(key, val);
  };
}

function pref_bool_change_cb(key) {
  return function (evt) {
    Preferences.pref_set(key, evt.target.checked);
  };
}

let promised_init = PassFF.init(false);
window.onload = () => promised_init.then(() => {
  document.querySelectorAll("label,p.text,option").forEach(function (el) {
    el.textContent = PassFF.gsfm(el.textContent);
  });

  for (let cT of ["shell", "direct"]) {
    document.getElementById("pref_callType_" + cT)
      .addEventListener("change", update_callTypeUI);
  }

  for (let [key, val] of Object.entries(Preferences._params)) {
    let el = document.getElementById("pref_" + key);
    if (el !== null) {
      if (el.tagName == "INPUT" && el.type == "text") {
        el.value = val;
        el.addEventListener("change", pref_str_change_cb(key));
      } else if (el.tagName == "INPUT" && el.type == "checkbox") {
        el.checked = val;
        el.addEventListener("change", pref_bool_change_cb(key));
      } else if (el.tagName == "SELECT") {
        el.value = val;
        el.addEventListener("change", pref_str_change_cb(key, true));
      }
    } else {
      el = document.querySelectorAll("input[name=pref_"+key+"]");
      if (el.length > 0 && el[0].tagName == "INPUT" && el[0].type == "radio") {
        el.forEach(function (radioEl) {
          if (radioEl.value == val) {
            radioEl.checked = true;
          } else {
            radioEl.checked = false;
          }
           radioEl.addEventListener("change", pref_str_change_cb(key));
          update_callTypeUI();
        });
      }
    }
  }
});
