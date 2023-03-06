import { browser } from "../Vendor/Browser.js";

/** @param {() => unknown} fn */
let run = (fn) => fn();

/** @param {string} id */
let show_html_for = (id) => {
  /** @type {NodeListOf<HTMLElement>} */
  let popup_divs = document.querySelectorAll(".popup > div");
  for (let div of popup_divs) {
    div.style.display = "none";
  }
  /** @type {HTMLElement} */
  let to_show = document.querySelector(`.popup > ${id}`);
  to_show.style.display = null;
  return to_show;
};

/**
 * Function that works with my Extension Messaging Wrapper for nice error handling
 * @param {any} message
 * */
let send_chrome_message = async (message) => {
  let { type, value } = await browser.runtime.sendMessage(message);
  if (type === "resolve") {
    return value;
  } else {
    let err = new Error(value.message);
    err.stack = value.stack;
    // err.stack = [
    //   ...x.value.stack.split('\n'),
    //   'From postMessage to background page',
    //   ...stack,
    // ].join('\n');
    throw err;
  }
};

/**
 * @param {string} mode
 * @param {boolean} disabled
 * @returns {import("../Background/BackgroundModule.js").WindowedMode}
 */
let clean_mode = (mode, disabled) => {
  // Any other mode than the known ones are ignored
  if (mode == "fullscreen" || mode == "windowed" || mode == "in-window") {
    return mode;
  }
  return disabled === true ? "fullscreen" : "ask";
};
/** @param {import("webextension-polyfill-ts").Tabs.Tab} tab */
let get_host_config = async (tab) => {
  let host = new URL(tab.url).host;
  let host_mode = `mode(${host})`;
  let host_pip = `pip(${host})`;
  let {
    [host_mode]: mode,
    [host]: disabled,
    [host_pip]: pip,
  } = await browser.storage.sync.get([host_mode, host, host_pip]);

  return {
    mode: clean_mode(mode, disabled),
    pip: pip === true,
  };
};

/** @type {{ [tabid: number]: Promise<boolean> }} */
let current_port_promises = {};
/**
 * Check if we can connect with the Windowed content script in a tab
 * @param {number} tabId
 * @returns {Promise<boolean>}
 */
let ping_content_script = async (tabId) => {
  try {
    if (current_port_promises[tabId] != null) {
      return await current_port_promises[tabId];
    } else {
      current_port_promises[tabId] = new Promise((resolve, reject) => {
        let port = browser.tabs.connect(tabId);
        port.onMessage.addListener((message) => {
          resolve(true);
          port.disconnect();
        });
        port.onDisconnect.addListener((p) => {
          resolve(false);
        });
      });
      return await current_port_promises[tabId];
    }
  } finally {
    delete current_port_promises[tabId];
  }
};

const hideOrDisplayHint = (value) => {
  let overrideHint = document.getElementById('overrideHint');
  if (value === 'ask') {
    overrideHint.classList.add('hidden');
  } else {
    overrideHint.classList.remove('hidden');
  }
}

const changeKeyForAppleUsers = () => {
  let isApple = /Mac|iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isApple) {
    document.getElementById('isNotApple').classList.add('hidden');
  } else {
    document.getElementById('isApple').classList.add('hidden');
  }
};
let initialize_page = async () => {
  let tabs = await browser.tabs.query({ active: true, currentWindow: true });
  let tab = tabs[0];

  if (tab.status !== "complete") {
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    await initialize_page();
    return;
  }

  let has_contentscript_active =
    tab.status === "complete" && (await ping_content_script(tab.id));

  if (
    has_contentscript_active === false &&
    (tab.url.match(/^about:/) ||
      tab.url.match(/^chrome:\/\//) ||
      tab.url.match(/^edge:\/\//) ||
      tab.url.match(/^https?:\/\/chrome\.google\.com/) ||
      tab.url.match(/^https?:\/\/support\.mozilla\.org/))
  ) {
    await show_html_for("#disabled-because-security");
    return;
  }

  if (tab.status === "complete" && has_contentscript_active === false) {
    let $root = await show_html_for("#need-a-refresh");
    $root.querySelector(".reload").addEventListener("click", async () => {
      await browser.tabs.reload(tab.id);
      await initialize_page();
    });
    return;
  }

  // @ts-ignore
  if (HTMLVideoElement.prototype.requestPictureInPicture != null) {
    document.body.classList.add("picture-in-picture-support");
  }

  let host = new URL(tab.url).host;
  let host_mode = `mode(${host})`;
  let host_pip = `pip(${host})`;
  for (let element of document.querySelectorAll("[data-placeholder=domain]")) {
    element.textContent = host;
  }

  let $root = await show_html_for("#working");
  let $form = $root.querySelector("form");
  // @ts-ignore
  let behaviour_input = $form.elements.behaviour;
  // @ts-ignore
  let picture_in_picture_input = $form.elements.picture_in_picture;

  $form.addEventListener("input", async (e) => {
    hideOrDisplayHint(behaviour_input.value);
    await browser.storage.sync.set({
      [host_mode]: behaviour_input.value,
      [host_pip]: picture_in_picture_input.checked,
    });
    await send_chrome_message({
      type: "update_windowed_button",
      id: tab.id,
    });
  });

  let config = await get_host_config(tab);
  behaviour_input.value = config.mode;
  picture_in_picture_input.checked = config.pip;
  hideOrDisplayHint(behaviour_input.value);
  changeKeyForAppleUsers();
};

run(initialize_page);

export {};
