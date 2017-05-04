/**
* Controls the browser overlay for the PassFF extension.
*/
/* jshint node: true */
'use strict';

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
      }).catch((error) => {
        log.error("Error restoring menu:", error);
        PassFF.Menu.addMessage(PassFF.gsfm("passff.errors.unexpected_error"));
      });
  },

  createStaticMenu: function(doc) {
    let panel = doc.querySelector('body')
    panel.setAttribute('id', PassFF.Ids.panel);

    let searchBox = doc.querySelector('.searchbar input[type=text]');
    searchBox.setAttribute('id', PassFF.Ids.searchbox);
    searchBox.setAttribute('placeholder',
                               PassFF.gsfm('passff.toolbar.search.placeholder'));
    searchBox.addEventListener('click', function (e) { e.target.select(); });
    searchBox.addEventListener('keypress', PassFF.Menu.onSearchKeypress);
    searchBox.addEventListener('keyup', PassFF.Menu.onSearchKeyup);

    let showAllButton = doc.querySelector('.actions div:nth-child(1) > button');
    showAllButton.setAttribute('id', PassFF.Ids.rootbutton);
    showAllButton.textContent = PassFF.gsfm('passff.button.root.label');
    showAllButton.addEventListener('click', PassFF.Menu.onRootButtonCommand);

    let showMatchingButton = doc.querySelector('.actions div:nth-child(2) > button');
    showMatchingButton.setAttribute('id', PassFF.Ids.contextbutton);
    showMatchingButton.textContent = PassFF.gsfm('passff.button.context.label');
    showMatchingButton.addEventListener('click', PassFF.Menu.onContextButtonCommand);

    let entryList = doc.querySelector('.results select');
    entryList.setAttribute('id', PassFF.Ids.entrieslist);
    entryList.addEventListener('keydown', PassFF.Menu.onListItemkeydown);

    let refreshButton = doc.querySelector('.actions button.reload');
    refreshButton.setAttribute('id', PassFF.Ids.refreshmenuitem);
    refreshButton.setAttribute('title', PassFF.gsfm('passff.toolbar.refresh.label'));
    refreshButton.addEventListener('click', PassFF.Menu.onRefresh);

    let prefsButton = doc.querySelector('.actions button.config');
    prefsButton.setAttribute('id', PassFF.Ids.prefsmenuitem);
    prefsButton.setAttribute('title', PassFF.gsfm('passff.toolbar.preferences.label'));
    prefsButton.addEventListener('click', PassFF.Menu.onPreferences);

    let newPasswordButton = doc.querySelector('.actions button.add');
    newPasswordButton.setAttribute('id', PassFF.Ids.newpasswordmenuitem);
    newPasswordButton.setAttribute('title', PassFF.gsfm('passff.toolbar.new_password.label'));
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
      });
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
        });
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
      });
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
    });
  },

  onRefresh: function(event) {
    log.debug('Refresh', event);
    PassFF.Preferences.init();
    PassFF.bg_exec('refresh')
      .then(() => {
        PassFF.Menu.createContextualMenu(event.target.ownerDocument);
      });
  },

  onPreferences: function(event) {
    PassFF.bg_exec('openOptionsPage');
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
    PassFF.bg_exec('Page.fillInputs', PassFF.Menu.getItem(event.target), false);
    window.close();
  },

  onAutoFillAndSubmitMenuClick: function(event) {
    event.stopPropagation();

    PassFF.bg_exec('Page.fillInputs', PassFF.Menu.getItem(event.target), true);
    window.close();
  },

  onGoto: function(event) {
    event.stopPropagation();

    let item = PassFF.Menu.getItem(event.target);
    log.debug("Goto item url", item);
    PassFF.bg_exec('Page.goToItemUrl', item, event.button !== 0, false, false);
    window.close();
  },

  onGotoAutoFillAndSubmitMenuClick: function(event) {
    event.stopPropagation();

    let item = PassFF.Menu.getItem(event.target);
    log.debug("Goto item url fill and submit", item);
    PassFF.bg_exec('Page.goToItemUrl', item, event.button !== 0, true, true);
    window.close();
  },

  onDisplayItemData: function(event) {
    PassFF
      .bg_exec('Pass.getPasswordData', PassFF.Menu.getItem(event.target))
      .then((passwordData) => window.alert(passwordData.fullText));
  },

  onCopyToClipboard: function(event) {
    event.stopPropagation();

    log.debug("copy to clipboard", event);
    var doc = event.target.ownerDocument;
    var item = PassFF.Menu.getItem(event.target);
    var dataKey = PassFF.Menu.getDataKey(event.target);
    PassFF.bg_exec('Pass.getPasswordData', item)
      .then((passwordData) => {
        let field = doc.getElementById('clipboard-field');
        field.value = passwordData[dataKey];
        field.select();
        doc.execCommand('copy', false, null);
        window.close();
      });
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
      });
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
      });
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
          PassFF.bg_exec('Menu.onEnter', PassFF.Menu.getItem(this), event.shiftKey);
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

    [ ['passff.menu.fill', PassFF.Menu.onAutoFillMenuClick],
      ['passff.menu.fill_and_submit', PassFF.Menu.onAutoFillAndSubmitMenuClick],
      ['passff.menu.goto_fill_and_submit', PassFF.Menu.onGotoAutoFillAndSubmitMenuClick],
      ['passff.menu.goto', PassFF.Menu.onGoto],
      ['passff.menu.copy_login', PassFF.Menu.onCopyToClipboard, 'login'],
      ['passff.menu.copy_password', PassFF.Menu.onCopyToClipboard, 'password'],
      ['passff.menu.display', PassFF.Menu.onDisplayItemData]
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

  addMessage: function(message) {
    let body = document.body;
    let panel = document.createElement('div');
    panel.textContent = message;
    body.insertAdjacentElement('beforeend', panel);
  },
};
