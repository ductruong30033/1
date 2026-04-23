// Background script xử lý mở Side Panel khi nhận yêu cầu từ bong bóng nổi
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'open_side_panel') {
    // Mở side panel cho tab hiện tại
    if (sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id });
    }
  }
});

// Cho phép mở side panel khi click vào icon extension
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
