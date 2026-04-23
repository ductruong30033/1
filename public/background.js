// Background script xử lý mở Side Panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'open_side_panel') {
    // Mở side panel cho tab mà người dùng đang đứng
    if (sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .catch((err) => console.error("Lỗi khi mở Side Panel:", err));
    } else {
      // Trường hợp dự phòng nếu không lấy được tabId từ người gửi
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.sidePanel.open({ tabId: tabs[0].id })
            .catch((err) => console.error("Lỗi khi mở Side Panel dự phòng:", err));
        }
      });
    }
  }
});

// Cấu hình để khi click vào icon Extension trên thanh công cụ cũng mở Side Panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
