# ![Windowed Logo](extension/Icons/Icon_32.png) Windowed

[Install in Chrome Webstore](https://chrome.google.com/webstore/detail/windowed-floating-youtube/gibipneadnbflmkebnmcbgjdkngkbklb)  
[Install in Firefox](https://addons.mozilla.org/firefox/addon/windowed/)  
[Install in Edge](https://microsoftedge.microsoft.com/addons/detail/windowed-floating-youtu/kfaokmgjemianbbeadblgppcedfihdnb)

A small extension for chrome and firefox I made because I don't really like normal fullscreen. It injects itself into every page, and replaces `HTMLElement.prototype.requestFullscreen` (or the browser specific version) with a popup to get into Windowed, In-window or picture in picture mode. Important for me is that the video/page does not reload when switching to Windowed.

![Chromestore screenshot](Chromewebstore%20screenshot%20%231.png)

### Modes

Even though I want to create a very minimalist extension, I still provide some choice every time you want to go into fullscreen.

- **Windowed** <kbd>w</kbd>  
  Obviously my favourite, hence the namesake of this extension. Puts video in a seperate window with title bar. I can't get rid of the title bar because of restrictions in Chrome extensions. Other extensions do put videos in title-bar-less windows, but that requires a reload of the page, and I really really really don't like that. Also it does not float. Floating also, is exclusive to reload
- **In-Window** <kbd>i</kbd>  
  Does the same as Windowed, but doesn't pop the window out. So it will fill the full window that as it is right now.
- **Fullscreen** <kbd>f</kbd>  
  Get out, ya joker
- **Picture in Picture** <kbd>p</kbd>  
  This only shows up if a video element is found. Will put the video into native Picture-in-Picture mode, with only browser controls. This is amazing in most cases, butttttt here is one big disadvantage, the only reason I'm still working on this extension even, is that it **only works on videos**, and only **without any website specific controls**. For youtube, that doesn't really stack up against the floating-on-top feature for me. Still, there are many websites that do put something else (not a video) in fullscreen, which picture-in-picture does not support.  
  Either picture-in-picture needs to work for arbitrary elements, which would be really awesome, or chrome extensions should be able to make floating-on-top windows (they used to). Until then, we are stuck with two modes for just slightly different situations

### Why so much code

There are actually a lot of things that the websites need when I'm fullscreen-ing them.

1. There is mostly a lot of code for the popup that allows you choose between Windowed and fullscreen.
2. Some of them remove the component we want to fullscreen as soon as we resize, in which case I copy the element and try to show it anyway.
3. When clicking inside a frame, it should fullscreen that frame inside the parent window.
4. Need to be able to disable domain by clicking the Windowed toolbar button, and I want the icon to update accordingly on every tab.
5. Even just selecting the right window to restore the tab to after going out of windowed mode again takes more lines then you'd expect.
6. Firefox has some restrictions on requesting fullscreen from async functions, so had to work around that by using sync functions first where necessary.

### Hey I got a request or even got something that might be useful

Nice. Please open an issue or a PR. That'd be really cool. 😎

---

Thanks for reading,  
Michiel Dral
