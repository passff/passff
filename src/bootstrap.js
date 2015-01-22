/**
* Copyright 2014 Jorge Villalobos
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0

* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
**/

"use strict";
const global = this;
const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;


const stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
Cu.import("resource:///modules/CustomizableUI.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var console = Cu.import("resource://gre/modules/devtools/Console.jsm", {}).console;
var log = {
    debug : function() { if (PassFF.Preferences && PassFF.Preferences.logEnabled) console.debug.apply(console, this.generateParams(arguments)); },
    info : function() { if (PassFF.Preferences && PassFF.Preferences.logEnabled) console.info.apply(console, this.generateParams(arguments)); },
    warn : function() { console.warn.apply(console, this.generateParams(arguments)); },
    error : function() { console.error.apply(console, this.generateParams(arguments)); },
    generateParams: function(args) {
        var argsArray = Array.slice(args)
        argsArray.unshift("[PassFF]");
        return argsArray;
    }
}

function install(aData, aReason) { log.debug("install") }
function uninstall(aData, aReason) { log.debug("uninstall") }

function startup({id}) AddonManager.getAddonByID(id, function(addon) {
    log.debug("startup");
    Cu.import("chrome://passff/content/subprocess.jsm");
    // Load various javascript includes for helper functions
    ["common", "preferences", "pass", "menu", "page"].forEach(function(fileName) {
        let fileURI = addon.getResourceURI("modules/" + fileName + ".js");
        Services.scriptloader.loadSubScript(fileURI.spec, global);
    });

    PassFF.stringBundle = stringBundleService.createBundle("chrome://passff/locale/strings.properties");

    PassFF.Preferences._init();
    PassFF.Pass.init();
    PassFF.Menu.init();
    PassFF.Page.init();
    PassFF.init();
});

function shutdown(aData, aReason) { 
    log.debug("shutdown");
    PassFF.uninit();
}

let PassFF = {
    Ids : {
        panel : "passff-panel",
        button: "passff-button",
        key: "passff-key",
        keyset: "passff-keyset",
        searchbox: "passff-search-box",
        searchboxlabel: "passff-search-box-label",
        entrieslist: "passff-entries-list",
        contextlist: "passff-context-list",
        menubar: "passff-menubar",
        optionsmenu: "passff-options-menu",
        optionsmenupopup: "passff-options-menupopup",
        rootbutton: "passff-root-button",
        contextbutton: "passff-context-button",
        buttonsbox: "passff-buttonsbox",
        refreshmenuitem: "passff-refresh-menuitem",
        prefsmenuitem: "passff-prefs-menuitem",
        menubar: "passff-menubar",
        menu: "passff-menu-",
    },


    stringBufferService : null,
    _timers : [],

    gsfm : function(key, params) {
        if (params != undefined) return  PassFF.stringBundle.formatStringFromName(key, params, params.length)
        return PassFF.stringBundle.GetStringFromName(key);
    },

    init : function() {
        log.debug("init");

        PassFF.waitForDocuments();
    },

    waitForDocuments: function() {
        log.debug("Wait documents");
        let documentsCreated = true;
        let enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
            let aWindow = enumerator.getNext();
            if (aWindow == null || aWindow.document == null || aWindow.gBrowser == null) {
                documentsCreated = false;
                break;
            }
        }
        if (documentsCreated) {
            log.debug("Documents found");
            let enumerator = Services.wm.getEnumerator("navigator:browser");
            while (enumerator.hasMoreElements()) {
                this.windowListener.addUI(enumerator.getNext());
            }
            PassFF.waitForPanel();
        } else {
            let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
            timer.initWithCallback( { notify : function() { PassFF.waitForDocuments() } }, 100, Ci.nsITimer.TYPE_ONE_SHOT);
        }
    },
    waitForPanel : function() {
        log.debug("Wait panels");
        let panelsCreated = true;
        let enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
            let aWindow = enumerator.getNext();
            if (aWindow.document.getElementById(PassFF.Ids.panel) == null) {
                panelsCreated = false;
                break;
            }
        }
        if (panelsCreated) {
            log.debug("Panels found");
            // create widget and add it to the main toolbar.
            CustomizableUI.createWidget( {
                id : PassFF.Ids.button,
                type : "view",
                viewId : PassFF.Ids.panel,
                defaultArea : CustomizableUI.AREA_NAVBAR,
                label : PassFF.gsfm("passff.toolbar.button.label"),
                tooltiptext : PassFF.gsfm("passff.toolbar.button.tooltip"),
                onViewShowing : function (aEvent) {
                    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
                    timer.initWithCallback( { notify : function() { aEvent.target.ownerDocument.getElementById(PassFF.Ids.searchbox).focus(); } }, 100, Ci.nsITimer.TYPE_ONE_SHOT);
                    PassFF._timers.push(timer);
                },
                onViewHiding : function (aEvent) { return false; }
            });
            Services.wm.addListener(this.windowListener);
        } else {
            let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
            timer.initWithCallback( { notify : function() { PassFF.waitForPanel() } }, 100, Ci.nsITimer.TYPE_ONE_SHOT);
        }
    },

    uninit : function() {
        log.debug("uninit");
        CustomizableUI.destroyWidget(PassFF.Ids.button);
        stringBundleService.flushBundles();
        Services.wm.removeListener(this.windowListener);
        let enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
            this.windowListener.removeUI(enumerator.getNext());
        }
    },


    windowListener : {
        /**
        * Adds the panel view for the button on all windows.
        */
        addUI : function(aWindow) {
            log.debug("Add panel to new window");

            let doc = aWindow.document;
            let menuPanel = PassFF.Menu.createStaticMenu(doc);
            doc.getElementById("PanelUI-multiView").appendChild(menuPanel);

            this._uri = Services.io.newURI("chrome://passff/skin/toolbar.css", null, null);
            aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils).loadSheet(this._uri, 1);

            PassFF.Menu.createContextualMenu(doc, aWindow.content.location.href);

            this.addShortcuts(doc);

            aWindow.gBrowser.addEventListener('load', this.onWebPageLoaded, true);
            aWindow.gBrowser.addTabsProgressListener(this);
            aWindow.gBrowser.tabContainer.addEventListener("TabSelect", this.tabSelect, false);

            this.curBranch = Services.prefs.getBranch("extensions.passff.");
            this.curBranch.addObserver("", this, false);

        },

        observe : function(aSubject, aTopic, aData) {
            log.debug("Preferences change", aTopic, aData);
            if("shortcutKey" == aData || shortcutMod == aData) {
                let enumerator = Services.wm.getEnumerator("navigator:browser");
                while (enumerator.hasMoreElements()) {
                    let aWindow = enumerator.getNext();
                    this.removeShortcuts(aWindow.document);
                    this.addShortcuts(aWindow.document);
                }
            }
        },


        addShortcuts : function(doc) {
            let toggleKeyset = doc.createElementNS(NS_XUL, "keyset");
            toggleKeyset.setAttribute("id", PassFF.Ids.keyset);
            // add hotkey
            let (toggleKey = doc.createElementNS(NS_XUL, "key")) {
                toggleKey.setAttribute("id", PassFF.Ids.key);
                toggleKey.setAttribute("key", PassFF.Preferences.shortcutKey);
                toggleKey.setAttribute("modifiers", PassFF.Preferences.shortcutMod);
                toggleKey.setAttribute("oncommand", "void(0);");
                //toggleKey.addEventListener("command", function(event) { PassFF.Menu.createStaticMenu(event.target.ownerDocument).style = "display: visible";}, true);
                toggleKey.addEventListener("command", function(event) { event.target.ownerDocument.getElementById(PassFF.Ids.button).click(); }, true);
                doc.getElementById("mainKeyset").parentNode.appendChild(toggleKeyset).appendChild(toggleKey);
            }

        },

        removeShortcuts : function(doc) {
            let keySet = doc.getElementById(PassFF.Ids.keyset);
            if (keySet) keySet.parentNode.removeChild(keySet);
        },

        removeUI : function(aWindow) {
            let doc = aWindow.document;

            let panel = doc.getElementById(PassFF.Ids.panel);
            if (panel) panel.parentNode.removeChild(panel);

            this.removeShortcuts(doc);

            aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils).removeSheet(this._uri, 1);

            aWindow.gBrowser.removeEventListener("load", this.onWebPageLoaded, true);
            aWindow.gBrowser.removeTabsProgressListener(this);
            aWindow.gBrowser.tabContainer.removeEventListener("TabSelect", this.tabSelect, false);

            this.curBranch.removeObserver("", this);
        },

        onLocationChange: function(aBrowser, aWebProgress, aRequest, aLocation) {
            log.debug("Location changed", aBrowser.ownerGlobal.content.location.href)
            PassFF.Menu.createContextualMenu(aBrowser.ownerDocument, aBrowser.ownerGlobal.content.location.href);
        },

        onWebPageLoaded : function(event) {
            let doc = event.originalTarget;
            let win = doc.defaultView;
            if (doc.nodeName == "#document" && win == win.top) {
                log.debug("Content loaded", event, PassFF.Preferences.autoFill, PassFF.Page.getPasswordInputs(doc).length);
                
                if(!PassFF.Page.autoFillAndSubmitPending 
                   && PassFF.Preferences.autoFill
                   && PassFF.Page.getPasswordInputs(doc).length > 0) {
                    let url = win.location.href
                    let matchItems = PassFF.Pass.getUrlMatchingItems(url);

                    log.info("Start pref-auto-fill")
                    let bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

                    if(bestFitItem) {
                        PassFF.Page.fillInputs(doc, bestFitItem);
                        if (PassFF.Preferences.autoSubmit && PassFF.Pass.getItemsLeafs(matchItems).length == 1)
                            PassFF.Page.submit(doc, url);
                    }
                }

                PassFF.Page._autoSubmittedUrls = new Array();
            }
        },

        tabSelect : function(event) {
            log.debug("Tab Selected", event.target);
            PassFF.Menu.createContextualMenu(event.target.ownerDocument, event.target.ownerGlobal.content.location.href);
        },

        onOpenWindow : function(aXULWindow) {
            let that = this;
            let domWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
            domWindow.addEventListener( "DOMContentLoaded", function listener() {
                domWindow.removeEventListener("DOMContentLoaded", listener, false);
                let isBrowser = domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser";
                if (isBrowser) that.addUI(domWindow);
            }, false);
        },

        onCloseWindow : function(aXULWindow) {},
        onWindowTitleChange: function(aXULWindow, aNewTitle) {}
    }
};
