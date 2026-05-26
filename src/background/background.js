// background.js

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
