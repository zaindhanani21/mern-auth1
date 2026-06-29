// 1. Sync token to Extension Storage
const syncToken = () => {
  const userData = localStorage.getItem("userData");
  if (userData) {
    try {
      const parsed = JSON.parse(userData);
      if (parsed && parsed.token) {
        chrome.storage.local.set({ userData: parsed });
      }
    } catch(e) {}
  }
};
syncToken();
window.addEventListener("storage", syncToken);

// 2. Listen for Checkout events on Merchant Store
window.addEventListener("WallexaPaymentRequest", (event) => {
  const { merchantMobile, amount, description } = event.detail;
  chrome.storage.local.set({
    pendingCheckout: { merchantMobile, amount, description }
  }, () => {
    // Notify the webpage that the checkout has been captured in storage
    window.dispatchEvent(new CustomEvent("WallexaPaymentCapturedEvent"));
  });
});

// 3. Listen for messages from Popup and forward to page
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "WallexaPaymentSuccess") {
    window.dispatchEvent(new CustomEvent("WallexaPaymentSuccessEvent", {
      detail: { amount: message.amount, description: message.description }
    }));
  } else if (message.type === "WallexaPaymentCancel") {
    window.dispatchEvent(new CustomEvent("WallexaPaymentCancelEvent"));
  } else if (message.type === "WallexaBalanceRefresh") {
    window.dispatchEvent(new CustomEvent("WallexaBalanceRefresh", {
      detail: {
        newBalance: message.newBalance,
        amount: message.amount,
      }
    }));
  }
});