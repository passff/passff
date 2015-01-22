/**
* Controls the browser overlay for the PassFF extension.
*/
PassFF.Menu = {
    _currentMenuIndex : null,
    _stringBundle : null,
    _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),

    init : function() { },

    createStaticMenu : function(doc) {
        let panel = doc.createElement("panelview");
        panel.setAttribute("id", PassFF.Ids.panel);

        let searchlabel = doc.createElement("label");
        searchlabel.setAttribute("id", PassFF.Ids.searchboxlabel);
        searchlabel.setAttribute("control", PassFF.Ids.searchbox);
        searchlabel.setAttribute("value", PassFF.gsfm("passff.toolbar.search.label"));

        let searchtextbox = doc.createElement("textbox");
        searchtextbox.setAttribute("id", PassFF.Ids.searchbox);
        searchtextbox.setAttribute("clickSelectsAll", "true");
        searchtextbox.addEventListener("keypress",PassFF.Menu.onSearchKeypress);
        searchtextbox.addEventListener("keyup",PassFF.Menu.onSearchKeyup);

        let buttonroot = doc.createElement("button");
        buttonroot.setAttribute("id", PassFF.Ids.rootbutton);
        buttonroot.setAttribute("label", PassFF.gsfm("passff.button.root.label"));
        buttonroot.addEventListener("command", PassFF.Menu.onRootButtonCommand);

        let buttoncontext = doc.createElement("button");
        buttoncontext.setAttribute("id", PassFF.Ids.contextbutton);
        buttoncontext.setAttribute("label", PassFF.gsfm("passff.button.context.label"));
        buttoncontext.addEventListener("command", PassFF.Menu.onContextButtonCommand);

        let buttonsbox = doc.createElement("hbox");
        buttonsbox.setAttribute("id", PassFF.Ids.buttonsbox);
        buttonsbox.appendChild(buttonroot);
        buttonsbox.appendChild(buttoncontext);

        let richlistbox = doc.createElement("richlistbox");
        richlistbox.setAttribute("id", PassFF.Ids.entrieslist);
        richlistbox.addEventListener("keydown", PassFF.Menu.onListItemkeydown);
        richlistbox.addEventListener("keyup", PassFF.Menu.onListItemkeyup);

        //********* menubar
        let refreshitem = doc.createElement("menuitem");
        refreshitem.setAttribute("id", PassFF.Ids.refreshmenuitem);
        refreshitem.setAttribute("label", PassFF.gsfm("passff.toolbar.refresh.label"));
        refreshitem.addEventListener("click", PassFF.Menu.onRefresh);

        let prefsitem = doc.createElement("menuitem");
        prefsitem.setAttribute("id", PassFF.Ids.prefsmenuitem);
        prefsitem.setAttribute("label", PassFF.gsfm("passff.toolbar.preferences.label"));
        prefsitem.addEventListener("click", PassFF.Menu.onPreferences);

        let menupopup = doc.createElement("menupopup");
        menupopup.setAttribute("id", PassFF.Ids.optionsmenupopup);
        menupopup.appendChild(refreshitem);
        menupopup.appendChild(prefsitem);

        let optionmenu = doc.createElement("menu")
        optionmenu.setAttribute("id", PassFF.Ids.optionmenu);
        optionmenu.setAttribute("label", PassFF.gsfm("passff.toolbar.options.label"));
        optionmenu.appendChild(menupopup);

        let menubar = doc.createElement("menubar");
        menubar.setAttribute("id", PassFF.Ids.menubar);
        menubar.setAttribute("orient", "vertical");
        menubar.setAttribute("id", PassFF.Ids.menubar);
        menubar.appendChild(optionmenu);
        //******** menubar

        let separator = doc.createElement("menuseparator");
        separator.setAttribute("id", PassFF.Ids.menuseparator);

        panel.appendChild(searchlabel);
        panel.appendChild(searchtextbox);
        panel.appendChild(buttonsbox);
        panel.appendChild(separator);
        panel.appendChild(richlistbox);
        panel.appendChild(menubar);

        return panel;
    },

    onSearchKeypress : function(event) {
        log.debug("[PassFF]", "Search keydown", event);
        if(event.ctrlKey || event.altKey) return false;
        let doc = event.target.ownerDocument;
        if(event.keyCode == 40 || event.keyCode == 13 || event.keyCode == 39) {
            log.debug("[PassFF]", "Select first child")
            let listElm = doc.getElementById(PassFF.Ids.entrieslist);
            if(listElm.firstChild) {
                listElm.firstChild.selected = false;
                let item = listElm.firstChild;
                if (event.keyCode == 40) item = item.nextSibling;
                listElm.selectItem(item)
                item.selected = true;
            }
            if(event.keyCode != 39) listElm.focus();
            event.stopPropagation();
        }
        PassFF.Menu.keyPressManagement(event);
        return false;
    },

    onSearchKeyup : function(event) {
        log.debug("[PassFF]", "Search keyup", event);
        if(event.keyCode <= 46) return false;
        let doc = event.target.ownerDocument;
        PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.getMatchingItems(event.target.value, 6));
    },

    onListItemkeydown : function(event) {
        log.debug("[PassFF]", "List item keydown", event);
        PassFF.Menu.keyPressManagement(event);
    },
    onListItemkeyup : function(event) {
        log.debug("[PassFF]", "List item keyup", event);
        if(event.keyCode <= 46) return false;
        if(event.keyCode == 39) {
            let searchInputElm = doc.getElementById(PassFF.Ids.searchbox);
            searchInputElm.focus()
            event.stopPropagation();
        }
    },

    keyPressManagement : function(event) {
        let doc = event.target.ownerDocument;
        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        if(event.keyCode == 13) {
            if (listElm.selectedItem.onEnterPress) {
                listElm.selectedItem.onEnterPress(event);
            } else {
                listElm.selectedItem.click();
            }
        } else if(event.keyCode == 39) {
            let item = PassFF.Menu.getItem(listElm.selectedItem);
            let doc = event.target.ownerDocument;
            PassFF.Menu.createItemMenuList(doc, item);
        } else if(event.keyCode == 37) {
            let doc = event.target.ownerDocument;
            let item = PassFF.Menu.getItem(listElm.firstChild);
            if (item) {
                PassFF.Menu.createItemMenuList(doc, item);
            } else {
                PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
            }
        } else if(event.keyCode != 40 && event.keyCode != 38) {
            event.target.ownerDocument.getElementById(PassFF.Ids.searchbox).focus();
        }
    },

    onListItemSelected :function(event) {
        log.debug("[PassFF]", "List item selected", event);
        let doc = event.target.ownerDocument;
        let item = PassFF.Menu.getItem(event.target);

        if (item) {
            PassFF.Menu.createItemMenuList(doc, item);
        } else {
            PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
        }
    },

    onContextButtonCommand : function(event) {
        log.debug("[PassFF]", "Context button command", event);
        PassFF.Menu.createContextualMenu(event.target.ownerDocument, event.target.ownerGlobal.content.location.href);
    },

    onRootButtonCommand : function(event) {
        log.debug("[PassFF]", "Root button command", event);
        let doc = event.target.ownerDocument;
        PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
    },

    onRefresh : function(event) {
        log.debug("[PassFF]", "Refresh", event);
        (function() { PassFF.Preferences._init(); }).apply(PassFF.Preferences);
        (function() { PassFF.Pass.init(); }).apply(PassFF.Pass);

        PassFF.Menu.createContextualMenu(event.target.ownerDocument, event.target.ownerGlobal.content.location.href);
    },

    onPreferences : function(event) {
        event.target.ownerGlobal.openDialog( "chrome://passff/content/preferencesWindow.xul", "passff-preferences-window", "chrome,titlebar,toolbar,modal");
    },

    onAutoFillMenuClick : function(event) {
        event.stopPropagation();
        CustomizableUI.hidePanelForNode(event.target);
        PassFF.Page.fillInputs(event.target.ownerGlobal.content.document, PassFF.Menu.getItem(event.target));
    },

    onAutoFillAndSubmitMenuClick : function(event) {
        event.stopPropagation();
        CustomizableUI.hidePanelForNode(event.target);
        let doc = event.target.ownerGlobal.content.document
        PassFF.Page.fillInputs(doc, PassFF.Menu.getItem(event.target));
        PassFF.Page.submit(doc, event.target.ownerGlobal.content.location.href);
    },

    onGoto : function(event) {
        event.stopPropagation();
        let item = PassFF.Menu.getItem(event.target);
        log.debug("[PassFF]", "Goto item url", item);
        CustomizableUI.hidePanelForNode(event.target);
        PassFF.Menu.goToItemUrl(item, event.button != 0, false);
    },

    onGotoAutoFillAndSubmitMenuClick : function(event) {
        event.stopPropagation();
        let item = PassFF.Menu.getItem(event.target);
        log.debug("[PassFF]", "Goto item url fill and submit", item);
        CustomizableUI.hidePanelForNode(event.target);
        PassFF.Menu.goToItemUrl(item, event.button != 0, true);
    },

    onDisplayItemData : function(event) {
        CustomizableUI.hidePanelForNode(event.target);
        let item = PassFF.Menu.getItem(event.target);
        let passwordData = PassFF.Pass.getPasswordData(item);
        let login = passwordData["login"];
        let password = passwordData["password"];
        let title = PassFF.gsfm("passff.display.title");
        let desc = PassFF.gsfm("passff.display.description", [login, password], 2)
        PassFF.Menu._promptService.alert(null, title, desc);
    },

    onCopyToClipboard : function(event) {
        log.debug("[PassFF]", "copy to clipboard", event);
        CustomizableUI.hidePanelForNode(event.target);
        event.stopPropagation();
        let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
        let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
        let clip = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
        let item = PassFF.Menu.getItem(event.target);
        let passwordData = PassFF.Pass.getPasswordData(item);
        str.data = passwordData[PassFF.Menu.getDataKey(event.target)];
        trans.addDataFlavor('text/unicode');
        trans.setTransferData('text/unicode', str, str.data.length * 2);
        clip.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
    },

    clearMenuList : function(doc) {
        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        while (listElm.hasChildNodes()) listElm.removeChild(listElm.firstChild);
        PassFF.Menu._currentMenuIndex = 0;
    },

    createItemMenuList : function(doc, item) {
        log.debug("[PassFF]", "Create item menu", item);

        PassFF.Menu.clearMenuList(doc);
        if (item.hasFields() || item.isLeaf()) PassFF.Menu.createLeafMenuList(doc, item);
        if (!item.isLeaf()) PassFF.Menu.createItemsMenuList(doc, item.children, false);

        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        listElm.insertBefore(PassFF.Menu.createMenuItem(doc, item.parent, "..", PassFF.Menu.onListItemSelected), listElm.firstChild);
    },

    createContextualMenu : function(doc, url) {
        log.debug("[PassFF]", "createContextualMenu", url);
        let items = PassFF.Pass.getUrlMatchingItems(url);
        if (items.length == 0) items = PassFF.Pass.rootItems
        PassFF.Menu.createItemsMenuList(doc, items);
    },

    createItemsMenuList : function(doc, items, cleanMenu) {
        log.debug("[PassFF]", "Create children menu list", items, cleanMenu);
        if (cleanMenu == undefined || cleanMenu == true) PassFF.Menu.clearMenuList(doc);
        //log.debug("[PassFF]", "Create children menu list", new Error().stack);
        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        items.forEach(function(item) {
            if (!item.isField()) {
                let onEnter = null;
                if (item.isLeaf() || item.hasFields()) onEnter = function(event) {
                    CustomizableUI.hidePanelForNode(event.target);
                    let item = PassFF.Menu.getItem(this);
                    PassFF.Menu.goToItemUrl(item, event.shiftKey, true);
                }
                listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, item.fullKey(), PassFF.Menu.onListItemSelected, null, onEnter));
            }
        });
    },

    createLeafMenuList : function(doc, item) {
        PassFF.Menu.clearMenuList(doc);
        log.debug("[PassFF]", "Create leaf menu list", item);
        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.fill")                , PassFF.Menu.onAutoFillMenuClick));
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.fill_and_submit")     , PassFF.Menu.onAutoFillAndSubmitMenuClick));
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.goto_fill_and_submit"), PassFF.Menu.onGotoAutoFillAndSubmitMenuClick));
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.goto")                , PassFF.Menu.onGoto));
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.copy_login")          , PassFF.Menu.onCopyToClipboard, "login"));
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.copy_password")       , PassFF.Menu.onCopyToClipboard, "password"));
        listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, PassFF.gsfm("passff.menu.display")             , PassFF.Menu.onDisplayItemData));
    },

    createMenuItem : function(doc, item, label, onClick, attribute, onEnterPress) {
        let descElm = doc.createElement("label")
        descElm.setAttribute("id", PassFF.Ids.menu + "label" + PassFF.Menu._currentMenuIndex);
        descElm.setAttribute("value", label);

        let xulName = doc.createElement('hbox');
        xulName.setAttribute("id", PassFF.Ids.menu + "hbox" + PassFF.Menu._currentMenuIndex);
        xulName.appendChild(descElm);

        let listItemElm = doc.createElement("richlistitem");
        listItemElm.setAttribute("id", PassFF.Ids.menu + "richlistitem" + PassFF.Menu._currentMenuIndex);
        listItemElm.item = item;
        listItemElm.dataKey = attribute;
        listItemElm.addEventListener("click", onClick);

        listItemElm.onEnterPress = onEnterPress;
        listItemElm.appendChild(xulName);

        PassFF.Menu._currentMenuIndex++;
        return listItemElm;
    },

    goToItemUrl: function(item, newTab, autoFillAndSubmit) {
        if (item == null || item == undefined) return;

        log.debug("[PassFF]", "go to item url", item, newTab, autoFillAndSubmit);
        let passwordData = PassFF.Pass.getPasswordData(item);
        let url = passwordData.url;
        if (url == null || url == undefined) url = item.key;
        if (!url.startsWith("http")) url = "http://" + url;
        if (url != null && url != undefined) {
            let window = Services.wm.getMostRecentWindow("navigator:browser");
            if (newTab) {
                window.gBrowser.selectedTab = window.gBrowser.addTab(url);
            } else {
                window.content.location.href = url;
            }
            if(autoFillAndSubmit) {
                PassFF.Page.autoFillAndSubmitPending = true;
                let currentTabBrowser = window.gBrowser.getBrowserForTab(window.gBrowser.selectedTab);
                currentTabBrowser.addEventListener("load", function load(event) {
                    log.info("[PassFF]", "Start auto-fill")
                    currentTabBrowser.removeEventListener("load", load, true);
                    PassFF.Page.autoFillAndSubmitPending = false;
                    let doc = event.originalTarget;
                    PassFF.Page.fillInputs(doc, item);
                    PassFF.Page.submit(doc, url);
                }, true);
            }
            
        }
    },

    getDataKey : function(node) {
        while (node && node.dataKey == undefined) node = node.parentNode;
        return node ? node.dataKey : null;
    },
    getItem : function(node) {
        while (node && node.item == undefined) node = node.parentNode;
        return node ? node.item : null;
    }
};
