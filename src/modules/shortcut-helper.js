/* jshint node: true */
'use strict';

function checkKeyboardEventShortcut(event, shortcut) {
  if (shortcut.commandLetter !== event.key) {
    return false;
  }

  for (var modifier in shortcut.expectedModifierState) {
    if (shortcut.expectedModifierState[modifier] !==
        event.getModifierState(modifier)) {
      return false;
    }
  }

  return true;
}

function getShortcutFromString(str) {
  // Mapping between modifier names in manifest.json and DOM KeyboardEvent.
  let commandModifiers = {
    'Ctrl': browser.runtime.PlatformOs == 'mac' ? 'Meta' : 'Control',
    'MacCtrl': 'Control',
    'Command': 'Meta',
    'Alt': 'Alt',
    'Shift': 'Shift'
  };

  let shortcut = {
    commandLetter: '',
    expectedModifierState: {
        'Alt': false,
        'Meta': false,
        'Control': false,
        'Shift': false
    }
  };

  str.split(/\s*\+\s*/).forEach((part) => {
    if (commandModifiers.hasOwnProperty(part)) {
      shortcut.expectedModifierState[commandModifiers[part]] = true;
    } else {
      shortcut.commandLetter = part.toLowerCase();
    }
  });

  return shortcut;
}

function getCommandByName(name) {
  return browser.commands.getAll().then((commands) => {
    let shortcut = null;
    commands.forEach((command) => {
      if (name == command.name && command.shortcut) {
        shortcut = getShortcutFromString(command.shortcut);
      }
    });
    return shortcut;
  });
}

