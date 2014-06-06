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

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/CustomizableUI.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var console = Cu.import("resource://gre/modules/devtools/Console.jsm", {}).console;

function install(aData, aReason) {}
function uninstall(aData, aReason) {}

function startup({id}) AddonManager.getAddonByID(id, function(addon) {
    Cu.import("chrome://passff/content/subprocess.jsm");
    // Load various javascript includes for helper functions
    ["common", "preferences", "pass", "menu", "page"].forEach(function(fileName) {
        let fileURI = addon.getResourceURI("modules/" + fileName + ".js");
        Services.scriptloader.loadSubScript(fileURI.spec, global);
    });
    let stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
    PassFF.stringBundle = stringBundleService.createBundle("chrome://passff/locale/strings.properties");

    PassFF.Preferences._init();
    PassFF.Pass.init();
    PassFF.Menu.init();
    PassFF.Page.init();
    PassFF.init();
});

function shutdown(aData, aReason) { PassFF.uninit(); }

let PassFF = {
    stringBufferService : null,
    _timers : [],

    gsfm : function(key) {
        return PassFF.stringBundle.GetStringFromName(key);
    },

    init : function() {
        let enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements()) {
            this.windowListener.addUI(enumerator.getNext());
        }


        Services.wm.addListener(this.windowListener);

        // create widget and add it to the main toolbar.
        CustomizableUI.createWidget( {
            id : "passff-button",
            type : "view",
            viewId : "passff-panel",
            defaultArea : CustomizableUI.AREA_NAVBAR,
            label : PassFF.gsfm("passff.toolbar.button.label"),
            tooltiptext : PassFF.gsfm("passff.toolbar.button.tooltip"),
            onViewShowing : function (aEvent) {
                let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
                timer.initWithCallback( { notify : function() { PassFF.showPassFFPanel(aEvent.target.ownerDocument); } }, 100, Ci.nsITimer.TYPE_ONE_SHOT);
                PassFF._timers.push(timer);
            },
            onViewHiding : function (aEvent) {
                //aEvent.target.ownerDocument.getElementById("passff-iframe").webNavigation.reload(Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
            }
        });
    },

    showPassFFPanel : function(aDocument) {
     aDocument.getElementById("pass-search-box").focus();
    },

    uninit : function() {
        CustomizableUI.destroyWidget("passff-button");
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
            console.debug("[PassFF]", "Add panel to new window");
            let doc = aWindow.document;
            let menuPanel = PassFF.Menu.createStaticMenu(doc);
            doc.getElementById("PanelUI-multiView").appendChild(menuPanel);

            this._uri = Services.io.newURI("chrome://passff/skin/toolbar.css", null, null);
            aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils).loadSheet(this._uri, 1);

            PassFF.Menu.createMenu(doc);
            PassFF.Menu.createContextualMenu(aWindow);

            aWindow.gBrowser.addEventListener('load', this.webPageLoaded, true);
            aWindow.gBrowser.addTabsProgressListener(this);
            aWindow.gBrowser.tabContainer.addEventListener("TabSelect", this.tabSelect, false);
        },

        /**
        * Removes all added UI elements.
        */
        removeUI : function(aWindow) {
            let doc = aWindow.document;
            let panel = doc.getElementById("passff-panel");

            if (panel) panel.parentNode.removeChild(panel);

            aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils).removeSheet(this._uri, 1);

            aWindow.gBrowser.removeEventListener("load", this.webPageLoaded, true);
            aWindow.gBrowser.removeTabsProgressListener(this);
            aWindow.gBrowser.tabContainer.removeEventListener("TabSelect", this.tabSelect, false);
        },

        onLocationChange: function(aBrowser, aWebProgress, aRequest, aLocation) {
            console.debug("[PassFF]", "Location changed", aBrowser.ownerGlobal.content.location.href)
            PassFF.Menu.createContextualMenu(aBrowser.ownerGlobal);
        },

        webPageLoaded : function(event) {
            //if ((event.originalTarget.nodeName == '#document') && (event.originalTarget.defaultView.location.href == gBrowser.currentURI.spec))
            let doc = event.originalTarget; // doc is document that triggered the event
            let win = doc.defaultView;
            if (doc.nodeName == "#document" && win == win.top) {
                console.debug("[PassFF]", "Content loaded", event, PassFF.Preferences.autoFill, PassFF.Page.getPasswordInputs(doc).length);

                if (PassFF.Preferences.autoFill && PassFF.Page.getPasswordInputs(doc).length > 0) {
                    let url = win.location.href
                    let matchItems = PassFF.Pass.getUrlMatchingItems(url);

                    console.info("[PassFF]", "Start auto-fill")
                    let bestFitItem = PassFF.Page.itemToUse;
                    if (!bestFitItem) bestFitItem = PassFF.Pass.findBestFitItem(matchItems, url);

                    if(bestFitItem) {
                        PassFF.Page.fillInputs(doc, bestFitItem);
                        if (PassFF.Page.itemToUse || PassFF.Pass.getItemsLeafs(matchItems).length == 1) PassFF.Page.submit(doc, url);
                    }
                }

                PassFF.Page.itemToUse = null;
            }
        },

        tabSelect : function(event) {
            console.debug("[PassFF]", "Tab Selected", event.target);
            PassFF.Menu.createContextualMenu(event.target.ownerGlobal);
        },

        onOpenWindow : function(aXULWindow) {
            // A new window has opened.
            let that = this;
            let domWindow = aXULWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);

            // Wait for it to finish loading
            //
            domWindow.addEventListener( "DOMContentLoaded", function listener() {
                domWindow.removeEventListener("DOMContentLoaded", listener, false);
                // If this is a browser window then setup its UI
                let isBrowser = domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser";
                if (isBrowser) that.addUI(domWindow);
            }, false);
            //domWindow.addEventListener( "DOMContentLoaded", function listener() {
                ////domWindow.removeEventListener("DOMContentLoaded", listener, false);
                //// If this is a browser window then setup its UI
                //let isBrowser = domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser";
                //let isInitialized = domWindow.document.getElementById("passff-panel") != null;
                //console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + isBrowser);
                //console.log("isBrowser : " + isBrowser);
                //console.log("isInitialized : " + isInitialized);
                //if (isBrowser) {
                    //if(!isInitialized) that.addUI(domWindow);
                //}
            //}, false);
        },

        onCloseWindow : function(aXULWindow) {},
        onWindowTitleChange: function(aXULWindow, aNewTitle) {}
    }
};
