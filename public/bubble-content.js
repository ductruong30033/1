(function() {
  // Tránh tạo nhiều bong bóng nếu script chạy lại
  if (document.getElementById('ai-super-app-bubble')) return;

  const bubble = document.createElement('div');
  bubble.id = 'ai-super-app-bubble';
  
  // Style cho bong bóng
  Object.assign(bubble.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: '#6366f1',
    boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
    cursor: 'pointer',
    zIndex: '999999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.3s',
    userSelect: 'none'
  });

  // Icon Bot đơn giản bằng SVG
  bubble.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 8V4H8"></path>
      <rect width="16" height="12" x="4" y="8" rx="2"></rect>
      <path d="M2 14h2"></path>
      <path d="M20 14h2"></path>
      <path d="M15 13v2"></path>
      <path d="M9 13v2"></path>
    </svg>
  `;

  // Hiệu ứng hover
  bubble.onmouseenter = () => {
    bubble.style.transform = 'scale(1.1) rotate(5deg)';
    bubble.style.backgroundColor = '#4f46e5';
  };
  bubble.onmouseleave = () => {
    bubble.style.transform = 'scale(1) rotate(0deg)';
    bubble.style.backgroundColor = '#6366f1';
  };

  // Xử lý kéo thả (Drag and drop)
  let isDragging = false;
  let startX, startY, initialRight, initialBottom;

  bubble.onmousedown = (e) => {
    isDragging = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = bubble.getBoundingClientRect();
    initialRight = window.innerWidth - rect.right;
    initialBottom = window.innerHeight - rect.bottom;
    
    document.onmousemove = (e) => {
      isDragging = true;
      const deltaX = startX - e.clientX;
      const deltaY = startY - e.clientY;
      bubble.style.right = (initialRight + deltaX) + 'px';
      bubble.style.bottom = (initialBottom + deltaY) + 'px';
    };
    
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
    };
  };

  // Khi click vào sản phẩm
  bubble.onclick = () => {
    if (isDragging) return;
    
    // Gửi message tới background để mở Side Panel
    // Lưu ý: chrome.sidePanel.open yêu cầu một user gesture và API này từ content script thường bị giới hạn.
    // Cách tốt nhất là gửi yêu cầu tới background script.
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'open_side_panel' });
        }
    } catch (e) {
        console.log('Chưa kết nối được với extension background.');
    }
  };

  document.body.appendChild(bubble);
})();
