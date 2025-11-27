import { themecolor_to_string } from "../../utilities/themecolor-to-string.js";

/** @type {import("webextension-polyfill").Browser} */
// @ts-ignore
let browser = chrome;

/**
 * Tries to figure out the default icon color
 * - Tries to use the current theme on firefox
 * - Else defaults to light and dark mode
 * @param {import("webextension-polyfill").Tabs.Tab} tab
 * @returns {Promise<string>}
 */
export let icon_theme_color_firefox = async (tab) => {
  let theme = await browser.theme.getCurrent(tab.windowId);

  if (theme?.colors?.icons != undefined) {
    return themecolor_to_string(theme.colors.icons);
  }
  if (theme?.colors?.toolbar_field_border_focus != undefined) {
    return themecolor_to_string(theme.colors.toolbar_field_border_focus);
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "rgba(255,255,255,0.8)"
    : "rgb(250, 247, 252)";
};
