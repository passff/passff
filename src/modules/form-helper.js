/* jshint node: true */
'use strict';

var doc = document;
var loginInputTypes = ['text', 'email', 'tel'];
var loginInputNames = [];
var passwordInputNames = [];
var subpageSearchDepth = 5;

function isVisible(element) {
  return (element.offsetHeight !== 0 && element.offsetParent !== null);
}

function getActiveElement(document, depth) {
  depth = depth || 0;
  document = document || window.document;
  if (typeof document.activeElement.contentDocument !== "undefined") {
    if (depth > subpageSearchDepth) {
      return false;
    }
    return getActiveElement(document.activeElement.contentDocument, depth++);
  } else {
    return document.activeElement;
  }
  return false;
}

function getSubmitButton(form) {
  let buttons = form.querySelectorAll('button:not([type=reset]),input[type=submit]');
  let submitButtonPredicates = [
    // explicit submit type
    (button) => button.getAttribute("type") === "submit",
    // the browser interprets an unset or invalid type as submit
    (button) => !["submit", "button"].includes(button.getAttribute("type")),
    // assume that last button in form performs submission via javascript
    (button, index, arr) => index + 1 === arr.length
  ];
  for (let predicate of submitButtonPredicates) {
    let button = [].find.call(buttons, predicate);
    if (button) return button;
  }
  return null;
}

function submit() {
  let passwords = getPasswordInputs();
  if (passwords.length === 0) return false;

  let form = passwords[0].form;
  if (!form) return false;

  let submitBtn = getSubmitButton(form);
  if (submitBtn) {
    submitBtn.click();
  } else {
    form.submit();
  }
  return true;
}

function hasGoodName(fieldName, goodFieldNames) {
  let goodName = false;
  for (let i = 0; i < goodFieldNames.length; i++) {
    goodName = fieldName.toLowerCase().indexOf(goodFieldNames[i].toLowerCase()) >= 0;
    if (goodName) {
      break;
    }
  }
  return goodName;
}

function isPasswordInput(input) {
  let hasGoodN = hasGoodName(input.name ? input.name : input.id, passwordInputNames);
  return (input.type == 'password' || (input.type == 'text' && hasGoodN));
}

function isLoginInput(input) {
  return (loginInputTypes.indexOf(input.type) >= 0 &&
          hasGoodName(input.name ? input.name : input.id, loginInputNames));
}

function isOtherInputCheck(other) {
  return function(input) {
    return (hasGoodName(input.name ? input.name : input.id, Object.keys(other)));
  }
}

function getLoginInputs() {
  return [].filter.call(doc.getElementsByTagName('input'), isLoginInput);
}

function getPasswordInputs() {
  return [].filter.call(doc.getElementsByTagName('input'), isPasswordInput);
}

function getOtherInputs(other) {
  return [].filter.call(doc.getElementsByTagName('input'), isOtherInputCheck(other));
}

function createFakeKeystroke(typeArg, key) {
  return new KeyboardEvent(typeArg, {
    'key': ' ',
    'code': ' ',
    'charCode': ' '.charCodeAt(0),
    'keyCode': ' '.charCodeAt(0),
    'which': ' '.charCodeAt(0),
    'bubbles': true,
    'composed': true,
    'cancelable': true
  });
}

function createFakeInputEvent(typeArg) {
  return new InputEvent(typeArg, {
    'bubbles': true,
    'composed': true,
    'cancelable': true
  })
}

function writeValueWithEvents(input, value) {
  if (!isVisible(input)) return;
  input.dispatchEvent(createFakeKeystroke('keydown'));
  input.value = value;
  input.dispatchEvent(createFakeKeystroke('keyup'));
  input.dispatchEvent(createFakeKeystroke('keypress'));
  input.dispatchEvent(createFakeInputEvent('input'));
  input.dispatchEvent(createFakeInputEvent('change'));
}

function setLoginInputs(login) {
  getLoginInputs().forEach((it) => writeValueWithEvents(it, login));
}

function setPasswordInputs(password) {
  getPasswordInputs().forEach((it) => writeValueWithEvents(it, password));
}

function setOtherInputs(other) {
  getOtherInputs(other).forEach(function(otherInput) {
    let value;
    if (other.hasOwnProperty(otherInput.name)) {
      value = other[otherInput.name];
    } else if (other.hasOwnProperty(otherInput.id)) {
      value = other[otherInput.id];
    }
    if (value) {
      writeValueWithEvents(otherInput, value);
    }
  });
}

function setInputs(passwordData) {
  setLoginInputs(passwordData.login);
  setPasswordInputs(passwordData.password);
  setOtherInputs(passwordData._other);
}

function processDoc(passwordData, depth) {
  depth = depth || 0;
  // clean up before going into subpages
  doc = (depth === 0) ? document : doc;
  setInputs(passwordData);
  if (depth <= subpageSearchDepth) {
    let subpages = doc.querySelectorAll('iframe,frame');
    depth += 1;
    [].forEach.call(subpages, (subpage) => {
      doc = subpage.contentDocument;
      processDoc(passwordData, depth);
    });
  }
  // clean up after scanning subpages
  doc = (depth === 0) ? document : doc;
}

function contextMenuFill(passwordData) {
  let input = getActiveElement();
  input.value = passwordData.login;
  doc = input.form;
  setPasswordInputs(passwordData.password);
  doc = document;
}

function addInputName() {
  let input = getActiveElement();
  if (input.tagName != "INPUT" || loginInputTypes.indexOf(input.type) < 0) {
    return;
  }
  let input_type = (input.type == "password") ? "password" : "login";
  browser.runtime.sendMessage({
    action: "Preferences.addInputName",
    params: [input_type, input.name ? input.name : input.id]
  });
}
