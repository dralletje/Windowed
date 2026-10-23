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

for (let element of document.querySelectorAll("[data-dynamic-mask-image]")) {
  if (element instanceof HTMLElement) {
    let mask_image_path = element.dataset.dynamicMaskImage;
    let string = browser.runtime.getURL(mask_image_path);
    element.style.setProperty("mask-image", `url(${string})`);
  }
}

let browser_info = browser.runtime.getBrowserInfo
  ? await browser.runtime.getBrowserInfo()
  : await Promise.resolve({ name: "Chrome" });
let is_firefox = browser_info.name === "Firefox";

document.documentElement.classList.add(
  is_firefox ? "browser-firefox" : "browser-chrome",
);

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

let ALL_OPTIONS = "options(*)";
let KNOWN_OPTIONS = [
  "windowed",
  "in-window",
  "fullscreen",
  "picture-in-picture",
];

/**
 * @param {unknown} options
 * @returns {string[]}
 */
let clean_options = (options) => {
  if (!Array.isArray(options)) {
    return [...KNOWN_OPTIONS];
  }
  let cleaned = options.filter((v) => KNOWN_OPTIONS.includes(v));
  return [...(cleaned.length > 0 ? cleaned : KNOWN_OPTIONS)];
};

let ALL_MODE = "mode(*)";
let ALL_PIP = "pip(*)";

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
/** @param {import("webextension-polyfill").Tabs.Tab} tab */
let get_host_config = async (tab) => {
  let host = new URL(tab.url).host;
  let host_mode = `mode(${host})`;
  let host_pip = `pip(${host})`;
  let host_options = `options(${host})`;
  let {
    [host_mode]: mode,
    [host]: disabled,
    [host_pip]: pip,
    [host_options]: options,
    [ALL_MODE]: all_mode,
    [ALL_PIP]: all_pip,
    [ALL_OPTIONS]: all_options,
  } = await browser.storage.sync.get([
    host_mode,
    host,
    host_pip,
    host_options,
    ALL_MODE,
    ALL_PIP,
    ALL_OPTIONS,
  ]);

  return {
    mode: clean_mode(mode ?? all_mode, disabled),
    pip: (pip ?? all_pip) === true,
    options: clean_options(options ?? all_options),
    all_mode: clean_mode(all_mode, false),
    all_pip: all_pip === true,
    all_options: clean_options(all_options),
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
  let host_options = `options(${host})`;
  for (let element of document.querySelectorAll("[data-placeholder=domain]")) {
    element.textContent = host;
  }

  let $root = await show_html_for("#working");
  let $form = $root.querySelector("form");
  /** @type {HTMLButtonElement} */
  let $set_as_default_button = $root.querySelector("#set-as-default");
  // @ts-ignore
  let behaviour_input = $form.elements.behaviour;
  // @ts-ignore
  let picture_in_picture_input = $form.elements.picture_in_picture;

  // @ts-ignore
  let layout_input = $form.elements.layout;
  /** @type {NodeListOf<HTMLInputElement>} */
  let option_inputs = $form.querySelectorAll('input[name="option"]');
  /** @type {HTMLElement} */
  let $single_options = $root.querySelector("#single-options");
  /** @type {HTMLElement} */
  let $multiple_options = $root.querySelector("#multiple-options");

  /** @param {string} layout */
  let show_layout = (layout) => {
    $single_options.hidden = layout !== "single";
    $multiple_options.hidden = layout !== "multiple";
  };

  let read_form = () => {
    let is_multiple = layout_input.value === "multiple";
    return {
      mode: is_multiple ? "ask" : behaviour_input.value || "in-window",
      pip: !is_multiple && picture_in_picture_input.checked,
      options: [...option_inputs]
        .filter((input) => input.checked)
        .map((input) => input.value),
    };
  };

  let config = await get_host_config(tab);

  document.body.setAttribute("data-mode-selected", config.mode);

  let update_default_button = () => {
    $set_as_default_button.disabled =
      config.mode === config.all_mode &&
      config.pip === config.all_pip &&
      config.options.join() === config.all_options.join();
  };
  update_default_button();

  $form.addEventListener("input", async (e) => {
    let { mode, pip, options } = read_form();
    if (options.length === 0) {
      // @ts-ignore
      e.target.checked = true;
      return;
    }

    await browser.storage.sync.set({
      [host_mode]: mode,
      [host_pip]: pip,
      [host_options]: options,
    });

    behaviour_input.value = mode;
    show_layout(layout_input.value);
    config = await get_host_config(tab);
    update_default_button();

    send_chrome_message({
      type: "update_windowed_button",
      id: tab.id,
    });
  });

  $set_as_default_button.addEventListener("click", async (e) => {
    let { mode, pip, options } = read_form();

    await browser.storage.sync.set({
      [ALL_MODE]: mode,
      [ALL_PIP]: pip,
      [ALL_OPTIONS]: options,
    });

    config = await get_host_config(tab);
    update_default_button();

    send_chrome_message({
      type: "update_windowed_button",
      id: tab.id,
    });
  });

  let layout = config.mode === "ask" ? "multiple" : "single";
  layout_input.value = layout;
  show_layout(layout);

  behaviour_input.value = config.mode;
  picture_in_picture_input.checked = config.pip;

  for (let input of option_inputs) {
    input.checked = config.options.includes(input.value);
  }
};

run(initialize_page);

export {};
