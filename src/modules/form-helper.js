/* jshint node: true */
'use strict';

var doc = document;
var loginInputTypes = ['text', 'email', 'tel'];
var loginInputNames = [];
var passwordInputNames = [];
var subpageSearchDepth = 0;

function getSubmitButton(form) {
  let buttons = form.querySelectorAll('button:not([type=reset])');

  if (buttons.length === 0) {
    buttons = Array.prototype.slice
                             .call(form.querySelectorAll('input[type=submit]'));
  }

  if (buttons.length === 0) {
    return null;
  }

  let submitButtonPredicates = [
    // explicit submit type
    (button) => button.getAttribute("type") === "submit",
    // the browser interprets an unset or invalid type as submit
    (button) => !Array.prototype.includes
                                .call(["submit", "button"], button.getAttribute("type")),
    // assume that last button in form performs submission via javascript
    (button, index, arr) => index + 1 === arr.length
  ];

  for (let predicate of submitButtonPredicates) {
    let button = Array.prototype.find.call(buttons, predicate);
    if (button) {
      return button;
    }
  }
}

function searchParentForm(input) {
  while (input !== null && input.tagName.toLowerCase() != 'form') {
    input = input.parentNode;
  }

  return input;
}

function submit() {
  let passwords = getPasswordInputs();
  if (passwords.length === 0) {
    return;
  }

  let form = searchParentForm(passwords[0]);
  if (!form) {
    // No form found to submit
    return;
  }

  let submitBtn = getSubmitButton(form);
  if (submitBtn) {
    submitBtn.click();
  } else {
    form.submit();
  }
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
  return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                              .filter(isLoginInput);
}

function getPasswordInputs() {
  return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                              .filter(isPasswordInput);
}

function getOtherInputs(other) {
  return Array.prototype.slice.call(doc.getElementsByTagName('input'))
                              .filter(isOtherInputCheck(other));
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

function processDoc(d, passwordData, depth) {
  setInputs(passwordData);
  if (depth <= subpageSearchDepth) {
    let subpages = [
      ...d.getElementsByTagName('iframe'),
      ...d.getElementsByTagName('frame')
    ];
    Array.prototype.slice.call(subpages).forEach(function(subpage) {
      processDoc(subpage.contentDocument, passwordData, depth++);
    });
  }
}

function contextMenuFill(passwordData) {
  document.activeElement.value = passwordData.login;
  setPasswordInputs(passwordData.password);
}

function addInputName() {
  let input = document.activeElement;
  if (input.tagName != "INPUT" || loginInputTypes.indexOf(input.type) < 0) {
    return;
  }
  let input_type = (input.type == "password") ? "password" : "login";
  browser.runtime.sendMessage({
    action: "Preferences.addInputName",
    params: [input_type, input.name ? input.name : input.id]
  });
}
