/**
* Controls the browser overlay for the PassFF extension.
*/
PassFF.Menu = {
    _stringBundle : null,
    _promptService : Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService),

    init : function() {
        let stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
        this._stringBundle = stringBundleService.createBundle("chrome://passff/locale/strings.properties");

            //this.createMenu();
    },

    //installButton : function(toolbarId, id, afterId) {
        //if (!document.getElementById(id)) {
            //let toolbar = document.getElementById(toolbarId);

            //// If no afterId is given, then append the item to the toolbar
            //let before = null;
            //if (afterId) {
                //let elem = document.getElementById(afterId);
                //if (elem && elem.parentNode == toolbar) before = elem.nextElementSibling;
            //}

            //toolbar.insertItem(id, before);
            //toolbar.setAttribute("currentset", toolbar.currentSet);
            //document.persist(toolbar.id, "currentset")

            //if (toolbarId == "addon-bar") toolbar.collapsed = false;
        //}
    //},

    createStaticMenu : function(doc) {
        let panel = doc.createElement("panelview");
        panel.setAttribute("id", "passff-panel");

        let searchlabel = doc.createElement("label");
        searchlabel.setAttribute("control", "search");
        searchlabel.setAttribute("value", "Search :");

        let searchtextbox = doc.createElement("textbox");
        searchtextbox.setAttribute("id", "search");


        //menus container
        let menubar = doc.createElement("menubar");
        menubar.setAttribute("orient", "vertical");
        menubar.setAttribute("id", "menu");

        //option menu
        let optionmenu = doc.createElement("menu")
        optionmenu.setAttribute("id", "options-menu");
        optionmenu.setAttribute("label", "Options");
        let menupopup = doc.createElement("menupopup");
        menupopup.setAttribute("id", "options-menu-popup");
        let refreshitem = doc.createElement("menuitem");
        refreshitem.setAttribute("label", "Refresh");
        let prefsitem = doc.createElement("menuitem");
        prefsitem.setAttribute("label", "Preferences");

        //Tree menu
        let treemenu = doc.createElement("menu");
        treemenu.setAttribute("id", "tree-menu");
        treemenu.setAttribute("label", "Tree");
        let passffmenupopup = doc.createElement("menupopup");
        passffmenupopup.setAttribute("id", "passff-menu");

        let contextmenu = doc.createElement("menubar");
        contextmenu.setAttribute("id", "contextual-menu");
        contextmenu.setAttribute("orient", "vertical");

        let separator = doc.createElement("menuseparator");
        separator.setAttribute("id", "menu-separator");
        

        //let tree = doc.createElement("tree");
        //tree.setAttribute("id", "testTree")
        //tree.setAttribute("flex", 1)
        //let treecols = doc.createElement("treecols");
        //let treecol1 = doc.createElement("treecol");
        //treecol1.setAttribute("id", "element");
        //treecol1.setAttribute("label", "Element");
        //treecol1.setAttribute("primary", "true");
        //treecol1.setAttribute("flex", 1);
        //treecols.appendChild(treecol1);
        //let treecol2 = doc.createElement("treecol");
        //treecol2.setAttribute("flex", 2);
        //treecol2.setAttribute("id", "subject");
        //treecol2.setAttribute("label", "Subject");
        //treecols.appendChild(treecol2);
        //tree.appendChild(treecols);
        //let treechildren = doc.createElement("treechildren");
        //let treeitem1 = doc.createElement("treeitem");
        //let treerow1 = doc.createElement("treerow");
        //let treecell1 = doc.createElement("treecell");
        //treecell1.setAttribute("label", "toto")
        //treerow1.appendChild(treecell1);
        //let treecell2 = doc.createElement("treecell");
        //treecell2.setAttribute("label", "toto")
        //treerow1.appendChild(treecell2);
        //treeitem1.appendChild(treerow1);
        //treechildren.appendChild(treeitem1)
        //tree.appendChild(treechildren);
        //tree.view = {
            //childData : {
                //Solids: ["Silver", "Gold", "Lead"],
                //Liquids: ["Mercury"],
                //Gases: ["Helium", "Nitrogen"]
            //},

            //visibleData : [
                //["Solids", true, false],
                //["Liquids", true, false],
                //["Gases", true, false]
            //],

            //treeBox: null,
            //selection: null,

            //get rowCount()                     { return this.visibleData.length; },
            //setTree: function(treeBox)         { this.treeBox = treeBox; },
            //getCellText: function(idx, column) { return this.visibleData[idx][0]; },
            //isContainer: function(idx)         { return this.visibleData[idx][1]; },
            //isContainerOpen: function(idx)     { return this.visibleData[idx][2]; },
            //isContainerEmpty: function(idx)    { return false; },
            //isSeparator: function(idx)         { return false; },
            //isSorted: function()               { return false; },
            //isEditable: function(idx, column)  { return false; },

            //getParentIndex: function(idx) {
                //if (this.isContainer(idx)) return -1;
                //for (var t = idx - 1; t >= 0 ; t--) {
                    //if (this.isContainer(t)) return t;
                //}
            //},
            //getLevel: function(idx) {
                //if (this.isContainer(idx)) return 0;
                //return 1;
            //},
            //hasNextSibling: function(idx, after) {
                //var thisLevel = this.getLevel(idx);
                //for (var t = after + 1; t < this.visibleData.length; t++) {
                    //var nextLevel = this.getLevel(t);
                    //if (nextLevel == thisLevel) return true;
                    //if (nextLevel < thisLevel) break;
                //}
                //return false;
            //},
            //toggleOpenState: function(idx) {
                //var item = this.visibleData[idx];
                //if (!item[1]) return;

                //if (item[2]) {
                    //item[2] = false;

                    //var thisLevel = this.getLevel(idx);
                    //var deletecount = 0;
                    //for (var t = idx + 1; t < this.visibleData.length; t++) {
                        //if (this.getLevel(t) > thisLevel) deletecount++;
                        //else break;
                    //}
                    //if (deletecount) {
                        //this.visibleData.splice(idx + 1, deletecount);
                        //this.treeBox.rowCountChanged(idx + 1, -deletecount);
                    //}
                //}
                //else {
                    //item[2] = true;

                    //var label = this.visibleData[idx][0];
                    //var toinsert = this.childData[label];
                    //for (var i = 0; i < toinsert.length; i++) {
                        //this.visibleData.splice(idx + i + 1, 0, [toinsert[i], false]);
                    //}
                    //this.treeBox.rowCountChanged(idx + 1, toinsert.length);
                //}
                //this.treeBox.invalidateRow(idx);
            //},

            //getImageSrc: function(idx, column) {},
            //getProgressMode : function(idx,column) {},
            //getCellValue: function(idx, column) {},
            //cycleHeader: function(col, elem) {},
            //selectionChanged: function() {},
            //cycleCell: function(idx, column) {},
            //performAction: function(action) {},
            //performActionOnCell: function(action, index, column) {},
            //getRowProperties: function(idx, prop) {},
            //getCellProperties: function(idx, column, prop) {},
            //getColumnProperties: function(column, element, prop) {},
        //}

        menupopup.appendChild(refreshitem);
        menupopup.appendChild(prefsitem);
        optionmenu.appendChild(menupopup);
        treemenu.appendChild(passffmenupopup);
        menubar.appendChild(optionmenu);
        menubar.appendChild(treemenu);
        menubar.appendChild(separator);
        menubar.appendChild(contextmenu);
        panel.appendChild(searchlabel);
        panel.appendChild(searchtextbox);
        panel.appendChild(menubar);
        //panel.appendChild(tree);

        //let iframe = doc.createElement("iframe");
        //iframe.setAttribute("id", "passff-iframe");
        //iframe.setAttribute("type", "content");
        //iframe.setAttribute("src", "chrome://passff/content/player.html");
        //panel.appendChild(iframe);
        return panel;
    },
    createMenu : function(document) {
        let menuPopup = document.getElementById("passff-menu");
        if (menuPopup) {
            while (menuPopup.hasChildNodes()) {
                menuPopup.removeChild(menuPopup.lastChild);
            }

            for (let i = 0 ; i < PassFF.Pass.rootItems.length ; i++) {
                let root = PassFF.Pass.rootItems[i];
                let rootMenu = this.createMenuInternal(document, root, root.key);
                if (rootMenu) menuPopup.appendChild(rootMenu);
            }

        }
    },

    searchKeyDown : function(event) {
        console.debug("[PassFF]", "Search keydown : " + event.keyCode);
        if(event.keyCode == 40) {
            console.debug("[PassFF]", "Arrow down")
            let listElm = document.getElementById("entries-list");
            if(listElm.firstChild) listElm.firstChild.selected = false;
            listElm.selectItem(listElm.firstChild)
            document.getElementById('entries-list').focus();
            return false;
        }
        if(event.keyCode == 13) {
            let listElm = document.getElementById("entries-list");
            let searchPanel = document.getElementById('search-panel');
            listElm.selectItem(listElm.firstChild)
            console.debug("[PassFF]", "Selected item", listElm.selectedItem)
            let item = PassFF.Menu.getItem(listElm.selectedItem);
            PassFF.Page.itemToUse = item;
            PassFF.Menu.goToItemUrl(item, event.shiftKey);
            searchPanel.hidePopup();
            //listElm.firefogg
        }
    },

    listItemkeyPress : function(event) {
        console.debug("[PassFF]", "List item keydown : " + event.keyCode, event.target);
        let searchPanel = document.getElementById('search-panel');
        if(event.keyCode == 13) {
            let item = PassFF.Menu.getItem(event.target.selectedItem);
            PassFF.Page.itemToUse = item;
            PassFF.Menu.goToItemUrl(item, event.shiftKey);
            searchPanel.hidePopup();
        } else if (event.keyCode != 40) {
            let inputText = searchPanel.getElementsByAttribute('id', 'search')[0]
            inputText.focus();
            //inputText.setSelectionRange(0, inputText.value.length)
        }
    },

    createMatchingSearchList : function(search) {
        let listElm = document.getElementById("entries-list");

        while (listElm.hasChildNodes()) {
            listElm.removeChild(listElm.firstChild);
        }

        let matchItems  = PassFF.Pass.getMatchingItems(search, 6);
        matchItems.forEach(function(item) {
            if (!item.isField()) {
                let listItemElm = document.createElement("richlistitem");
                listItemElm.item = item;
                let descElm = document.createElement("label")
                descElm.setAttribute("value", item.fullKey());
                descElm.setAttribute("keydown", PassFF.Menu.listItemkeyPress);
                listItemElm.appendChild(descElm);
                listElm.appendChild(listItemElm);
            }
        });
    },

    openSearchPanel : function() {
        let searchPanel = document.getElementById('search-panel');
        searchPanel.openPopup(document.getElementById('passff-button'), 'after_start', 0, 0, false, false);
    },

    onPanelShow : function() {
        let searchPanel = document.getElementById('search-panel');
        let inputText = searchPanel.getElementsByAttribute('id', 'search')[0]
        inputText.focus();
        inputText.setSelectionRange(0, inputText.value.length)
    },

    openPreferences : function() {
        if (null == this._preferencesWindow || this._preferencesWindow.closed) {
            let instantApply =
            Application.prefs.get("browser.preferences.instantApply");
            let features = "chrome,titlebar,toolbar,centerscreen" + (instantApply.value ? ",dialog=no" : ",modal");
            this._preferencesWindow = window.openDialog( "chrome://passff/content/preferencesWindow.xul", "passff-preferences-window", features);
        }

        this._preferencesWindow.focus();
    },
    createMenuInternal : function(document, item, label) {
        if(item.isField()) return null;
        let menu = document.createElement("menu");
        menu.item = item
        menu.setAttribute("label", label);
        //menu.setAttribute("oncommand","PassFF.Menu.goToItemUrl(event)");
        menu.addEventListener("click", PassFF.Menu.menuClick);
        let menuPopupDyn = document.createElement("menupopup");
        if (!item.isLeaf()) {
            if (item.hasFields()) PassFF.Menu.createCommandMenu(document, menuPopupDyn)
            for (let i = 0 ; i < item.children.length ; i++) {
                let newMenu = this.createMenuInternal(document, item.children[i], item.children[i].key)
                if (newMenu) menuPopupDyn.appendChild(newMenu);
            }
        } else {
            PassFF.Menu.createCommandMenu(document, menuPopupDyn)
        }

        menu.appendChild(menuPopupDyn);
        return menu;
    },

    createCommandMenu: function(document, menuPopupDyn) {
        let passwordLabel = this._stringBundle.GetStringFromName("passff.menu.copy_password");
        let loginLabel = this._stringBundle.GetStringFromName("passff.menu.copy_login");
        let fillLabel = this._stringBundle.GetStringFromName("passff.menu.fill");
        let fillAndSubmitLabel = this._stringBundle.GetStringFromName("passff.menu.fill_and_submit");
        let gotoFillAndSubmitLabel = this._stringBundle.GetStringFromName("passff.menu.goto_fill_and_submit");
        let displayLabel = this._stringBundle.GetStringFromName("passff.menu.display");

        menuPopupDyn.appendChild(this.createSubmenu(document, fillLabel, "fill", PassFF.Menu.autoFillMenuClick));
        menuPopupDyn.appendChild(this.createSubmenu(document, fillAndSubmitLabel, "fill_and_submit", PassFF.Menu.autoFillAndSubmitMenuClick));
        menuPopupDyn.appendChild(this.createSubmenu(document, gotoFillAndSubmitLabel, "goto_fill_and_submit", PassFF.Menu.gotoAutoFillAndSubmitMenuClick));
        menuPopupDyn.appendChild(this.createSubmenu(document, loginLabel, "login", PassFF.Menu.copyToClipboard));
        menuPopupDyn.appendChild(this.createSubmenu(document, passwordLabel, "password", PassFF.Menu.copyToClipboard));
        menuPopupDyn.appendChild(this.createSubmenu(document, displayLabel, "display", PassFF.Menu.display));
    },

    refresh : function(document) {
        (function() { PassFF.Preferences._init(); }).apply(PassFF.Preferences);
        (function() { PassFF.Pass.init(); }).apply(PassFF.Pass);
        PassFF.Menu.createMenu(document);
        let window = Services.wm.getMostRecentWindow("navigator:browser");
        PassFF.Menu.createContextualMenu(window);
    },

    createSubmenu : function(document, label, attribute, action) {
        let submenu = document.createElement("menuitem");
        submenu.setAttribute("label", label);
        submenu.dataKey = attribute;
        submenu.addEventListener("click", action);

        return submenu;
    },

    menuClick : function(event) {
        event.stopPropagation();
        PassFF.Menu.goToItemUrl(item, event.button != 0);
    },

    autoFillMenuClick : function(event) {
        event.stopPropagation();
        let item = PassFF.Menu.getItem(event.target);
        PassFF.Page.fillInputs(item);
    },

    autoFillAndSubmitMenuClick : function(event) {
        event.stopPropagation();
        let item = PassFF.Menu.getItem(event.target);
        PassFF.Page.fillInputs(item);
        let window = Services.wm.getMostRecentWindow("navigator:browser");
        PassFF.Page.submit(window.content.location.href);
    },

    gotoAutoFillAndSubmitMenuClick : function(event) {
        event.stopPropagation();
        let item = PassFF.Menu.getItem(event.target);
        PassFF.Page.itemToUse = item;
        PassFF.Menu.goToItemUrl(item, event.button != 0);
    },

    goToItemUrl: function(item, newTab) {
        if (item == null || item == undefined) return;

        let passwordData = PassFF.Pass.getPasswordData(item);
        let url = passwordData.url;
        if (url == null || url == undefined) url = item.key;
        if (!url.startsWith("http")) url = "http://" + url;
        if (url != null && url != undefined) {
            let window = Services.wm.getMostRecentWindow("navigator:browser");
            if (newTab) {
                window.gBrowser.selectedTab = window.gBrowser.addTab(url);
            } else {
                console.log(window)
                window.content.location.href = url;
            }
        }
    },

    display : function(event) {
        let item = PassFF.Menu.getItem(event.target);
        let passwordData = PassFF.Pass.getPasswordData(item);
        let login = passwordData["login"];
        let password = passwordData["password"];
        let title = PassFF.Menu._stringBundle.GetStringFromName("passff.display.title");
        let desc = PassFF.Menu._stringBundle.formatStringFromName("passff.display.description", [login, password], 2);
        if(!PassFF.Menu._promptService.alert(null, title, desc)) return;
    },

    copyToClipboard : function(event) {
        event.stopPropagation();
        let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
        let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
        let clip = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
        let item = PassFF.Menu.getItem(event.target);
        let passwordData = PassFF.Pass.getPasswordData(item);
        str.data = passwordData[event.target.dataKey];
        trans.addDataFlavor('text/unicode');
        trans.setTransferData('text/unicode', str, str.data.length * 2);
        clip.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
    },

    getItem : function(menuItem) {
        while (menuItem && menuItem.item == undefined) menuItem = menuItem.parentNode;

        return menuItem ? menuItem.item : null;
    },

    createContextualMenu : function(aWindow) {
        let document = aWindow.document;
        let contextualMenu = document.getElementById("contextual-menu")

        while (contextualMenu.hasChildNodes()) {
            contextualMenu.removeChild(contextualMenu.lastChild);
        }

        let items = PassFF.Pass.getUrlMatchingItems(aWindow.content.location.href);
        for(let i = 0 ; i < items.length ; i++) {
            let item = items[i];
            let itemMenu = this.createMenuInternal(document, item, item.fullKey())
            if (itemMenu) contextualMenu.appendChild(itemMenu);
        }
    }
};
