import { jest } from "@jest/globals";
import PassFF from "../modules/main.js";
import { log } from "../modules/util.js";

let policy, local;

beforeAll(() => {
  Object.defineProperty(global, "browser", {
    value: {
      storage: {
        managed: {
          get: jest.fn(() =>
            policy === null
              ? Promise.reject(new Error("Managed storage manifest not found"))
              : Promise.resolve(policy),
          ),
        },
        local: {
          get: jest.fn(() => Promise.resolve(local)),
          set: jest.fn((obj) => {
            Object.assign(local, obj);
            return Promise.resolve();
          }),
        },
        onChanged: { addListener: jest.fn() },
      },
      commands: {
        getAll: jest.fn(() =>
          Promise.resolve([
            { name: "_execute_browser_action", shortcut: "Ctrl+Y" },
          ]),
        ),
        update: jest.fn(() => Promise.resolve()),
      },
    },
    writable: false,
  });
  PassFF.mode = "background";
});

beforeEach(() => jest.clearAllMocks());

test("without a policy the stored preferences are used", async () => {
  policy = null;
  local = { enterBehavior: 1 };
  await PassFF.Preferences.init();
  expect(PassFF.Preferences.enterBehavior).toBe(1);
  PassFF.Preferences.enterBehavior = 2;
  expect(local.enterBehavior).toBe(2);
  expect(browser.commands.update).not.toHaveBeenCalled();
});

test("managed preferences replace the stored ones and lock them", async () => {
  const warnSpy = jest.spyOn(log, "warn").mockImplementation(() => {});
  policy = {
    enterBehavior: 3,
    recognisedSuffixes: "co.uk,it",
    tbMenuShortcut: "Ctrl+Alt+P",
    defaultPasswordLength: "20", // wrong type, ignored
  };
  local = { enterBehavior: 1, defaultPasswordLength: 12 };
  await PassFF.Preferences.init();

  expect(PassFF.Preferences.enterBehavior).toBe(3);
  expect(PassFF.Preferences.recognisedSuffixes).toEqual(["co.uk", "it"]);
  expect(PassFF.Preferences.defaultPasswordLength).toBe(12);
  expect(warnSpy).toHaveBeenCalledTimes(1);
  expect(browser.commands.update).toHaveBeenCalledWith({
    name: "_execute_browser_action",
    shortcut: "Ctrl+Alt+P",
  });

  PassFF.Preferences.enterBehavior = 0;
  expect(PassFF.Preferences.enterBehavior).toBe(3);
  expect(local.enterBehavior).toBe(1);
});
