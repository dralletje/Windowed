# ![Windowed Logo](extension/Icons/Icon_32.png) Windowed

[Install in Chrome Webstore](https://chrome.google.com/webstore/detail/windowed-floating-youtube/gibipneadnbflmkebnmcbgjdkngkbklb)

A small extension for chrome and firefox I made because I don't really like normal fullscreen. It injects itself into every page, and replaces `HTMLElement.prototype.requestFullscreen` (or the specific browser version) with a popup to get into Windowed or In-window mode.

![Chromestore screenshot](Chromewebstore%20screenshot%20%231.png)

### Why so much code
There are actually a lot of things that the websites need when I'm fullscreen-ing them.
1. There is mostly a lot of code for the popup that allows you choose between Windowed and fullscreen.
2. Some of them remove the component we want to fullscreen as soon as we resize, in which case I copy the element and try to show it anyway.
3. When clicking inside a frame, it should fullscreen that frame inside the parent window.
4. Need to be able to disable domain by clicking the Windowed toolbar button, and I want the icon to update accordingly on every tab.
5. Even just selecting the right window to restore the tab to after going out of windowed mode again takes more lines then you'd expect.

### Hey I got a request or even got something that might be useful
Nice. Please open an issue or a PR. That'd be really cool. 😎

---

Thanks for reading,  
Michiel Dral
