/**
* Controls the browser overlay for the PassFF extension.
*/
/* jshint node: true */
'use strict';

let logAndDisplayError = (errorMessage) => {
  return (error) => {
    log.error(errorMessage, ":", error);
    PassFF.Menu.addMessage(PassFF.gsfm("passff_errors_unexpected_error"));
  };
};

PassFF.Menu = {
  _currentMenuIndex: null,
  _stringBundle: null,

  init: function () {
    log.debug("Initializing Menu");
    let doc = document;
    PassFF.Menu.createStaticMenu(doc);
    PassFF.bg_exec('Menu.restore')
      .then((menu_state) => {
        if(menu_state['items'] == null) {
          PassFF.Menu.createContextualMenu(doc);
        } else {
          let searchInput = doc.getElementById(PassFF.Ids.searchbox);
          searchInput.value = menu_state['search_val'];
          if(menu_state['items'] instanceof Array) {
            PassFF.Menu.createItemsMenuList(doc, menu_state['items']);
            searchInput.focus();
          } else {
            PassFF.Menu.createItemMenuList(doc, menu_state['items']);
            searchInput.focus();
          }
        }
      }).catch(logAndDisplayError("Error restoring menu"));
  },

  createStaticMenu: function(doc) {
    let panel = doc.querySelector('body')
    panel.setAttribute('id', PassFF.Ids.panel);

    let searchBox = doc.querySelector('.searchbar input[type=text]');
    searchBox.setAttribute('id', PassFF.Ids.searchbox);
    searchBox.setAttribute('placeholder',
                               PassFF.gsfm('passff_toolbar_search_placeholder'));
    searchBox.addEventListener('click', function (e) { e.target.select(); });
    searchBox.addEventListener('keypress', PassFF.Menu.onSearchKeypress);
    searchBox.addEventListener('keyup', PassFF.Menu.onSearchKeyup);

    let showAllButton = doc.querySelector('.actions div:nth-child(1) > button');
    showAllButton.setAttribute('id', PassFF.Ids.rootbutton);
    showAllButton.textContent = PassFF.gsfm('passff_button_root_label');
    showAllButton.addEventListener('click', PassFF.Menu.onRootButtonCommand);

    let showMatchingButton = doc.querySelector('.actions div:nth-child(2) > button');
    showMatchingButton.setAttribute('id', PassFF.Ids.contextbutton);
    showMatchingButton.textContent = PassFF.gsfm('passff_button_context_label');
    showMatchingButton.addEventListener('click', PassFF.Menu.onContextButtonCommand);

    let entryList = doc.querySelector('.results select');
    entryList.setAttribute('id', PassFF.Ids.entrieslist);
    entryList.addEventListener('keydown', PassFF.Menu.onListItemkeydown);

    let refreshButton = doc.querySelector('.actions button.reload');
    refreshButton.setAttribute('id', PassFF.Ids.refreshmenuitem);
    refreshButton.setAttribute('title', PassFF.gsfm('passff_toolbar_refresh_label'));
    refreshButton.addEventListener('click', PassFF.Menu.onRefresh);

    let prefsButton = doc.querySelector('.actions button.config');
    prefsButton.setAttribute('id', PassFF.Ids.prefsmenuitem);
    prefsButton.setAttribute('title', PassFF.gsfm('passff_toolbar_preferences_label'));
    prefsButton.addEventListener('click', PassFF.Menu.onPreferences);

    let newPasswordButton = doc.querySelector('.actions button.add');
    newPasswordButton.setAttribute('id', PassFF.Ids.newpasswordmenuitem);
    newPasswordButton.setAttribute('title', PassFF.gsfm('passff_toolbar_new_password_label'));
    newPasswordButton.addEventListener('click', PassFF.Menu.onNewPassword);

    return panel;
  },

  onSearchKeypress: function(event) {
    log.debug('Search keydown', event);

    if (event.ctrlKey || event.altKey) {
      return false;
    }

    if (event.keyCode == 40 || event.keyCode == 13 || event.keyCode == 39) {
      /* DOWN ARROW, RETURN, RIGHT ARROW */
      let doc = event.target.ownerDocument;
      let listElm = doc.getElementById(PassFF.Ids.entrieslist);

      if (listElm.firstChild) {
        log.debug('Select first child');
        listElm.firstChild.selected = true;
        if (event.keyCode != 39) {
          listElm.focus();
        }
      }

      event.stopPropagation();
    }
    PassFF.Menu.keyPressManagement(event);

    return false;
  },

  onSearchKeyup: function(event) {
    log.debug('Search keyup', event);

    if (event.keyCode <= 46 && event.keyCode != 8) {
      /* non-alphanumeric and not BACKSPACE */
      return false;
    }

    let doc = event.target.ownerDocument;
    if("" == event.target.value) {
      PassFF.Menu.createContextualMenu(doc);
      return false;
    }
    PassFF.bg_exec('Pass.getMatchingItems', event.target.value, 6)
      .then((matchingItems) => {
        PassFF.Menu.createItemsMenuList(doc, matchingItems);
      }).catch(logAndDisplayError("Error getting metching items"));
  },

  onListItemkeydown: function(event) {
    log.debug('List item keydown', event);
    PassFF.Menu.keyPressManagement(event);
  },

  keyPressManagement: function(event) {
    let doc = event.target.ownerDocument;
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    if (event.keyCode == 13) {
      /* RETURN */
      if (listElm.selectedIndex < 0) {
        return;
      } else if (listElm[listElm.selectedIndex].onEnterPress) {
        listElm[listElm.selectedIndex].onEnterPress(event);
      } else {
        listElm[listElm.selectedIndex].click();
      }
    } else if (event.keyCode == 39) {
      /* RIGHT ARROW */
      let item = PassFF.Menu.getItem(listElm[listElm.selectedIndex]);
      if (item) {
        PassFF.Menu.createItemMenuList(doc, item);
      }
    } else if (event.keyCode == 37) {
      /* LEFT ARROW */
      let item = PassFF.Menu.getItem(listElm.firstChild);
      if (item) {
        PassFF.Menu.createItemMenuList(doc, item);
      } else {
        PassFF.bg_exec('Pass.rootItems').then((rootItems) => {
          PassFF.Menu.createItemsMenuList(doc, rootItems);
        }).catch(logAndDisplayError("Error getting root items"));
      }
    } else if (!event.shiftKey && event.keyCode != 40 && event.keyCode != 38) {
      /* NOT: SHIFT, DOWN ARROW, UP ARROW */
      doc.getElementById(PassFF.Ids.searchbox).focus();
    }
  },

  onListItemSelected: function(event) {
    log.debug('List item selected', event);
    let doc = event.target.ownerDocument;
    let item = PassFF.Menu.getItem(event.target);

    if (item !== null) {
      PassFF.Menu.createItemMenuList(doc, item);
    } else {
      PassFF.bg_exec('Pass.rootItems').then((rootItems) => {
        PassFF.Menu.createItemsMenuList(doc, rootItems);
      }).catch(logAndDisplayError("Error getting root items on list item selected"));
    }
  },

  onContextButtonCommand: function(event) {
    log.debug('Context button command', event);
    PassFF.Menu.createContextualMenu(event.target.ownerDocument);
  },

  onRootButtonCommand: function(event) {
    log.debug('Root button command', event);
    let doc = event.target.ownerDocument;
    PassFF.bg_exec('Pass.rootItems').then((rootItems) => {
      PassFF.Menu.createItemsMenuList(doc, rootItems);
      let searchInput = doc.querySelector("input[type='text']");
      searchInput.value = "";
      searchInput.focus();
    }).catch(logAndDisplayError("Error getting root items on button press"));
  },

  onRefresh: function(event) {
    log.debug('Refresh', event);

    // remove any lingering messages
    let messages = document.getElementsByClassName('message');
    Array.prototype.forEach.call(messages, (el) => {
      el.parentNode().removeChild(el);
    });

    // update preferences and passwords
    PassFF.Preferences.init();
    PassFF.bg_exec('refresh')
      .then(() => {
        PassFF.Menu.createContextualMenu(event.target.ownerDocument);
      }).catch(logAndDisplayError("Error refreshing menu"));
  },

  onPreferences: function(event) {
    PassFF.bg_exec('openOptionsPage').catch(logAndDisplayError("Error opening preferences"));
    window.close()
  },

  onNewPassword: function(event) {
    browser.windows.create({
      'url': browser.extension.getURL('content/newPasswordWindow.html'),
      'width': 450,
      'height': 330,
      'type': 'popup'
    });
    window.close();
  },

  onAutoFillMenuClick: function(event) {
    event.stopPropagation();
    PassFF.bg_exec('Page.fillInputs', PassFF.Menu.getItem(event.target), false)
      .catch(logAndDisplayError("Error on auto-fill button press"));
    window.close();
  },

  onAutoFillAndSubmitMenuClick: function(event) {
    event.stopPropagation();

    PassFF.bg_exec('Page.fillInputs', PassFF.Menu.getItem(event.target), true)
      .catch(logAndDisplayError("Error on auto-fill-and-submit button press"));
    window.close();
  },

  onGoto: function(event) {
    event.stopPropagation();

    let item = PassFF.Menu.getItem(event.target);
    log.debug("Goto item url", item);
    PassFF.bg_exec('Page.goToItemUrl', item, event.button !== 0, false, false)
      .catch(logAndDisplayError("Error on goto button press"));
    window.close();
  },

  onGotoAutoFillAndSubmitMenuClick: function(event) {
    event.stopPropagation();

    let item = PassFF.Menu.getItem(event.target);
    log.debug("Goto item url fill and submit", item);
    PassFF.bg_exec('Page.goToItemUrl', item, event.button !== 0, true, true)
      .catch(logAndDisplayError("Error on goto-auto-fill-and-submit button press"));
    window.close();
  },

  onDisplayItemData: function(event) {
    PassFF
      .bg_exec('Pass.getPasswordData', PassFF.Menu.getItem(event.target))
      .then((passwordData) => window.alert(passwordData.fullText))
      .catch(logAndDisplayError("Error getting password data on display item"));
  },

  onCopyToClipboard: function(event) {
    event.stopPropagation();

    log.debug("copy to clipboard", event);
    var doc = event.target.ownerDocument;
    var item = PassFF.Menu.getItem(event.target);
    var dataKey = PassFF.Menu.getDataKey(event.target);
    PassFF.bg_exec('Menu.onCopyToClipboard', item, dataKey);
    window.close();
  },

  clearMenuList: function(doc) {
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);
    while (listElm.hasChildNodes()) {
      listElm.removeChild(listElm.firstChild);
    }
    PassFF.Menu._currentMenuIndex = 0;
  },

  createItemMenuList: function(doc, item_id) {
    PassFF.bg_exec('Pass.getItemById', item_id)
      .then((item) => {
        log.debug("Create item menu", item);

        PassFF.Menu.clearMenuList(doc);
        if (item.hasFields || item.isLeaf) {
          PassFF.Menu.createLeafMenuList(doc, item);
        }
        if (!item.isLeaf) {
          PassFF.Menu.createItemsMenuList(doc, item.children, false);
        }

        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        let newItem = PassFF.Menu.createMenuItem(doc, item.parent, '..',
          PassFF.Menu.onListItemSelected);
        listElm.insertBefore(newItem, listElm.firstChild);
      }).catch(logAndDisplayError("Error getting item by id while creating item menu list"));
  },

  createContextualMenu: function(doc) {
    if (doc === null) {
      doc = document;
    }
    log.debug("Create contextual menu");
    PassFF.bg_exec('Pass.getUrlMatchingItems')
      .then((items) => {
        PassFF.Menu.createItemsMenuList(doc, items);
        let searchInput = doc.getElementById(PassFF.Ids.searchbox);
        searchInput.value = "";
        searchInput.focus();
      }).catch(logAndDisplayError("Error getting matching items on create contextual menu"));
  },

  createItemsMenuList: function(doc, items, cleanMenu) {
    log.debug("Create children menu list", items, cleanMenu);

    if (cleanMenu === undefined || cleanMenu) {
      PassFF.Menu.clearMenuList(doc);
    }

    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    items.forEach(function(item) {
      if (item.isField) {
        return;
      }

      let onEnter = null;
      if (item.isLeaf || item.hasFields) {
        onEnter = function(event) {
          PassFF.bg_exec('Menu.onEnter', PassFF.Menu.getItem(this), event.shiftKey)
            .catch(logAndDisplayError("Error entering menu"));
          window.close();
        };
      }

      let label = item.fullKey;
      if (label != '..' && !item.isLeaf) {
        label += '/';
      }

      listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, label,
                                                     PassFF.Menu.onListItemSelected,
                                                     null, onEnter));
    });
  },

  createLeafMenuList: function(doc, item) {
    PassFF.Menu.clearMenuList(doc);

    log.debug('Create leaf menu list', item);
    let listElm = doc.getElementById(PassFF.Ids.entrieslist);

    [ ['passff_menu_fill', PassFF.Menu.onAutoFillMenuClick],
      ['passff_menu_fill_and_submit', PassFF.Menu.onAutoFillAndSubmitMenuClick],
      ['passff_menu_goto_fill_and_submit', PassFF.Menu.onGotoAutoFillAndSubmitMenuClick],
      ['passff_menu_goto', PassFF.Menu.onGoto],
      ['passff_menu_copy_login', PassFF.Menu.onCopyToClipboard, 'login'],
      ['passff_menu_copy_password', PassFF.Menu.onCopyToClipboard, 'password'],
      ['passff_menu_display', PassFF.Menu.onDisplayItemData]
    ].forEach(function(data) {
      let newItem = PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm(data[0]), data[1],
                                               data.length == 3 ? data[2] : undefined);
      listElm.appendChild(newItem);
    });
  },

  createMenuItem: function(doc, item, label, onClick, attribute, onEnterPress) {
    let listItemElm = doc.createElement('option');
    listItemElm.setAttribute('id', PassFF.Ids.menu + 'richlistitem' +
                                   PassFF.Menu._currentMenuIndex);
    listItemElm.item = (item === null) ? null : item.id;
    listItemElm.dataKey = attribute;
    listItemElm.addEventListener('click', onClick);

    listItemElm.onEnterPress = onEnterPress;
    listItemElm.textContent = label;

    PassFF.Menu._currentMenuIndex++;
    return listItemElm;
  },

  getDataKey: function(node) {
    while (node && node.dataKey === undefined) {
      node = node.parentNode;
    }
    return node ? node.dataKey : null;
  },

  getItem: function(node) {
    while (node && node.item === undefined) {
      node = node.parentNode;
    }
    return node ? node.item : null;
  },

  addMessage: function(message, severity) {
    let body  = document.body,
        panel = document.createElement('div'),
        dismissControl = document.createElement('a'),
        messageNode = document.createTextNode(message);
    if (typeof severity === 'undefined') severity = 'error';
    panel.classList.add('message', severity);
    dismissControl.classList.add('dismiss');
    dismissControl.innerHTML = '&times;';
    dismissControl.addEventListener('click', () => body.removeChild(panel));
    panel.appendChild(dismissControl);
    panel.appendChild(messageNode);
    body.insertAdjacentElement('beforeend', panel);
  },
};
