import * as util from "./util.js";

test("semver", () => {
  expect(util.semver.gt("1.1.6", "1.4.0")).toBe(false);
  expect(util.semver.gt("1.19", "1.18.4")).toBe(true);
});
