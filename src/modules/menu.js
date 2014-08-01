/**
* Controls the browser overlay for the PassFF extension.
*/
PassFF.Menu = {
    _stringBundle : null,
    _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),

    init : function() { },

    createStaticMenu : function(doc) {
        let panel = doc.createElement("panelview");
        panel.setAttribute("id", PassFF.Ids.panel);

        let searchlabel = doc.createElement("label");
        searchlabel.setAttribute("control", PassFF.Ids.searchbox);
        searchlabel.setAttribute("value", PassFF.gsfm("passff.toolbar.search.label"));

        let searchtextbox = doc.createElement("textbox");
        searchtextbox.setAttribute("id", PassFF.Ids.searchbox);
        searchtextbox.setAttribute("clickSelectsAll", "true");
        searchtextbox.addEventListener("keypress",PassFF.Menu.onSearchKeypress);
        searchtextbox.addEventListener("keyup",PassFF.Menu.onSearchKeyup);

        let buttonroot = doc.createElement("button");
        buttonroot.setAttribute("label", PassFF.gsfm("passff.button.root.label"));
        buttonroot.addEventListener("command", PassFF.Menu.onRootButtonCommand);

        let buttoncontext = doc.createElement("button");
        buttoncontext.setAttribute("label", PassFF.gsfm("passff.button.context.label"));
        buttoncontext.addEventListener("command", PassFF.Menu.onContextButtonCommand);

        let buttonsbox = doc.createElement("hbox");
        buttonsbox.appendChild(buttonroot);
        buttonsbox.appendChild(buttoncontext);

        let richlistbox = doc.createElement("richlistbox");
        richlistbox.setAttribute("id", PassFF.Ids.entrieslist);
        richlistbox.addEventListener("keydown", PassFF.Menu.onListItemkeyPress);

        //********* menubar
        let refreshitem = doc.createElement("menuitem");
        refreshitem.setAttribute("label", PassFF.gsfm("passff.toolbar.refresh.label"));
        refreshitem.addEventListener("click", PassFF.Menu.onRefresh);

        let prefsitem = doc.createElement("menuitem");
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
        console.debug("[PassFF]", "Search keydown", event);
        let doc = event.target.ownerDocument;
        if(event.keyCode == 40) {
            console.debug("[PassFF]", "Arrow down")
            let listElm = doc.getElementById(PassFF.Ids.entrieslist);
            if(listElm.firstChild) listElm.firstChild.selected = false;
            listElm.selectItem(listElm.firstChild)
            listElm.focus();
            event.stopPropagation();
            return false;
        }
        if(event.keyCode == 13) {
            let listElm = doc.getElementById(PassFF.Ids.entrieslist);
            listElm.selectItem(listElm.firstChild)
            console.debug("[PassFF]", "Selected item", listElm.selectedItem)
            if (listElm.selectedItem.onEnterPress) {
                listElm.selectedItem.onEnterPress(event);
            } else {
                listElm.selectedItem.click();
            }
        }
    },

    onSearchKeyup : function(event) {
        let doc = event.target.ownerDocument;
        PassFF.Menu.clearMenuList(doc);
        PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.getMatchingItems(event.target.value, 6));
    },

    onListItemkeyPress : function(event) {
        console.debug("[PassFF]", "List item keydown", event);
        if(event.keyCode == 13) {
            if (event.target.selectedItem.onEnterPress) {
                event.target.selectedItem.onEnterPress(event);
            } else {
                event.target.selectedItem.click();
            }
        } else if(event.keyCode == 39) {
            let item = PassFF.Menu.getItem(event.target.selectedItem);
            let doc = event.target.ownerDocument;
            PassFF.Menu.clearMenuList(doc);
            PassFF.Menu.createLeafMenuList(doc, item);
        } else if(event.keyCode != 40 && event.keyCode != 38) {
            event.target.ownerDocument.getElementById(PassFF.Ids.searchbox).focus();
        }
    },

    onListItemSelected :function(event) {
        console.debug("[PassFF]", "List item selected", event);
        let doc = event.target.ownerDocument;
        let item = PassFF.Menu.getItem(event.target);

        PassFF.Menu.clearMenuList(doc);
        if (item) {
            PassFF.Menu.createItemMenuList(doc, item);
        } else {
            PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
        }
    },

    onContextButtonCommand : function(event) {
        console.debug("[PassFF]", "All button command", event);
        PassFF.Menu.createContextualMenu(event.target.ownerDocument, event.target.ownerGlobal.content.location.href);
    },

    onRootButtonCommand : function(event) {
        console.debug("[PassFF]", "All button command", event);
        let doc = event.target.ownerDocument;
        PassFF.Menu.clearMenuList(doc);
        PassFF.Menu.createItemsMenuList(doc, PassFF.Pass.rootItems);
    },

    onRefresh : function(event) {
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
        console.debug("[PassFF]", "Goto item url", item);
        CustomizableUI.hidePanelForNode(event.target);
        PassFF.Menu.goToItemUrl(item, event.button != 0, false);
    },

    onGotoAutoFillAndSubmitMenuClick : function(event) {
        event.stopPropagation();
        let item = PassFF.Menu.getItem(event.target);
        console.debug("[PassFF]", "Goto item url fill and submit", item);
        CustomizableUI.hidePanelForNode(event.target);
        PassFF.Menu.goToItemUrl(item, event.button != 0, true);
    },

    onDisplayItemData : function(event) {
        let item = PassFF.Menu.getItem(event.target);
        let passwordData = PassFF.Pass.getPasswordData(item);
        let login = passwordData["login"];
        let password = passwordData["password"];
        let title = PassFF.gsfm("passff.display.title");
        let desc = PassFF.gsfm("passff.display.description", [login, password], 2)
        CustomizableUI.hidePanelForNode(event.target);
        PassFF.Menu._promptService.alert(null, title, desc);
    },

    onCopyToClipboard : function(event) {
        console.debug("[PassFF]", "copy to clipboard", event);
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
        CustomizableUI.hidePanelForNode(event.target);
    },

    clearMenuList : function(doc) {
        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        while (listElm.hasChildNodes()) listElm.removeChild(listElm.firstChild);
    },

    createItemMenuList : function(doc, item) {
        console.debug("[PassFF]", "Create item menu", item);

        PassFF.Menu.clearMenuList(doc);
        if (item.hasFields() || item.isLeaf()) PassFF.Menu.createLeafMenuList(doc, item);
        if (!item.isLeaf()) PassFF.Menu.createItemsMenuList(doc, item.children);

        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        listElm.insertBefore(PassFF.Menu.createMenuItem(doc, item.parent, "..", PassFF.Menu.onListItemSelected), listElm.firstChild);
    },

    createContextualMenu : function(doc, url) {
        console.debug("[PassFF]", "createContextualMenu", url);
        let items = PassFF.Pass.getUrlMatchingItems(url);
        if (items.length == 0) items = PassFF.Pass.rootItems
        PassFF.Menu.clearMenuList(doc);
        PassFF.Menu.createItemsMenuList(doc, items);
    },

    createItemsMenuList : function(doc, items) {
        console.debug("[PassFF]", "Create children menu list", items);
        let listElm = doc.getElementById(PassFF.Ids.entrieslist);
        items.forEach(function(item) {
            if (!item.isField()) listElm.appendChild(PassFF.Menu.createMenuItem(doc, item, item.fullKey(), PassFF.Menu.onListItemSelected, null, function(event) {
                let item = PassFF.Menu.getItem(this);
                PassFF.Menu.goToItemUrl(item, event.shiftKey, true);
                CustomizableUI.hidePanelForNode(event.target);
            } ));
        });
    },

    createLeafMenuList : function(doc, item) {
        console.debug("[PassFF]", "Create leaf menu list", item);
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
        descElm.setAttribute("value", label);

        let xulName = doc.createElement('hbox');
        xulName.appendChild(descElm);

        let listItemElm = doc.createElement("richlistitem");
        listItemElm.item = item;
        listItemElm.dataKey = attribute;
        listItemElm.addEventListener("click", onClick);

        listItemElm.onEnterPress = onEnterPress;
        listItemElm.appendChild(xulName);

        return listItemElm;
    },

    goToItemUrl: function(item, newTab, autoFillAndSubmit) {
        if (item == null || item == undefined) return;

        if (autoFillAndSubmit) PassFF.Page.itemToUse = item;
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
