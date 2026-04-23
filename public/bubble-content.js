(function() {
  if (document.getElementById('ai-super-app-bubble')) return;

  const bubble = document.createElement('div');
  bubble.id = 'ai-super-app-bubble';
  
  // Create styles for the bubble
  const style = document.createElement('style');
  style.textContent = `
    #ai-super-app-bubble {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
      cursor: pointer;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border: 3px solid white;
    }
    #ai-super-app-bubble:hover {
      transform: scale(1.1) rotate(5deg);
    }
    #ai-super-app-bubble svg {
      width: 28px;
      height: 28px;
    }
    #ai-super-app-iframe-container {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 400px;
      height: 600px;
      max-height: 85vh;
      max-width: 90vw;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 15px 50px rgba(0,0,0,0.25);
      z-index: 2147483646;
      background: white;
      display: none;
      border: 1px solid rgba(0,0,0,0.1);
      flex-direction: column;
      transform-origin: bottom right;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
    }
    #ai-super-app-iframe-container.visible {
      display: flex;
    }
    #ai-super-app-header {
      height: 40px;
      background: #4f46e5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: white;
      padding: 0 15px;
      cursor: grab;
      user-select: none;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: bold;
    }
    #ai-super-app-header:active {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);

  bubble.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 8V4H8"></path>
      <rect width="16" height="12" x="4" y="8" rx="2"></rect>
      <path d="M2 14h2"></path>
      <path d="M20 14h2"></path>
      <path d="M15 13v2"></path>
      <path d="M9 13v2"></path>
    </svg>
  `;

  // Create Iframe Container
  const container = document.createElement('div');
  container.id = 'ai-super-app-iframe-container';
  
  // Extension ID detection or Fallback to Shared URL
  const extensionUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL 
    ? chrome.runtime.getURL('index.html') 
    : window.location.origin;

  container.innerHTML = `
    <div id="ai-super-app-header">
      <span>AI Super App</span>
      <div style="display:flex; gap:10px;">
        <div id="ai-super-app-minimize" style="cursor:pointer; opacity:0.8;">—</div>
      </div>
    </div>
    <iframe src="${extensionUrl}" style="width:100%; height:calc(100% - 40px); border:none;"></iframe>
  `;

  // Drag and Drop Logic for Bubble
  let isDraggingBubble = false;
  let bubbleStartX, bubbleStartY;

  bubble.onmousedown = (e) => {
    isDraggingBubble = false;
    bubbleStartX = e.clientX;
    bubbleStartY = e.clientY;
    
    const onMouseMove = (moveEvent) => {
        if (Math.abs(moveEvent.clientX - bubbleStartX) > 5 || Math.abs(moveEvent.clientY - bubbleStartY) > 5) {
            isDraggingBubble = true;
            const x = window.innerWidth - moveEvent.clientX - 28;
            const y = window.innerHeight - moveEvent.clientY - 28;
            bubble.style.right = (x > 0 ? (x < window.innerWidth - 56 ? x : window.innerWidth - 56) : 0) + 'px';
            bubble.style.bottom = (y > 0 ? (y < window.innerHeight - 56 ? y : window.innerHeight - 56) : 0) + 'px';
        }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMouseMove);
    }, { once: true });
  };

  // Drag and Drop Logic for Container (Window)
  const header = container.querySelector('#ai-super-app-header');
  let isDraggingContainer = false;
  let containerStartX, containerStartY, initialRight, initialBottom;

  header.onmousedown = (e) => {
    isDraggingContainer = true;
    containerStartX = e.clientX;
    containerStartY = e.clientY;
    
    const rect = container.getBoundingClientRect();
    initialRight = window.innerWidth - rect.right;
    initialBottom = window.innerHeight - rect.bottom;

    const onMouseMove = (moveEvent) => {
      if (!isDraggingContainer) return;
      const deltaX = containerStartX - moveEvent.clientX;
      const deltaY = containerStartY - moveEvent.clientY;
      container.style.right = (initialRight + deltaX) + 'px';
      container.style.bottom = (initialBottom + deltaY) + 'px';
    };

    const onMouseUp = () => {
      isDraggingContainer = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  document.getElementById('ai-super-app-minimize')?.addEventListener('click', () => {
    container.classList.remove('visible');
  });

  bubble.onclick = (e) => {
    if (isDraggingBubble) return;
    const isVisible = container.classList.toggle('visible');
    
    if (isVisible) {
      const bubbleRect = bubble.getBoundingClientRect();
      const rightShift = window.innerWidth - bubbleRect.right;
      const bottomShift = window.innerHeight - bubbleRect.top + 10;
      
      container.style.right = rightShift + 'px';
      container.style.bottom = bottomShift + 'px';
    }
    
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'open_side_panel' });
        }
    } catch (err) {}
  };

  document.body.appendChild(container);
  document.body.appendChild(bubble);
})();
