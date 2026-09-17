// Google's inline video viewer (the page you get when you expand a video in the
// search results, `...#fpstate=ive&vld=cid:...,vid:...`) still gives away where
// the video comes from: a "YouTube" label next to the title, another one on
// every result row, and the Youtube logo/favicon next to them.
// The player iframe itself is taken care of in Content.js, this takes care of
// the labels and logos Google puts around it.
//
// Only runs on Google search pages, and only does anything while the video
// viewer is actually open.

const CLOAK_WORD = "Archived";

/**
 * The labels are elements that contain the word and nothing else, like
 * `<span class="KrMNbf z8gr9e">YouTube</span>`. Matching on the text instead of
 * on those classes, because Google rotates its class names all the time.
 */
const YOUTUBE_LABEL = /^(\s*)youtube(\s*)$/i;
/** Logos and favicons, eg. .../branding/product/1x/youtube_32dp.png */
const IS_YOUTUBE_URL = /youtube/i;

/**
 * Every label we rewrote, with what it said before, so closing the viewer
 * puts the normal search results back.
 * @type {Array<{ node: Text, text: string }>}
 */
let cloaked_labels = [];
let is_cloaking = false;

let is_video_viewer_open = () =>
  location.href.includes("fpstate=ive") || location.href.includes("vld=cid:");

/**
 * @param {Element} element
 */
let cloak_element = (element) => {
  if (element instanceof HTMLImageElement && IS_YOUTUBE_URL.test(element.src)) {
    element.remove();
    return;
  }

  // Only elements that are nothing but the label, so titles, urls and the
  // likes are left alone
  if (element.firstChild == null) return;
  if (element.firstChild !== element.lastChild) return;
  if (!(element.firstChild instanceof Text)) return;

  let node = element.firstChild;
  let text = node.nodeValue ?? "";
  let match = text.match(YOUTUBE_LABEL);
  if (match == null) return;

  cloaked_labels.push({ node: node, text: text });
  node.nodeValue = `${match[1]}${CLOAK_WORD}${match[2]}`;
};

/**
 * @param {Node} root
 */
let cloak_subtree = (root) => {
  if (!(root instanceof Element)) return;
  cloak_element(root);
  // `cloak_element` can remove an image, but never one of these
  for (let element of root.querySelectorAll("*")) cloak_element(element);
};

let start_cloaking = () => {
  if (is_cloaking) return;
  is_cloaking = true;
  cloak_subtree(document.documentElement);
};

let stop_cloaking = () => {
  if (!is_cloaking) return;
  is_cloaking = false;

  for (let { node, text } of cloaked_labels) {
    // Only put it back if nothing else has written to the node since
    if (node.nodeValue?.trim() === CLOAK_WORD) node.nodeValue = text;
  }
  cloaked_labels = [];
};

let sync_cloaking = () => {
  if (is_video_viewer_open()) {
    start_cloaking();
  } else {
    stop_cloaking();
  }
};

// Google swaps the viewer in and out with the history api, which doesn't
// always fire an event, but it never does so without touching the dom
let observer = new MutationObserver((mutations) => {
  sync_cloaking();
  if (!is_cloaking) return;

  for (let mutation of mutations) {
    if (mutation.type === "characterData") {
      if (mutation.target.parentElement != null) {
        cloak_element(mutation.target.parentElement);
      }
    } else if (mutation.type === "attributes") {
      if (mutation.target instanceof Element) cloak_element(mutation.target);
    } else {
      for (let node of mutation.addedNodes) cloak_subtree(node);
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["src"],
});

window.addEventListener("hashchange", sync_cloaking);
window.addEventListener("popstate", sync_cloaking);

// In case the page is opened on the viewer directly (history, bookmark, ...)
sync_cloaking();
