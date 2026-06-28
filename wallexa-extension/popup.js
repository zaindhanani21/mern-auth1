document.addEventListener("DOMContentLoaded", async () => {
  const userEmailEl = document.getElementById("user-email");
  const merchantDescEl = document.getElementById("merchant-desc");
  const merchantOwnerNameEl = document.getElementById("merchant-owner-name");
  const checkoutAmountEl = document.getElementById("checkout-amount");
  const payBtn = document.getElementById("pay-btn");
  const cancelBtn = document.getElementById("cancel-btn");
  const statusMsg = document.getElementById("status-msg");
  const otpContainer = document.getElementById("otp-container");
  const otpCodeInput = document.getElementById("otp-code");

  let token = null;
  let checkoutData = null;

  // Helper to render checkout details
  const renderCheckout = async (data) => {
    if (data) {
      checkoutData = data;
      merchantDescEl.textContent = `${checkoutData.description}`;
      checkoutAmountEl.textContent = `PKR ${Number(checkoutData.amount).toLocaleString()}`;
      document.getElementById("checkout-card").style.display = "block";
      cancelBtn.style.display = "block";
      payBtn.disabled = false;

      // Fetch Merchant Owner Name dynamically by mobile number from backend DB
      if (token && checkoutData.merchantMobile) {
        try {
          const res = await fetch(`http://192.168.43.54:5000/api/profile/mobile/${checkoutData.merchantMobile}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const merchantInfo = await res.json();
            // Show first name (and last name if available)
            merchantOwnerNameEl.textContent = merchantInfo.firstName;
          } else {
            merchantOwnerNameEl.textContent = "Unknown";
          }
        } catch (e) {
          merchantOwnerNameEl.textContent = "Unknown";
        }
      } else {
        merchantOwnerNameEl.textContent = "Loading...";
      }

      // Restore OTP requested state if present (persists even if popup closes!)
      if (checkoutData.otpRequested) {
        otpContainer.style.display = "block";
        statusMsg.textContent = "OTP has been sent to your email. Please enter it to authorize.";
        statusMsg.style.color = "#4f46e5";
        payBtn.textContent = "Confirm Payment";
      } else {
        otpContainer.style.display = "none";
        payBtn.textContent = "Pay Now";
      }
    } else {
      checkoutData = null;
      merchantDescEl.textContent = "No active checkout request.";
      checkoutAmountEl.textContent = "PKR 0";
      merchantOwnerNameEl.textContent = "Loading...";
      document.getElementById("checkout-card").style.display = "none";
      cancelBtn.style.display = "none";
      otpContainer.style.display = "none";
      otpCodeInput.value = "";
      payBtn.disabled = true;
      payBtn.textContent = "Pay Now";
    }
  };

  // 1. Load User Session & Current Balance
  chrome.storage.local.get(["userData", "pendingCheckout"], async (data) => {
    if (!data.userData) {
      userEmailEl.textContent = "Please log in on http://192.168.43.54:5173 first.";
      userEmailEl.style.color = "#ef4444";
      return;
    }

    const session = data.userData;
    token = session.token;
    const userInfo = session.user || session;
    userEmailEl.textContent = userInfo.lastName 
      ? `${userInfo.firstName} ${userInfo.lastName} (${userInfo.email})` 
      : `${userInfo.firstName} (${userInfo.email})`;

    // Fetch live balance and validate
    try {
      const res = await fetch("http://192.168.43.54:5000/api/wallet/dashboard", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const dashboardData = await res.json();
        
        if (dashboardData.isFrozen) {
          statusMsg.textContent = "Your wallet is Frozen. Payments disabled.";
          payBtn.disabled = true;
          return;
        }

        // Secure client-side check: compare balance with checkout amount
        if (checkoutData && dashboardData.balance < Number(checkoutData.amount)) {
          statusMsg.textContent = "Insufficient Wallet Balance.";
          statusMsg.style.color = "#ef4444";
          payBtn.disabled = true;
          return;
        }
      }
    } catch (e) {
      // Quietly handle errors in background
    }

    // Load checkout details
    renderCheckout(data.pendingCheckout);
  });

  // 2. Real-time update if user changes selected item on page
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.pendingCheckout) {
      const oldVal = changes.pendingCheckout.oldValue;
      const newVal = changes.pendingCheckout.newValue;
      
      // If the description or amount changed (meaning it's a new item), clear status message
      if (!oldVal || !newVal || oldVal.description !== newVal.description || oldVal.amount !== newVal.amount) {
        statusMsg.textContent = "";
      }
      
      renderCheckout(newVal);
    }
  });

  // 3. Handle Pay Now Button Click
  payBtn.addEventListener("click", async () => {
    if (!token || !checkoutData) return;

    statusMsg.textContent = "";
    payBtn.disabled = true;
    const currentBtnText = payBtn.textContent;
    payBtn.textContent = "Processing...";

    const otpVal = otpCodeInput.value || null;

    try {
      const res = await fetch("http://192.168.43.54:5000/api/wallet/extension-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          merchantMobile: checkoutData.merchantMobile,
          amount: Number(checkoutData.amount),
          description: checkoutData.description,
          otp: otpVal
        })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.requiresOtp) {
          // Save the otpRequested flag to storage so it persists if the popup closes!
          chrome.storage.local.set({
            pendingCheckout: { ...checkoutData, otpRequested: true }
          }, () => {
            otpContainer.style.display = "block";
            statusMsg.textContent = "OTP has been sent to your email. Please enter it to authorize.";
            statusMsg.style.color = "#4f46e5";
            payBtn.disabled = false;
            payBtn.textContent = "Confirm Payment";
          });
        } else {
          // Send success message to webpage tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "WallexaPaymentSuccess",
                amount: Number(checkoutData.amount),
                description: checkoutData.description
              });
            }
          });

          // Clear pending checkout on success
          chrome.storage.local.remove("pendingCheckout", () => {
            document.body.innerHTML = `
              <div class="container" style="padding: 30px 10px;">
                <span style="font-size: 50px;">✅</span>
                <div class="success">Payment Successful!</div>
                <p style="color: #64748b; font-size: 0.85rem; text-align: center;">PKR ${Number(checkoutData.amount).toLocaleString()} paid to merchant.</p>
                <button onclick="window.close()" class="btn btn-secondary">Close</button>
              </div>
            `;
          });
        }
      } else {
        statusMsg.textContent = data.message || "Payment failed.";
        statusMsg.style.color = "#ef4444";
        payBtn.disabled = false;
        payBtn.textContent = currentBtnText === "Confirm Payment" ? "Confirm Payment" : "Pay Now";
      }
    } catch (e) {
      statusMsg.textContent = "Connection error. Backend is offline.";
      statusMsg.style.color = "#ef4444";
      payBtn.disabled = false;
      payBtn.textContent = currentBtnText === "Confirm Payment" ? "Confirm Payment" : "Pay Now";
    }
  });

  // 4. Handle Cancel Button Click
  cancelBtn.addEventListener("click", () => {
    // Send cancel message to webpage tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "WallexaPaymentCancel" });
      }
    });

    // Clear pending checkout
    chrome.storage.local.remove("pendingCheckout", () => {
      window.close(); // Close extension popup
    });
  });
});