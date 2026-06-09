// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ask-torcons",
    title: "Ask Torcons about this",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ask-torcons-image",
    title: "Ask Torcons about this image",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
    console.warn("Torcons cannot be injected into restricted pages.");
    return;
  }

  let pendingAsk = null;
  if (info.menuItemId === "ask-torcons" && info.selectionText) {
    pendingAsk = { type: "text", text: info.selectionText };
  } else if (info.menuItemId === "ask-torcons-image" && info.srcUrl) {
    const imageUrl = getPublicUrl(info.srcUrl) || getPublicUrl(info.linkUrl);
    pendingAsk = imageUrl
      ? { type: "image", imageUrl }
      : {
          type: "error",
          message: "This image does not expose a public image URL, so Torcons cannot send it. Try opening the image in a new tab and using that URL."
        };
  }

  if (!pendingAsk) return;

  const pendingKey = `pendingContextAsk_${tab.id}`;
  chrome.storage.session.set({ [pendingKey]: pendingAsk }, () => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.torconsActionType = 'open'; }
    }).then(() => {
      return chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/sidebar_injector.js']
      });
    }).catch(err => console.error("Torcons Inject Error:", err));
  });
});

function getPublicUrl(url) {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.href : null;
  } catch (e) {
    return null;
  }
}

// Handle extension icon click to toggle sidebar
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
    console.warn("Torcons cannot be injected into restricted pages.");
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['src/content/sidebar_injector.js']
  }).catch(err => console.error("Torcons Inject Error:", err));
});

// Listen for messages from the content script injected into chat.torcons.ai
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TOKEN_SYNC" && message.token) {
    chrome.storage.local.set({ token: message.token }, () => {
      console.log("Torcons: Auth token synced successfully.");

      if (message.closeTab && sender.tab && sender.tab.id) {
        chrome.tabs.remove(sender.tab.id).catch(e => console.warn(e));
        if (message.returnTabId) {
          chrome.tabs.update(message.returnTabId, { active: true }).catch(e => console.warn("Failed to focus return tab:", e));
        }
      }

      sendResponse({ success: true });
    });
    return true; // Keep message channel open for async response
  } else if (message.type === "GET_PENDING_CONTEXT_ASK") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ ask: null });
      return false;
    }

    const pendingKey = `pendingContextAsk_${tabId}`;
    chrome.storage.session.get([pendingKey], (result) => {
      const ask = result[pendingKey] || null;
      if (ask) {
        chrome.storage.session.remove(pendingKey);
      }
      sendResponse({ ask });
    });
    return true;
  } else if (message.action === 'toggle_sidebar') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['src/content/sidebar_injector.js']
    }).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("Torcons Inject Error:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  }
});
