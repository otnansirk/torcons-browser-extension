// background.js

chrome.sidePanel.setOptions({ enabled: false }).catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

function openTabSidePanel(tabId) {
  chrome.sidePanel.setOptions({
    tabId,
    path: 'src/ui/sidebar/sidebar.html',
    enabled: true
  }).catch(err => console.error("setOptions error:", err));
  
  return chrome.sidePanel.open({ tabId });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: "https://torcons.ai/extension" });
  }

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

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) {
    openTabSidePanel(tab.id).catch(console.error);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  let pendingAsk = null;
  if (info.menuItemId === "ask-torcons" && info.selectionText) {
    pendingAsk = { type: "text", text: info.selectionText };
  } else if (info.menuItemId === "ask-torcons-image" && info.srcUrl) {
    const imageUrl = getPublicUrl(info.srcUrl) || getPublicUrl(info.linkUrl);
    pendingAsk = imageUrl
      ? { type: "image", imageUrl }
      : {
          type: "error",
          message: "This image cannot be sent. Try opening the image in a new tab and using that URL."
        };
  }

  if (!pendingAsk) return;

  const pendingKey = `pendingContextAsk_${tab.id}`;
  chrome.storage.session.set({ [pendingKey]: pendingAsk }, () => {
    openTabSidePanel(tab.id).then(() => {
      setTimeout(() => chrome.runtime.sendMessage({ type: 'TORCONS_CHECK_PENDING_CONTEXT_ASK' }).catch(() => {}), 100);
    }).catch(err => console.error("Side Panel Error:", err));
  });
});

function getPublicUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.href : null;
  } catch (e) {
    return null;
  }
}

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
    const tabId = message.tabId || (sender.tab && sender.tab.id);
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
  } else if (message.type === 'FETCH_IMAGE_AS_BASE64') {
    if (message.url.startsWith('data:image/')) {
      sendResponse({ base64: message.url });
      return false;
    }
    fetch(message.url)
      .then(res => res.blob())
      .then(async blob => {
        try {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          const CHUNK_SIZE = 8192;
          let binary = '';
          for (let i = 0; i < len; i += CHUNK_SIZE) {
            const chunk = bytes.subarray(i, i + CHUNK_SIZE);
            binary += String.fromCharCode.apply(null, chunk);
          }
          const base64Data = `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
          sendResponse({ base64: base64Data });
        } catch (err) {
          console.warn("Torcons Background ArrayBuffer Error:", err);
          sendResponse({ base64: message.url });
        }
      })
      .catch(err => {
        console.warn("Torcons Background Fetch Error:", err);
        sendResponse({ base64: message.url });
      });
    return true;
  } else if (message.type === 'GET_SIDEPANEL_STATE') {
    const tabId = sender.tab && sender.tab.id;
    sendResponse({ isOpen: sidePanels.has(tabId) });
    return false;
  } else if (message.action === 'toggle_side_panel') {
    const tabId = sender.tab.id;
    if (sidePanels.has(tabId)) {
      chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
      try {
        sidePanels.get(tabId).postMessage({ type: 'CLOSE_SIDEPANEL' });
      } catch(e) {}
      sendResponse({ success: true, action: 'closed' });
    } else {
      openTabSidePanel(tabId)
        .then(() => sendResponse({ success: true, action: 'opened' }))
        .catch(err => {
          console.error("Side Panel Error:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }
  } else if (message.action === 'open_side_panel') {
    openTabSidePanel(sender.tab.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error("Side Panel Error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }
});

const sidePanels = new Map(); // tabId -> port

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'torcons_sidepanel') {
    let panelTabId = null;

    port.onMessage.addListener((msg) => {
      if (msg.type === 'INIT' && msg.tabId) {
        panelTabId = msg.tabId;
        sidePanels.set(panelTabId, port);
        chrome.tabs.sendMessage(panelTabId, { type: 'SIDEPANEL_STATE_CHANGED', isOpen: true }).catch(()=>{});
      }
    });

    port.onDisconnect.addListener(() => {
      if (panelTabId) {
        sidePanels.delete(panelTabId);
        chrome.tabs.sendMessage(panelTabId, { type: 'SIDEPANEL_STATE_CHANGED', isOpen: false }).catch(()=>{});
      }
    });
  }
});
