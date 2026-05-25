// background.js

// Handle extension icon click to toggle sidebar
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('https://chrome.google.com/webstore'))) {
    console.warn("Torcons cannot be injected into restricted pages.");
    return; 
  }
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['sidebar_injector.js']
  }).catch(err => console.error("Torcons Inject Error:", err));
});

// Listen for messages from the content script injected into chat.torcons.ai
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TOKEN_SYNC" && message.token) {
    chrome.storage.local.set({ token: message.token }, () => {
      console.log("Torcons: Auth token synced successfully.");
    });
    sendResponse({ success: true });
  }
});
