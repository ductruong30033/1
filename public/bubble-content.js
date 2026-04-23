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
      max-height: 80vh;
      max-width: 90vw;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      z-index: 2147483646;
      background: white;
      display: none;
      border: 1px solid rgba(0,0,0,0.1);
      flex-direction: column;
      transform-origin: bottom right;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    #ai-super-app-iframe-container.visible {
      display: flex;
      animation: bubble-pop 0.3s ease-out;
    }
    @keyframes bubble-pop {
      from { transform: scale(0.5); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
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
    <iframe src="${extensionUrl}" style="width:100%; height:100%; border:none;"></iframe>
  `;

  // Drag and Drop Logic
  let isDragging = false;
  let startX, startY;

  bubble.onmousedown = (e) => {
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
    
    const onMouseMove = (moveEvent) => {
      if (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5) {
        isDragging = true;
        const x = window.innerWidth - moveEvent.clientX - 28;
        const y = window.innerHeight - moveEvent.clientY - 28;
        bubble.style.right = (x > 0 ? x : 0) + 'px';
        bubble.style.bottom = (y > 0 ? y : 0) + 'px';
        
        // Move container too if visible
        container.style.right = bubble.style.right;
        container.style.bottom = (parseInt(bubble.style.bottom) + 70) + 'px';
      }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMouseMove);
    }, { once: true });
  };

  bubble.onclick = (e) => {
    if (isDragging) return;
    
    // Toggle Iframe UI
    const isVisible = container.classList.toggle('visible');
    
    // Also try to open the Side Panel as a sync action (best for Chrome)
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'open_side_panel' });
        }
    } catch (err) {}
  };

  document.body.appendChild(container);
  document.body.appendChild(bubble);
})();
