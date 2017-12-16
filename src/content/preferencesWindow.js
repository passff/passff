/* jshint node: true */
'use strict';

function pref_str_change_cb(key, isInt) {
  return function (evt) {
    let val = evt.target.value;
    if (isInt) val = parseInt(val);
    PassFF.Preferences.pref_set(key, val);
  };
}

function pref_bool_change_cb(key) {
  return function (evt) {
    PassFF.Preferences.pref_set(key, evt.target.checked);
  };
}

let promised_init = PassFF.init(false);
window.onload = () => promised_init.then(() => {
  document.querySelectorAll("h1,label,p.text,option").forEach(function (el) {
    el.textContent = PassFF.gsfm(el.textContent);
  });

  for (let [key, val] of Object.entries(PassFF.Preferences._params)) {
    let el = document.getElementById("pref_" + key);
    if (el !== null) {
      if (el.tagName == "TEXTAREA" || el.tagName == "INPUT" && el.type == "text") {
        el.value = val;
        el.addEventListener("change", pref_str_change_cb(key));
      } else if (el.tagName == "INPUT" && el.type == "checkbox") {
        el.checked = val;
        el.addEventListener("change", pref_bool_change_cb(key));
      } else if (el.tagName == "SELECT") {
        el.value = val;
        el.addEventListener("change", pref_str_change_cb(key, true));
      }
    }
  }
});
