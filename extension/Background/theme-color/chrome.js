/** @type {import("webextension-polyfill").Browser} */
// @ts-ignore
let browser = chrome;

let creating; // A global promise to avoid concurrency issues
/**
 *
 * @param {string} path
 * @returns {Promise}
 */
async function setupOffscreenDocument(path) {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  const offscreenUrl = browser.runtime.getURL(path);
  const existingContexts = await browser.runtime.getContexts({
    // @ts-ignore
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  // create offscreen document
  if (creating) {
    await creating;
  } else {
    // @ts-ignore
    creating = browser.offscreen.createDocument({
      url: path,
      reasons: ["MATCH_MEDIA"],
      justification: "Use window.matchMedia to determine the theme color.",
    });

    await creating;
    creating = null;
  }
}

/**
 * @param {string} query
 * @returns {Promise<MediaQueryList>}
 */
let matchMedia = async (query) => {
  await setupOffscreenDocument("Background/theme-color/chrome-offscreen.html");

  // Send message to offscreen document
  return await browser.runtime.sendMessage({
    type: "matchMedia",
    target: "offscreen",
    data: query,
  });
};

/**
 * Tries to figure out the default icon color
 * - Tries to use the current theme on firefox
 * - Else defaults to light and dark mode
 * @param {import("webextension-polyfill").Tabs.Tab} tab
 * @returns {Promise<string>}
 */
export let icon_theme_color_chrome = async (tab) => {
  let x = (await matchMedia("(prefers-color-scheme: dark)")).matches
    ? "rgba(255,255,255,0.8)"
    : "#5f6368";
  return x;
};
