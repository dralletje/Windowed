// Get a window to put our tab on: either the last focussed, a random, or none;
// In case of none being found, null is returned and the caller should make a new window himself (with the tab attached)
const get_fallback_window = async (windowId) => {
	const first_fallback_window = await browser.windows.getLastFocused({
		windowTypes: ['normal'],
	});

	if (first_fallback_window.id !== windowId) {
		return first_fallback_window;
	} else {
		const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
		const right_window = windows
			.filter(x => x.id !== windowId)
			.sort((a, b) => a.tabs.length - b.tabs.length)[0]

		if (right_window) {
			return right_window;
		} else {
			return null;
		}
	}
}

let get_window = async (id) => {
	return new Promise((resolve) => {
		chrome.windows.get(id, window => {
			resolve(window);
		});
	});
}

let get_title = (details) => {
	return new Promise((resolve) => {
		chrome.browserAction.getTitle(details, x => resolve(x))
	})
}

// TODO Instead of using this static height, I can maybe "ping" the page I'm popup-izing
// after it is done becoming a popup: then it can figure out it's position itself
// (and check the size of it's current header itself)
const Chrome_Popup_Menubar_Height = 22; // Do `window.outerHeight - window.innerHeight` in a popup tab

let chrome_response = (fn) => (request, sender, response_fn) => {
	fn(request, sender)
	.then(x => {
		response_fn({ type: 'resolve', value: x });
	})
	.catch(err => {
		response_fn({ type: 'reject', value: err });
	})

	return true;
}

chrome.runtime.onMessage.addListener(chrome_response(async (request, sender) => {
	if (request.type === 'is_windowed_enabled') {
		let result = await get_title({ tabId: sender.tab.id });
		return result === DEFAULT_BROWSERACTION_TITLE;
	}

	/*
		Detatch the current tab and put it into a standalone popup window
	*/
	if (request.type === 'please_make_me_a_popup') {
		// TODO Save windowId and index inside that window,
		// so when you "pop" it back, it will go where you opened it
		let { left: screenLeft, top: screenTop, type: windowType } = await get_window(sender.tab.windowId);

		// TODO Check possible 'panel' support in firefox
		if (windowType === 'popup') {
			// Already a popup, no need to re-create the window
			await browser.windows.update(sender.tab.windowId, {
				left: Math.round(screenLeft + frame.left),
				top: Math.round(screenTop + frame.top - Chrome_Popup_Menubar_Height),
				width: Math.round(frame.width),
				height: Math.round(frame.height + Chrome_Popup_Menubar_Height),
			});
			return;
		}

		let frame = request.position;
		const created_window = await browser.windows.create({
			tabId: sender.tab.id,
			type: 'popup',
			left: Math.round(screenLeft + frame.left),
			top: Math.round(screenTop + frame.top - Chrome_Popup_Menubar_Height),
			width: Math.round(frame.width),
			height: Math.round(frame.height + Chrome_Popup_Menubar_Height),
		});
		// created_window.setAlwaysOnTop(true);
		return;
	}

	/*
		Take the current tab, and put it into a tab-ed window again.
		1. Last focussed window
		2. Other tab-containing window (not popups without tab bar)
		3. New window we create
	*/
	if (request.type === 'please_make_me_a_tab_again') {
		const fallback_window = await get_fallback_window(sender.tab.windowId);

		if (fallback_window) {
			await browser.tabs.move(sender.tab.id, {
				windowId: fallback_window.id,
				index: -1,
			});
			await browser.tabs.update(sender.tab.id, { active: true });
		} else {
			// No other window open: create a new window with tabs
			const create_window_with_tabs = await browser.windows.create({
				tabId: sender.tab.id,
				type: 'normal',
			});
		}
		return;
	}
}));


let DEFAULT_BROWSERACTION_TITLE = 'Disable Windowed on this tab';
chrome.browserAction.setIcon({
	path: '/Images/Icon_Windowed@scalable.svg',
});
chrome.browserAction.setTitle({
	title: DEFAULT_BROWSERACTION_TITLE,
})
chrome.browserAction.onClicked.addListener(async (tab) => {
	let result = await get_title({ tabId: tab.id });

	if (result === DEFAULT_BROWSERACTION_TITLE) {
		chrome.browserAction.setIcon({
			tabId: tab.id,
			path: '/Images/Icon_Windowed_Dim@scalable.svg',
		});
		chrome.browserAction.setTitle({
			tabId: tab.id,
			title: 'Windowed disabled, click to re-activate',
		})
	  // chrome.tabs.sendMessage(tab.id, { type: 'change-window-enabled', enabled: false });
	} else {
		chrome.browserAction.setIcon({
			tabId: tab.id,
			path: '/Images/Icon_Windowed@scalable.svg',
		});
		chrome.browserAction.setTitle({
			tabId: tab.id,
			title: DEFAULT_BROWSERACTION_TITLE,
		})
		// chrome.tabs.sendMessage(tab.id, { type: 'change-window-enabled', enabled: true });
	}
});

// TODO Chance CSP headers on firefox to allow script injection?
// browser.webRequest.onBeforeRequest.addListener(request => {
// 	console.log('HEY~', request);
// 	var headers = details.responseHeaders;
// 	return {
// 		responseHeaders: headers.map(header => {
// 			const name = header.name.toLowerCase();
// 			console.log(`header:`, header)
// 			if (name !== "content-security-policy" && name !== "x-webkit-csp") {
// 				return header;
// 			} else {
// 				return header;
// 			}
// 		}),
// 	};
// }, { urls: ["<all_urls>"], types: ['main_frame', 'sub_frame'] }, ['blocking', 'responseHeaders']);
