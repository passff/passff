/* jshint node: true */
'use strict';

const PassFF = require('../modules/main').PassFF;
const Preferences = require('../modules/preferences').Preferences;

function _(msg_id) {
    return PassFF.gsfm("passff.newpassword." + msg_id);
}

function isPresent(field, errorMsg) {
  return function(inputData) {
    if (!inputData[field] || !/\S/.test(inputData[field])) {
      return errorMsg;
    }
  };
}

function matches(field1, field2, errorMsg) {
  return function(inputData) {
    if (inputData[field1] !== inputData[field2]) {
      return errorMsg;
    }
  };
}

function validateInput(validations, inputData) {
  return validations.reduce(function(errors, validatorFn) {
    let error = validatorFn(inputData);
    if (error) {
      errors.push(error);
    }
    return errors;
  }, []);
}

function emptyElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function makePasswordAdder(validations, errorsContainerId, getInput, addPassword) {
  return function() {
    try {
      let inputData = getInput(),
          errorsContainer = document.getElementById(errorsContainerId),
          errors = validateInput(validations, inputData);

      emptyElement(errorsContainer);

      if (errors.length > 0) {
        errors.forEach(function(errorMsg) {
          let errorLabel = document.createElement('p');
          errorLabel.textContent = errorMsg;
          errorsContainer.appendChild(errorLabel);
        });
      } else {
        PassFF.bg_exec("Pass.isPasswordNameTaken", inputData.name)
        .then((result) => {
          if (result) {
            let confirmation = window.confirm(
              _("inputs.overwrite_password_prompt")
            );
            if (!confirmation) {
              return;
            }
          }
          return addPassword(inputData);
        }).then((result) => {
          if (result) {
            PassFF.bg_exec("refresh");
            browser.windows.getCurrent().then((win) => {
              browser.windows.remove(win.id);
            });
          } else if (result === false) {
            window.alert(
              _("errors.pass_execution_failed") + ":\n" + JSON.stringify(result)
            );
          };
        });
      }
    } catch (e) {
      window.alert(
        _("errors.unexpected_error") + ":\n" + e.name + ' ' + e.message
      );
    }
  };
}

let promised_init = PassFF.init(false);
window.onload = () => promised_init.then(() => {
  document.querySelectorAll("label,p.text,option,button").forEach(function (el) {
      el.textContent = PassFF.gsfm(el.textContent);
  });

  document.getElementById("gen-password-length").value = Preferences.defaultPasswordLength;
  document.getElementById("gen-include-symbols").checked = Preferences.defaultIncludeSymbols;
  if (!Preferences.preferInsert) {
      document.getElementById("tab0").setAttribute("checked", true);
  }

  let addValidations = [
    isPresent('name', _("errors.name_is_required")),
    isPresent('password', _("errors.password_is_required")),
    matches('password', 'passwordConfirmation', _("errors.password_confirmation_mismatch")),
  ];

  let genValidations = [
    isPresent('name', _("errors.name_is_required")),
  ];

  var onAddPassword = makePasswordAdder(
    addValidations,
    'add-errors-container',
    function() {
      return {
        name                 : document.getElementById('add-password-name').value,
        password             : document.getElementById('add-password').value,
        passwordConfirmation : document.getElementById('add-password-confirmation').value,
        additionalInfo       : document.getElementById('add-additional-info').value,
      };
    },
    function(inputData) {
      return PassFF.bg_exec("Pass.addNewPassword",
        inputData.name, inputData.password, inputData.additionalInfo);
    }
  );

  var onGeneratePassword = makePasswordAdder(
    genValidations,
    'gen-errors-container',
    function() {
      return {
        name           : document.getElementById('gen-password-name').value,
        length         : document.getElementById('gen-password-length').value,
        includeSymbols : document.getElementById('gen-include-symbols').checked,
      };
    },
    function(inputData) {
      return PassFF.bg_exec("Pass.generateNewPassword",
        inputData.name, inputData.length, inputData.includeSymbols);
    }
  );

  let saveButton = document.getElementById("save-button");
  saveButton.addEventListener('click', onAddPassword);
  let genSaveButton = document.getElementById("gen-save-button");
  genSaveButton.addEventListener('click', onGeneratePassword);
});
