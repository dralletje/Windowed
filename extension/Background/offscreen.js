chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Return early if this message isn't meant for the offscreen document.
  if (message.target !== "offscreen") {
    return;
  }

  if (message.type === "matchMedia") {
    const result = window.matchMedia(message.data);
    sendResponse({
      matches: result.matches,
      media: result.media,
    });
    return true;
  }
});
