declare let browser: any;
import {Pass, Dict} from './pass';
import {log} from './main';

  export interface PreferenceType {
    passwordInputNames?: string
    loginInputNames?: string
    loginFieldNames?: string
    passwordFieldNames?: string
    urlFieldNames?: string
    command?: string
    commandArgs?: string
    shell?: string
    shellArgs?: string
    home?: string
    gnupgHome?: string
    storeDir?: string
    storeGit?: string
    gpgAgentInfo?: string
    autoFill?: boolean
    autoSubmit?: boolean
    shortcutKey?: string
    shortcutMod?: string
    subpageSearchDepth?: number
    callType?: string
    caseInsensitiveSearch?: boolean
    enterBehavior?: number
    defaultPasswordLength?: number
    defaultIncludeSymbols?: boolean
    preferInsert?: boolean
  }

 export class Preferences {

   private static getDefaultParams() : PreferenceType {
    let defaultParams = {
      passwordInputNames    : 'passwd,password,pass',
      loginInputNames       : 'login,user,mail,email,username,opt_login,log,usr_name',
      loginFieldNames       : 'login,user,username,id',
      passwordFieldNames    : 'passwd,password,pass',
      urlFieldNames         : 'url,http',
      command               : '/usr/bin/pass',
      commandArgs           : '',
      shell                 : '/bin/bash',
      shellArgs             : '',
      home                  : '',
      gnupgHome             : '',
      storeDir              : '',
      storeGit              : '',
      gpgAgentInfo          : '.gpg-agent-info',
      autoFill              : false,
      autoSubmit            : false,
      shortcutKey           : 'y',
      shortcutMod           : 'control',
      subpageSearchDepth    : 5,
      callType              : 'direct',
      caseInsensitiveSearch : true,
      enterBehavior         : 0,
      defaultPasswordLength : 16,
      defaultIncludeSymbols : true,
      preferInsert          : false,
    };

    let osString = "windows"; //browser.runtime.PlatformOs;
    switch (osString) {
      case 'mac':
        Object.assign(defaultParams, {
          command   : '/usr/local/bin/pass',
          shellArgs : '--login',
          callType  : 'shell',
        });
        break;
    }
    return defaultParams;
  };

   private static _gpgAgentEnv: Dict<string> = null;

   private static _params =  Preferences.getDefaultParams();

   static init(bgmode:boolean = false) {
      let promised_changes = [];
      for (let [key, val] of Object.entries(Preferences._params)) {
        promised_changes.push(
          browser.storage.local.get(key)
            .then((res: Dict<string|number|boolean>) => {
              if (typeof res[key] === 'undefined') {
                let obj : Dict<string|number|boolean> = {};
                obj[key] = val;
                browser.storage.local.set(obj);
              } else {
                (<any>this._params)[key] = res[key];
              }
            })
        );
      }

      return Promise.all(promised_changes).then(() => {
        if (bgmode === true) {
          log.info("Preferences initialised", {
            passwordInputNames    : this.passwordInputNames,
            loginInputNames       : this.loginInputNames,
            loginFieldNames       : this.loginFieldNames,
            passwordFieldNames    : this.passwordFieldNames,
            urlFieldNames         : this.urlFieldNames,
            command               : this.command,
            commandArgs           : this.commandArgs,
            shell                 : this.shell,
            shellArgs             : this.shellArgs,
            home                  : this.home,
            storeDir              : this.storeDir,
            storeGit              : this.storeGit,
            autoFill              : this.autoFill,
            autoSubmit            : this.autoSubmit,
            shortcutKey           : this.shortcutKey,
            shortcutMod           : this.shortcutMod,
            subpageSearchDepth    : this.subpageSearchDepth,
            callType              : this.callType,
            caseInsensitiveSearch : this.caseInsensitiveSearch,
            enterBehavior         : this.enterBehavior
          });
          let params : any = { command: 'gpgAgentEnv' };
          params['arguments'] = [this._params.gpgAgentInfo];
          return browser.runtime.sendNativeMessage('passff', params)
            .then((result: Dict<string>) => { this._gpgAgentEnv = result; })
            .catch((error: any) => {
              log.error("Error detecting GPG Agent:", error);
            });
        }
      });
    }

    static pref_set(key: string, val: string) {
        let obj : {[key:string]:string} = {};
        obj[key] = val;
        browser.storage.local.set(obj);
    }

    static addInputName(type:string, name:string) {
      let names = Preferences.loginInputNames;
      if (type == "password") {
        names = Preferences.passwordInputNames;
      }
      for (let i = 0; i < names.length; i++) {
        if (name.toLowerCase().indexOf(names[i].toLowerCase()) >= 0) {
          return false;
        }
      }
      log.debug("New input name", name, "of type", type);
      names.push(name);
      let _names = names.join(",");
      if (type == "password") {
        Preferences.pref_set("passwordInputNames", _names);
      } else {
        Preferences.pref_set("loginInputNames", _names);
      }
      return true;
    }

    static get passwordInputNames() {
      return this._params.passwordInputNames.split(',');
    }

    static get loginInputNames() {
      return this._params.loginInputNames.split(',');
    }

    static get loginFieldNames() {
      return this._params.loginFieldNames.split(',');
    }

    static get passwordFieldNames() {
      return this._params.passwordFieldNames.split(',');
    }

    static get urlFieldNames() {
      return this._params.urlFieldNames.split(',');
    }

    static get command() {
      return this._params.command;
    }

    static get commandArgs() {
      return this._params.commandArgs.split(' ');
    }

    static get shell() {
      return this._params.shell;
    }

    static get shellArgs() {
      return this._params.shellArgs.split(' ');
    }

    static get home() {
      if (this._params.home.trim().length > 0) {
        return this._params.home;
      }
      return Pass.env.get('HOME');
    }

    static get gnupgHome() {
      if (this._params.gnupgHome.trim().length > 0) {
        return this._params.gnupgHome;
      }
      return Pass.env.get('GNUPGHOME');
    }

    static get storeDir() {
      if (this._params.storeDir.trim().length > 0) {
        return this._params.storeDir;
      }
      return Pass.env.get('PASSWORD_STORE_DIR');
    }

    static get storeGit() {
      if (this._params.storeGit.trim().length > 0) {
        return this._params.storeGit;
      }
      return Pass.env.get('PASSWORD_STORE_GIT');
    }

    static get path() {
      return Pass.env.get('PATH');
    }

   static get gpgAgentEnv() {
      return this._gpgAgentEnv;
    }

   static get autoFill() {
      return this._params.autoFill;
    }

   static get autoSubmit() {
      return this._params.autoSubmit;
    }

   static get shortcutKey() {
      return this._params.shortcutKey;
    }

   static get shortcutMod() {
      return this._params.shortcutMod;
    }

   static get subpageSearchDepth() {
      return this._params.subpageSearchDepth;
    }

   static get callType() {
      return this._params.callType;
    }

   static get caseInsensitiveSearch() {
      return this._params.caseInsensitiveSearch;
    }

   static get enterBehavior() {
      return this._params.enterBehavior;
    }

   static get defaultPasswordLength() {
      return this._params.defaultPasswordLength;
    }

   static get defaultIncludeSymbols() {
      return this._params.defaultIncludeSymbols;
    }

   static get preferInsert() {
      return this._params.preferInsert;
    }
  }

