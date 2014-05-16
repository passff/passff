/* ***** BEGIN LICENSE BLOCK *****
* Version: MIT/X11 License
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in
* all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
* THE SOFTWARE.
*
* Contributor(s):
* Dmitry Gutov <dgutov@yandex.ru> (Original Author)
* Erik Vold <erikvvold@gmail.com>
*
* ***** END LICENSE BLOCK ***** */

(function(global) {
  let positions = {};
  
  /*
   * Assigns position that will be used by `restorePosition`
   * if the button is not found on any toolbar's current set.
   * If `beforeID` is null, or no such item is found on the toolbar,
   * the button will be added to the end.
   * @param beforeID ID of the element before which the button will be inserted.
   */
  global.setDefaultPosition = function(buttonID, toolbarID, beforeID) {
    positions[buttonID] = [toolbarID, beforeID];
  };
  
  /*
   * Restores the button's saved position.
   * @param {XULDocument} doc XUL window document.
   * @param {XULElement} button button element.
   */
  global.restorePosition = function(doc, button) {
    function $(sel, all)
      doc[all ? "querySelectorAll" : "getElementById"](sel);
    
    ($("navigator-toolbox") || $("mail-toolbox")).palette.appendChild(button);
    
    let toolbar, currentset, idx,
        toolbars = $("toolbar", true);
    for (let i = 0; i < toolbars.length; ++i) {
      let tb = toolbars[i];
      currentset = getCurrentset(tb),
      idx = currentset.indexOf(button.id);
      if (idx != -1) {
        toolbar = tb;
        break;
      }
    }
    
    // saved position not found, using the default one, if any
    if (!toolbar && (button.id in positions)) {
      let [tbID, beforeID] = positions[button.id];
      toolbar = $(tbID);
      [currentset, idx] = persist(doc, toolbar, button.id, beforeID);
    }
    
    if (toolbar) {
      if (idx != -1) {
        // inserting the button before the first item in `currentset`
        // after `idx` that is present in the document
        for (let i = idx + 1; i < currentset.length; ++i) {
          let before = $(currentset[i]);
          if (before) {
            toolbar.insertItem(button.id, before);
            return;
          }
        }
      }
      toolbar.insertItem(button.id);
    }
  };
  
  function persist(document, toolbar, buttonID, beforeID) {
    let currentset = getCurrentset(toolbar),
        idx = (beforeID && currentset.indexOf(beforeID)) || -1;
    if (idx != -1) {
      currentset.splice(idx, 0, buttonID);
    } else {
      currentset.push(buttonID);
    }
    toolbar.setAttribute("currentset", currentset.join(","));
    document.persist(toolbar.id, "currentset");
    return [currentset, idx];
  }

  function getCurrentset(toolbar) {
    return (toolbar.getAttribute("currentset") ||
            toolbar.getAttribute("defaultset")).split(",");
  }
})(this);

