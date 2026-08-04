// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const chatView = document.getElementById('chat-view');
  const signinBtn = document.getElementById('signin-btn');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const fileUpload = document.getElementById('file-upload');
  const chatHistory = document.getElementById('chat-history');
  const settingsBtn = document.getElementById('settings-btn');
  const removeAttachmentBtn = document.getElementById('remove-attachment-btn');
  const DEFAULT_MODEL = 'Torcons';
  const MODEL_STORAGE_KEY = 'selectedModel';

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Connect to background script to track open/close state
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const port = chrome.runtime.connect({ name: 'torcons_sidepanel' });
      port.postMessage({ type: 'INIT', tabId: tabs[0].id });
      
      port.onMessage.addListener((message) => {
        if (message.type === 'CLOSE_SIDEPANEL') {
          window.close();
        }
      });
    }
  });

  if (removeAttachmentBtn) {
    removeAttachmentBtn.addEventListener('click', () => {
      pendingAttachment = null;
      document.getElementById('attachment-preview').classList.add('hidden');
      document.querySelector('.attachment-content').innerHTML = '';
      sendBtn.disabled = chatInput.value.trim().length === 0;
    });
  }

  let authToken = null;
  let chatMessages = [];
  let currentPageKey = null;
  let pendingAttachment = null;

  const initPageKey = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab && tab.url ? tab.url.split('#')[0] : 'unknown_page';
      currentPageKey = `history_${url}`;
      
      const headerTitle = document.getElementById('header-page-title');
      if (headerTitle) {
        headerTitle.textContent = tab && tab.title ? tab.title : 'Torcons';
        headerTitle.title = tab && tab.title ? tab.title : '';
      }
    } catch (e) {
      currentPageKey = 'history_unknown_page';
    }
  };

  const saveHistory = () => {
    if (currentPageKey) {
      chrome.storage.local.set({ [currentPageKey]: chatMessages });
    }
  };

  const getStoredModel = () => {
    return new Promise(resolve => {
      chrome.storage.local.get([MODEL_STORAGE_KEY], result => resolve(result[MODEL_STORAGE_KEY]));
    });
  };

  async function loadSystemConfig() {
    try {
      const result = await new Promise(resolve => chrome.storage.local.get(['systemPrompt', 'useCustomPrompt'], resolve));
      if (result.useCustomPrompt && result.systemPrompt && result.systemPrompt.trim() !== '') {
        return { role: "system", content: result.systemPrompt };
      }
      
      const response = await fetch(chrome.runtime.getURL('config/system.json'));
      const config = await response.json();
      return { role: "system", content: config.system_prompt };
    } catch (e) {
      console.error("Failed to load system config", e);
      return { role: "system", content: "You are Torcons, an intelligent AI assistant." };
    }
  }

  const loadHistory = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get([currentPageKey], async (result) => {
        chatHistory.innerHTML = ''; // Clear hardcoded welcome message
        if (result[currentPageKey] && result[currentPageKey].length > 1) {
          chatMessages = result[currentPageKey];

          // Ensure the first message is the latest system prompt
          const systemMsg = await loadSystemConfig();
          if (chatMessages.length > 0 && chatMessages[0].role === 'system') {
            chatMessages[0] = systemMsg;
          }

          // Render existing messages
          chatMessages.forEach(msg => {
            if (msg.role !== 'system') {
              appendMessage(msg.role === 'assistant' ? 'ai' : 'user', msg);
            }
          });
          
          if (window.activeStreams && window.activeStreams[currentPageKey]) {
            const msgDiv = appendMessage('ai', window.activeStreams[currentPageKey].content);
            window.activeStreams[currentPageKey].bubble = msgDiv.querySelector('.bubble');
            appendTypingIndicator();
          }
        } else {
          // New day or no history
          const systemMsg = await loadSystemConfig();
          chatMessages = [systemMsg];
          // Render welcome message
          appendMessage('ai', "Hello! I'm Torcons. How can I help you today? You can also ask me to summarize the page you're currently on.");

          addInlineSummarizeButton();
          saveHistory();
        }
        resolve();
      });
    });
  };

  window.activeStreams = window.activeStreams || {};

  // 1. Authentication Check
  const checkAuth = async () => {
    await initPageKey();

    chrome.storage.local.get(['token'], async (result) => {
      const loadingOverlay = document.getElementById('loading-overlay');
      if (result.token) {
        authToken = result.token;
        loginView.classList.add('hidden');
        chatView.classList.remove('hidden');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');

        if (chatMessages.length === 0) {
          await loadHistory();
        }

        requestPendingContextAsk();
      } else {
        loginView.classList.remove('hidden');
        chatView.classList.add('hidden');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
      }
    });
  };

  // Listen for storage changes in case the background script syncs the token while popup is open
  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
      if (changes.token) {
        checkAuth();
      }
      if (changes.systemPrompt || changes.useCustomPrompt) {
        const systemMsg = await loadSystemConfig();
        if (chatMessages.length > 0 && chatMessages[0].role === 'system') {
          chatMessages[0] = systemMsg;
          saveHistory();
        }
      }
    }
  });

  checkAuth();

  let draftInputs = {};

  const saveDraft = () => {
    if (currentPageKey) {
      draftInputs[currentPageKey] = {
        text: chatInput.value,
        attachment: pendingAttachment
      };
    }
  };

  const loadDraft = () => {
    if (currentPageKey && draftInputs[currentPageKey]) {
      const draft = draftInputs[currentPageKey];
      chatInput.value = draft.text || '';
      
      if (draft.attachment) {
        // Temporarily bypass the process pending logic and just set it up directly
        pendingAttachment = draft.attachment;
        const attachmentContainer = document.getElementById('attachment-preview');
        const attachmentContent = attachmentContainer.querySelector('.attachment-content');
        attachmentContainer.classList.remove('hidden');
        
        if (pendingAttachment.type === 'image') {
          attachmentContent.style.display = 'block';
          attachmentContent.innerHTML = `<img src="${pendingAttachment.imageUrl}" alt="Attached Image" style="display: block; max-height: 80px; max-width: 100%; border-radius: 6px; object-fit: contain;">`;
        } else {
          attachmentContent.style.display = '-webkit-box';
          attachmentContent.textContent = `"${pendingAttachment.text}"`;
        }
      } else {
        pendingAttachment = null;
        document.getElementById('attachment-preview').classList.add('hidden');
        document.querySelector('.attachment-content').innerHTML = '';
      }
    } else {
      chatInput.value = '';
      pendingAttachment = null;
      document.getElementById('attachment-preview').classList.add('hidden');
      document.querySelector('.attachment-content').innerHTML = '';
    }
    
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
    sendBtn.disabled = chatInput.value.trim().length === 0 && !pendingAttachment;
  };

  // Handle SPA (Client-Side Rendering) navigation and tab title changes
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (authToken) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id === tabId) {
        if (changeInfo.url || changeInfo.title !== undefined) {
          const oldKey = currentPageKey;
          saveDraft();
          await initPageKey();
          if (oldKey !== currentPageKey) {
            loadDraft();
            await loadHistory();
          }
        }
      }
    }
  });

  // Handle tab switching
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (authToken) {
      const oldKey = currentPageKey;
      saveDraft();
      await initPageKey();
      if (oldKey !== currentPageKey) {
        loadDraft();
        await loadHistory();
      }
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    
    if (event.data && event.data.type === 'TORCONS_EXTERNAL_DROP') {
      if (authToken && event.data.payload) {
        processPendingContextAsk(event.data.payload);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TORCONS_CHECK_PENDING_CONTEXT_ASK') {
      if (authToken) {
        requestPendingContextAsk();
      }
    }
  });

  // 2. Sign In Button Action
  signinBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const returnTabId = tab ? tab.id : '';
    chrome.tabs.create({ url: `https://chat.torcons.ai/?source=extension&returnTabId=${returnTabId}` });
  });

  // 3. UI Interactions
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
    sendBtn.disabled = chatInput.value.trim().length === 0 && !pendingAttachment;
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  if (uploadBtn && fileUpload) {
    uploadBtn.addEventListener('click', () => {
      fileUpload.click();
    });

    fileUpload.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = (event) => {
          if (file.type.startsWith('image/')) {
            processPendingContextAsk({ type: 'image', imageUrl: event.target.result });
          } else {
            processPendingContextAsk({ type: 'text', text: event.target.result });
          }
        };

        if (file.type.startsWith('image/')) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
        
        // Reset so same file can be chosen again if removed
        e.target.value = '';
      }
    });
  }

  // Drag and Drop Logic

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    chatView.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  chatView.addEventListener('dragenter', () => {
    chatView.classList.add('drag-over');
  });

  chatView.addEventListener('dragleave', (e) => {
    // Only remove if leaving the chatView (not child elements)
    if (!chatView.contains(e.relatedTarget)) {
      chatView.classList.remove('drag-over');
    }
  });

  chatView.addEventListener('drop', async (e) => {
    chatView.classList.remove('drag-over');

    let imageUrl = null;

    // Handle dragged files (from OS)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
      if (file) {
        imageUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.readAsDataURL(file);
        });
      }
    }

    // Handle dragged images from the webpage
    if (!imageUrl) {
      const htmlData = e.dataTransfer.getData('text/html');
      if (htmlData) {
        const div = document.createElement('div');
        div.innerHTML = htmlData;
        const img = div.querySelector('img');
        if (img && img.src) {
          imageUrl = img.src;
        }
      }
    }

    if (!imageUrl) {
      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList && (uriList.startsWith('http') || uriList.startsWith('data:image'))) {
        imageUrl = uriList;
      }
    }

    if (!imageUrl) {
      const urlData = e.dataTransfer.getData('URL');
      if (urlData && (urlData.startsWith('http') || urlData.startsWith('data:image'))) {
        imageUrl = urlData;
      }
    }

    if (imageUrl) {
      processPendingContextAsk({ type: 'image', imageUrl: imageUrl });
    } else {
      const textData = e.dataTransfer.getData('text/plain');
      if (textData && textData.trim()) {
        processPendingContextAsk({ type: 'text', text: textData.trim() });
      }
    }
  });

  // 4. Send Message Logic
  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text && !pendingAttachment) return;

    // Reset input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Remove inline summarize button if it exists
    const inlineContainer = document.getElementById('inline-summarize-container');
    if (inlineContainer) inlineContainer.remove();

    let messageObj = { role: "user", content: text };

    if (pendingAttachment) {
      if (pendingAttachment.type === 'image') {
        messageObj.content = text ? text : 'What can you tell me about this image?';
        messageObj.files = [{ type: "image", url: pendingAttachment.imageUrl }];
      } else {
        const promptText = text ? text : 'Explain this snippet:';
        messageObj.content = `${promptText}\n\n"${pendingAttachment.text}"`;
      }
      
      pendingAttachment = null;
      document.getElementById('attachment-preview').classList.add('hidden');
      document.querySelector('.attachment-content').innerHTML = '';
    }

    // Add User Message to UI
    appendMessage('user', messageObj);
    chatMessages.push(messageObj);
    saveHistory();

    // Fetch AI Response
    await fetchAIResponse();
  }

  // 5. Append Message to UI
  function appendMessage(role, msg) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}-message`;

    const content = typeof msg === 'object' && msg !== null && !Array.isArray(msg) && msg.content !== undefined ? msg.content : msg;
    const files = typeof msg === 'object' && msg !== null && !Array.isArray(msg) && msg.files ? msg.files : [];

    if (role === 'ai') {
      msgDiv.innerHTML = `
        <div class="avatar"><img src="/assets/favicon-96x96.png" alt="Torcons"></div>
        <div class="bubble" style="line-height: 1.6;">${renderMarkdown(content)}</div>
      `;
    } else {
      msgDiv.innerHTML = `<div class="bubble">${renderUserContent(content, files)}</div>`;
    }

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return msgDiv;
  }

  function appendTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ai-message typing-indicator-wrapper`;
    msgDiv.id = 'typing-indicator';
    msgDiv.innerHTML = `
      <div class="avatar"><img src="/assets/favicon-96x96.png" alt="Torcons"></div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  async function getCurrentPageContext(targetUrlKey) {
    try {
      let targetTab = null;
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      
      if (targetUrlKey) {
        targetTab = allTabs.find(t => {
          const url = t.url ? t.url.split('#')[0] : 'unknown_page';
          return `history_${url}` === targetUrlKey;
        });
      }
      
      if (!targetTab) {
        targetTab = allTabs.find(t => t.active);
      }

      if (!targetTab || !targetTab.url || targetTab.url.startsWith('chrome://') || targetTab.url.startsWith('chrome-extension://')) return null;

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const article = document.querySelector('article') || document.querySelector('main');
          let text = (article || document.body).innerText || '';
          return text.replace(/\s+/g, ' ').trim();
        }
      });
      const pageContent = injectionResults[0]?.result;
      if (pageContent) {
        const truncatedContent = pageContent.substring(0, 8000);
        return `Title: ${targetTab.title}\nURL: ${targetTab.url}\n\nContent:\n${truncatedContent}`;
      }
    } catch (err) {
      console.warn("Could not extract page context", err);
    }
    return null;
  }

  // 6. Fetch AI Response
  async function fetchAIResponse() {
    const requestPageKey = currentPageKey;
    const requestMessages = [...chatMessages];
    
    window.activeStreams[requestPageKey] = { content: '', bubble: null };
    
    if (currentPageKey === requestPageKey) appendTypingIndicator();

    try {
      let apiMessages = requestMessages.map(msg => {
        if (msg.files && msg.files.length > 0) {
          const newContent = [{ type: 'text', text: msg.content }];
          msg.files.forEach(f => {
            if (f.type === 'image' && f.url) {
              newContent.push({ type: 'image_url', image_url: { url: f.url } });
            }
          });
          return { role: msg.role, content: newContent };
        }
        return { role: msg.role, content: msg.content };
      });
      const pageContext = await getCurrentPageContext(requestPageKey);
      const storedModel = await getStoredModel();
      const selectedModel = storedModel || DEFAULT_MODEL;

      if (pageContext && apiMessages.length > 0 && apiMessages[0].role === 'system') {
        apiMessages[0] = {
          ...apiMessages[0],
          content: `${apiMessages[0].content}\n\n--- CURRENT PAGE CONTEXT ---\n${pageContext}`
        };
      }

      // Sending request to the correct endpoint without /v1
      const response = await fetch('https://chat.torcons.ai/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          chrome.storage.local.remove(['token']);
          throw new Error("Authentication failed. Please sign in again.");
        }

        const errorBody = await response.text().catch(() => '');
        let errorMessage = errorBody;
        try {
          const errorData = JSON.parse(errorBody);
          errorMessage = errorData.error && errorData.error.message ? errorData.error.message : errorBody;
        } catch (e) {
          // Keep the raw response body as the fallback message.
        }

        throw new Error(`API Error: ${response.status}${errorMessage ? ` - ${errorMessage}` : ''}`);
      }

      if (currentPageKey === requestPageKey) removeTypingIndicator();

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let fullContent = '';
      
      if (currentPageKey === requestPageKey) {
        const msgDiv = appendMessage('ai', '');
        window.activeStreams[requestPageKey].bubble = msgDiv.querySelector('.bubble');
      }
      
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.choices && data.choices.length > 0) {
                  const delta = data.choices[0].delta;
                  if (delta && delta.content) {
                    fullContent += delta.content;
                    window.activeStreams[requestPageKey].content = fullContent;
                    
                    if (currentPageKey === requestPageKey && window.activeStreams[requestPageKey].bubble) {
                      const isNearBottom = chatHistory.scrollHeight - chatHistory.scrollTop - chatHistory.clientHeight < 50;
                      window.activeStreams[requestPageKey].bubble.innerHTML = renderMarkdown(fullContent);
                      if (isNearBottom) {
                        chatHistory.scrollTop = chatHistory.scrollHeight;
                      }
                    }
                  }
                }
              } catch (e) {
                // Ignore incomplete JSON chunks
              }
            }
          }
        }
      }

      chrome.storage.local.get([requestPageKey], (result) => {
        const history = result[requestPageKey] || [];
        history.push({ role: "assistant", content: fullContent });
        chrome.storage.local.set({ [requestPageKey]: history }, () => {
          delete window.activeStreams[requestPageKey];
          if (currentPageKey === requestPageKey) {
            chatMessages = history;
            if (document.getElementById('typing-indicator')) removeTypingIndicator();
          }
        });
      });

    } catch (error) {
      if (currentPageKey === requestPageKey) removeTypingIndicator();
      delete window.activeStreams[requestPageKey];
      console.error(error);

      if (error.message.startsWith('Authentication failed')) {
        // Show a rich auth-error card with step-by-step instructions
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai-message';
        msgDiv.innerHTML = `
          <div class="avatar"><img src="/assets/favicon-96x96.png" alt="Torcons"></div>
          <div class="bubble auth-error-card">
            <p class="auth-error-title">⚠️ Authentication Failed</p>
            <p class="auth-error-desc">Your session has expired or is invalid. Follow these steps to reconnect:</p>
          </div>
        `;
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
      } else {
        appendMessage('ai', `Oops, something went wrong: ${error.message}`);
      }

      // Remove the last user message from memory so it doesn't pollute the context
      chrome.storage.local.get([requestPageKey], (result) => {
        const history = result[requestPageKey] || [];
        history.pop();
        chrome.storage.local.set({ [requestPageKey]: history }, () => {
          if (currentPageKey === requestPageKey) chatMessages = history;
        });
      });
    }
  }

  // Context Menu Logic
  function requestPendingContextAsk() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab) return;
      chrome.runtime.sendMessage({ type: 'GET_PENDING_CONTEXT_ASK', tabId: activeTab.id }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ask) return;
        processPendingContextAsk(response.ask);
      });
    });
  }

  async function fetchImageAsBase64(url) {
    if (url.startsWith('data:image/')) return url;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_AS_BASE64', url }, (response) => {
        resolve(response && response.base64 ? response.base64 : url);
      });
    });
  }

  async function processPendingContextAsk(ask) {
    if (!ask) return;

    const normalizedAsk = typeof ask === 'string' ? { type: 'text', text: ask } : ask;
    if (normalizedAsk.type === 'error') {
      appendMessage('ai', normalizedAsk.message || 'Torcons could not process this image.');
      return;
    }

    pendingAttachment = normalizedAsk;
    
    const attachmentContainer = document.getElementById('attachment-preview');
    const attachmentContent = attachmentContainer.querySelector('.attachment-content');
    attachmentContainer.classList.remove('hidden');
    
    if (normalizedAsk.type === 'image') {
      attachmentContent.style.display = 'block';
      attachmentContent.innerHTML = `<span style="font-size: 12px; opacity: 0.7;">Loading image...</span>`;
      normalizedAsk.imageUrl = await fetchImageAsBase64(normalizedAsk.imageUrl);
      attachmentContent.innerHTML = `<img src="${normalizedAsk.imageUrl}" alt="Attached Image" style="display: block; max-height: 80px; max-width: 100%; border-radius: 6px; object-fit: contain;">`;
    } else {
      attachmentContent.style.display = '-webkit-box';
      attachmentContent.textContent = `"${normalizedAsk.text}"`;
    }
    
    sendBtn.disabled = false;
    chatInput.focus();

    // Remove inline summarize button if it exists
    const inlineContainer = document.getElementById('inline-summarize-container');
    if (inlineContainer) inlineContainer.remove();
  }

  // 7. Summarize Page Logic
  async function triggerSummarize() {
    const inlineContainer = document.getElementById('inline-summarize-container');
    if (inlineContainer) inlineContainer.remove();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab found");

      if (tab.url.startsWith('chrome://')) {
        throw new Error("Cannot summarize internal Chrome pages.");
      }

      const prompt = `Please summarize the current page concisely. Highlight the main points.`;

      appendMessage('user', `Summarize this page: ${tab.title}`);

      chatMessages.push({ role: "user", content: prompt });
      saveHistory();

      await fetchAIResponse();

    } catch (error) {
      console.error(error);
      appendMessage('ai', `Could not summarize page: ${error.message}`);
    }
  }

  function addInlineSummarizeButton() {
    const btnDiv = document.createElement('div');
    btnDiv.id = 'inline-summarize-container';
    btnDiv.style.textAlign = 'center';
    btnDiv.style.marginTop = '20px';
    btnDiv.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
        <span style="margin: 0 15px; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1.5px;">Quick Tools</span>
        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
      </div>
      <button id="inline-summarize-btn" class="btn secondary-btn" style="padding: 10px 20px; border-radius: 20px; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); cursor: pointer; color: rgba(255,255,255,0.8);">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        Summarize Current Page
      </button>
    `;
    chatHistory.appendChild(btnDiv);

    document.getElementById('inline-summarize-btn').addEventListener('click', triggerSummarize);
  }

  function renderMarkdown(str) {
    if (!str) return '';

    let html = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Code blocks
    html = html.replace(/```(?:[a-z0-9]*\n)?([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;overflow-x:auto;margin:8px 0;font-family:monospace;font-size:12px;"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:4px;font-family:monospace;font-size:13px;">$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Headings
    html = html.replace(/^#{3,} (.*$)/gim, '<h3 style="margin: 12px 0 6px 0; font-size: 15px;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="margin: 14px 0 8px 0; font-size: 16px;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="margin: 16px 0 10px 0; font-size: 18px;">$1</h1>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#818cf8; text-decoration:none;">$1</a>');
    // Lists
    html = html.replace(/^\s*[\-\*] (.*$)/gim, '<li style="margin-left: 20px;">$1</li>');
    html = html.replace(/^\s*\d+\. (.*$)/gim, '<li style="margin-left: 20px;">$1</li>');

    // Tables
    html = html.replace(/(?:^|\n)((?:\|[^\n]+\|\n?)+)/g, function(match, tableBlock) {
      const lines = tableBlock.trim().split('\n');
      if (lines.length < 2 || !lines[1].match(/^\|?\s*[-:]+[\s\-:|]*$/)) {
         return match;
      }
      let tableHtml = '<div style="overflow-x:auto;"><table style="border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px;">';
      let isHeader = true;
      for (let line of lines) {
        if (line.match(/^\|?\s*[-:]+[\s\-:|]*$/)) {
          isHeader = false;
          continue;
        }
        let rowHtml = '<tr>';
        const cells = line.trim().split('|');
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();
        for (let cell of cells) {
          const content = cell.trim();
          if (isHeader) {
            rowHtml += `<th style="border: 1px solid rgba(255,255,255,0.2); padding: 8px; background: rgba(0,0,0,0.2); text-align: left;">${content}</th>`;
          } else {
            rowHtml += `<td style="border: 1px solid rgba(255,255,255,0.2); padding: 8px;">${content}</td>`;
          }
        }
        rowHtml += '</tr>';
        tableHtml += rowHtml;
      }
      tableHtml += '</table></div>';
      return '\n' + tableHtml + '\n';
    });

    // Process newlines outside of pre blocks
    const parts = html.split(/(<pre[\s\S]*?<\/pre>)/);
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('<pre')) {
        parts[i] = parts[i].replace(/\n/g, '<br>');
        // Clean up redundant br tags around block elements
        parts[i] = parts[i].replace(/(<\/(?:li|h1|h2|h3|table|tr|td|th|div)>)<br>/g, '$1');
        parts[i] = parts[i].replace(/<br>(<(?:li|h1|h2|h3|table|tr|td|th|div)[^>]*>)/g, '$1');
      }
    }
    return parts.join('');
  }

  function renderUserContent(content, files = []) {
    let html = '';
    if (Array.isArray(content)) {
      html = content.map(part => {
        if (part.type === 'text') {
          return escapeHTML(part.text || '');
        }

        if (part.type === 'image_url' && part.image_url && part.image_url.url) {
          const imageUrl = escapeAttribute(part.image_url.url);
          return `<img class="message-image" src="${imageUrl}" alt="Selected image">`;
        }

        return '';
      }).join('');
    } else {
      html = escapeHTML(content || '');
    }

    if (files && files.length > 0) {
      files.forEach(file => {
        if (file.type === 'image' && file.url) {
          const imageUrl = escapeAttribute(file.url);
          html += `<br><img class="message-image" src="${imageUrl}" alt="Selected image">`;
        }
      });
    }

    return html;
  }

  // Utility to prevent XSS in simple strings
  function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML.replace(/\n/g, '<br>');
  }

  function escapeAttribute(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML.replace(/"/g, '&quot;');
  }

});
