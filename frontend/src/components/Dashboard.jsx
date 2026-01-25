import React, { useState, useEffect, useCallback } from "react";
import "./Css/Dashboard.css";
const Header = ({ user, handleLogout }) => {
  const userInitials = (
    (user?.firstName?.charAt(0) || "") + (user?.lastName?.charAt(0) || "")
  ).toUpperCase();

  return (
    <div className="dashboard-header">
      {/* 🟢 Rendered FIRST: Appears on the LEFT */}
      <div className="user-greeting-left">
        <h2>Hello, {user?.firstName || "User"}</h2>
      </div>

      {/* 🟢 Rendered SECOND: Appears on the RIGHT */}
      <div className="header-right-profile">
        <div className="user-initials">{userInitials || "WA"}</div>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </div>
    </div>
  );
};
export default function Dashboard({ userData, onLogout }) {
  const storedData = JSON.parse(localStorage.getItem("user") || "{}");
  const initialData =
    userData && Object.keys(userData).length > 0 ? userData : storedData;

  const user = initialData.user ? initialData.user : initialData;
  const userId = user._id || user.id;

  // --- CORE APPLICATION STATES ---
  const [currentBalance, setCurrentBalance] = useState(user.balance || 0);
  const [showBalance, setShowBalance] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddMoney, setShowAddMoney] = useState(false);

  // 🛡️ SECURITY STATES
  const [isFrozen, setIsFrozen] = useState(user.isFrozen || false);
  const [showOtpField, setShowOtpField] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // 💳 TRANSACTION STATES
  const [addMoneyData, setAddMoneyData] = useState({
    cardNumber: "",
    expiryDate: "",
    cvc: "",
    amount: "",
  });

  const [addMoneyMessage, setAddMoneyMessage] = useState({
    text: "",
    type: "",
  });
  const [recipientMobile, setRecipientMobile] = useState("");
  const [amount, setAmount] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [transferMessage, setTransferMessage] = useState({
    text: "",
    type: "",
  });

  const getToken = () => localStorage.getItem("userToken");

  const fetchBalance = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(
        `http://localhost:5000/api/transactions/balance/${userId}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) setCurrentBalance(data.balance);
    } catch (error) {
      console.error("Balance refresh failed:", error);
    }
  }, [userId]);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(
        `http://localhost:5000/api/transactions/history/${userId}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) setTransactions(data);
    } catch (error) {
      console.error("History fetch failed:", error);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchBalance();
      fetchHistory();
    }
  }, [userId, fetchBalance, fetchHistory]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let cleanValue = value;

    if (name === "cardNumber" || name === "cvc") {
      cleanValue = value.replace(/\D/g, "");
      const maxLength = name === "cardNumber" ? 16 : 3;
      if (cleanValue.length > maxLength) return;
    }

    if (name === "amount") {
      cleanValue = value.replace(/[^0-9]/g, "");
    }

    if (name === "expiryDate") {
      cleanValue = value.replace(/\D/g, "");
      if (cleanValue.length > 2) {
        cleanValue = cleanValue.slice(0, 2) + "/" + cleanValue.slice(2, 4);
      }
      if (cleanValue.length > 5) return;
    }

    setAddMoneyData((prev) => ({ ...prev, [name]: cleanValue }));
  };

  const handleToggleFreeze = async () => {
    setShowOtpField(true);
    setIsProcessing(true);
    try {
      const res = await fetch(
        "http://localhost:5000/api/auth/send-freeze-otp",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      if (!res.ok) setShowOtpField(false);
    } catch (error) {
      setShowOtpField(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmFreezeOTP = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(
        "http://localhost:5000/api/auth/verify-freeze-otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ otp: otpInput }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setIsFrozen(data.isFrozen);
        setShowOtpField(false);
        setOtpInput("");
      }
    } finally {
      setIsProcessing(false);
    }
  };
  const handleAddMoney = async (e) => {
    e.preventDefault();

    // 🛡️ FORM FORMAT VALIDATION
    const { cardNumber, cvc, expiryDate, amount } = addMoneyData;

    if (cardNumber.length !== 16) {
      setAddMoneyMessage({
        text: "Error: Card number must be 16 digits.",
        type: "error",
      });
      return; // 🛑 Stops execution
    }

    if (cvc.length !== 3) {
      setAddMoneyMessage({
        text: "Error: CVC must be 3 digits.",
        type: "error",
      });
      return; // 🛑 Stops execution
    }

    if (expiryDate.length !== 5) {
      setAddMoneyMessage({
        text: "Error: Expiry must be in MM/YY format.",
        type: "error",
      });
      return; // 🛑 Stops execution
    }

    if (!amount || Number(amount) < 1) {
      setAddMoneyMessage({
        text: "Invalid amount: Minimum deposit is 1 PKR.",
        type: "error",
      });
      return; // 🛑 Stops execution
    }

    // 🟢 Formatting looks good, now let the Backend check if the account exists
    setAddMoneyMessage({ text: "", type: "" });
    if (isFrozen) return;
    setIsProcessing(true);

    try {
      const res = await fetch(
        "http://localhost:5000/api/transactions/add-money",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            userId,
            ...addMoneyData,
            amount: Number(addMoneyData.amount),
          }),
        },
      );

      const data = await res.json();

      if (res.ok) {
        setAddMoneyMessage({
          text: "Funds added successfully!",
          type: "success",
        });
        setCurrentBalance(data.newBalance);
        setAddMoneyData({
          cardNumber: "",
          expiryDate: "",
          cvc: "",
          amount: "",
        });
        fetchHistory();
      } else {
        // 🟢 If the card doesn't exist or details are wrong, show the backend's reason
        setAddMoneyMessage({
          text: data.message || "Deposit failed",
          type: "error",
        });
      }
    } catch (error) {
      setAddMoneyMessage({ text: "Server connection failed.", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };
  const handleSendMoney = async (e) => {
    e.preventDefault();

    // 🟢 RESTORED LOGIC: Block submission if amount is empty or invalid
    if (!amount || Number(amount) <= 0) {
      setTransferMessage({
        text: "Please enter a valid amount to continue.",
        type: "error",
      });
      return; // 🛑 Stops the function here so no request is sent
    }

    if (recipientMobile.length !== 11) {
      setTransferMessage({
        text: "Error: Mobile number must be 11 digits.",
        type: "error",
      });
      return;
    }

    // 🟢 Reset message at the start so the user sees a fresh attempt
    setTransferMessage({ text: "", type: "" });
    setIsProcessing(true);

    try {
      const res = await fetch(
        "http://localhost:5000/api/transactions/send-money",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            senderId: userId,
            recipientMobile,
            amount: Number(amount),
          }),
        },
      );

      const data = await res.json(); // 🟢 Parse JSON to catch error messages from backend

      if (res.ok) {
        setTransferMessage({
          text: `Sent PKR ${amount} successfully!`,
          type: "success",
        });
        setRecipientMobile("");
        setAmount("");
        fetchBalance();
        fetchHistory(); // 🟢 Refresh history to show the new transaction
      } else {
        // 🟢 Set the error message from the backend (e.g., "Insufficient balance")
        setTransferMessage({
          text: data.message || "Transfer failed",
          type: "error",
        });
      }
    } catch (error) {
      setTransferMessage({
        text: "Network error. Check connection.",
        type: "error",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  const handleLogout = () => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("user");
    onLogout();
  };

  return (
    <div className="dashboard-layout">
      <div className="dashboard-container">
        <Header user={user} handleLogout={handleLogout} />

        <div className="main-actions-row">
          {/* 1. BALANCE */}
          <div className="action-card">
            <button
              className="action-toggle-btn"
              onClick={() => setShowBalance(!showBalance)}
            >
              {showBalance ? "Hide Balance" : "Check Balance"}
            </button>
            {showBalance && (
              <div className="display-area">
                <p className="label">Current Balance</p>
                {isFrozen ? (
                  <h2 className="amount-text">[DATA LOCKED]</h2>
                ) : (
                  <h2 className="amount-text">
                    PKR {currentBalance.toLocaleString()}
                  </h2>
                )}
              </div>
            )}
          </div>

          {/* 2. ADD MONEY */}
          <div className="action-card">
            <button
              className="action-toggle-btn"
              onClick={() => setShowAddMoney(!showAddMoney)}
            >
              {showAddMoney ? "Close Deposit" : "Add Money"}
            </button>
            {showAddMoney && (
              <div className="display-area">
                <form onSubmit={handleAddMoney} className="transfer-form">
                  <input
                    name="cardNumber"
                    placeholder="16-digit Card"
                    value={addMoneyData.cardNumber}
                    onChange={handleInputChange}
                    required
                    disabled={isFrozen}
                  />
                  <div className="input-row">
                    <input
                      name="expiryDate"
                      placeholder="MM/YY"
                      value={addMoneyData.expiryDate}
                      required
                      onChange={handleInputChange}
                      disabled={isFrozen}
                    />
                    <input
                      name="cvc"
                      type="password"
                      placeholder="CVC"
                      value={addMoneyData.cvc}
                      required
                      onChange={handleInputChange}
                      disabled={isFrozen}
                    />
                  </div>
                  <input
                    name="amount"
                    placeholder="Amount (PKR)"
                    value={addMoneyData.amount}
                    onChange={handleInputChange}
                    required
                    min="1"
                    disabled={isFrozen}
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isProcessing || isFrozen}
                  >
                    {isProcessing
                      ? "Processing..."
                      : isFrozen
                        ? "Wallet Locked"
                        : "Add money to Wallexa"}
                  </button>
                </form>

                {/* 🟢 THE FIX: Add this block to show success/error messages */}
                {addMoneyMessage.text && (
                  <p
                    className={`status-message ${addMoneyMessage.type}`}
                    style={{
                      marginTop: "12px",
                      textAlign: "center",
                      fontWeight: "700",
                      color:
                        addMoneyMessage.type === "success"
                          ? "#10b981"
                          : "#ef4444",
                    }}
                  >
                    {addMoneyMessage.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 3. SEND MONEY */}
          <div className="action-card">
            <button
              className="action-toggle-btn"
              onClick={() => setShowTransferForm(!showTransferForm)}
            >
              {showTransferForm ? "Close Transfer" : "Send Money"}
            </button>
            {showTransferForm && (
              <div className="display-area">
                <form onSubmit={handleSendMoney} className="transfer-form">
                  <input
                    placeholder="Recipient Mobile"
                    value={recipientMobile}
                    onChange={(e) =>
                      setRecipientMobile(
                        e.target.value.replace(/\D/g, "").slice(0, 11),
                      )
                    }
                    required
                    disabled={isFrozen}
                  />
                  <input
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/\D/g, ""))
                    }
                    required
                    disabled={isFrozen}
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isProcessing || isFrozen}
                  >
                    {isProcessing
                      ? "Processing..."
                      : isFrozen
                        ? "Wallet Locked"
                        : "Send Money "}
                  </button>
                </form>

                {/* 🟢 THE FIX: Add this block to show the status messages */}
                {transferMessage.text && (
                  <p
                    className={`status-message ${transferMessage.type}`}
                    style={{
                      marginTop: "12px",
                      textAlign: "center",
                      fontWeight: "700",
                      color:
                        transferMessage.type === "success"
                          ? "#10b981"
                          : "#ef4444",
                    }}
                  >
                    {transferMessage.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 4. FREEZE SECURITY */}
          <div className="action-card">
            {!showOtpField ? (
              <button
                onClick={handleToggleFreeze}
                className="action-toggle-btn"
                disabled={isProcessing}
              >
                {isFrozen ? "🔓 Unfreeze Wallet" : "❄️ Freeze Wallet"}
              </button>
            ) : (
              <div className="otp-verification-area">
                <input
                  type="text"
                  placeholder="6-digit OTP"
                  value={otpInput}
                  onChange={(e) =>
                    setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="otp-input-field"
                />
                <div className="button-group">
                  <button
                    onClick={confirmFreezeOTP}
                    disabled={otpInput.length !== 6 || isProcessing}
                  >
                    Verify
                  </button>
                  <button onClick={() => setShowOtpField(false)}>Cancel</button>
                </div>
              </div>
            )}
            {isFrozen && !showOtpField && (
              <p style={{ color: "red", marginTop: "10px" }}>
                ⚠️ WALLET LOCKED
              </p>
            )}
          </div>

          {/* 5. HISTORY */}
          {/* 5. HISTORY */}
<div className="action-card">
  <button className="action-toggle-btn" onClick={() => setShowHistory(!showHistory)}>
    {showHistory ? "Close History" : "Transaction History"}
  </button>
  
  {showHistory && (
    <div className="display-area">
      {isFrozen ? (
        <div className="security-lock-notice">
          <p>⚠️ HISTORY HIDDEN</p>
        </div>
      ) : (
        <div className="tx-list">
          {transactions.length === 0 ? (
            <p className="no-tx-text">No transactions yet.</p>
          ) : (
            transactions.map((tx) => {
              const isSender = tx.sender?._id === userId;
              const isExpanded = expandedId === tx._id;
              const isBank = tx.sender === null || tx.description?.includes("|");

              return (
                <div 
                  key={tx._id} 
                  className={`tx-item ${isSender ? "debit" : "credit"} ${isExpanded ? "active" : ""}`}
                  onClick={() => setExpandedId(isExpanded ? null : tx._id)}
                >
                  {/* --- Simple Summary Row --- */}
                  <div className="tx-header-row">
                    <p className="tx-title">
                      {isSender 
                        ? `To: ${tx.recipient?.firstName || "Unknown"}` 
                        : `From: ${isBank ? tx.description.split("|")[0] : tx.sender?.firstName || "Unknown"}`}
                    </p>
                    <p className={`amount-value ${isSender ? "debit" : "credit"}`}>
                      {isSender ? "-" : "+"} PKR {tx.amount.toLocaleString()}
                    </p>
                  </div>

                  {/* --- Expanded Details Section --- */}
                  {isExpanded && (
                    <div className="tx-details">
                      <p><strong>Transaction ID:</strong> <span className="tx-id-value">{tx._id}</span></p>
                      <p><strong>Date & Time:</strong> {new Date(tx.createdAt).toLocaleString()}</p>
                      
                      {isBank ? (
                        <>
                          <p><strong>Bank:</strong> {tx.description.split("|")[0]}</p>
                          <p><strong>Method:</strong> Card ending in {tx.description.split("|")[1]?.slice(-4) || "****"}</p>
                        </>
                      ) : (
                        <>
                          <p><strong>Sender:</strong> {tx.sender?.firstName} ({tx.sender?.mobileNumber || "N/A"})</p>
                          <p><strong>Recipient:</strong> {tx.recipient?.firstName} ({tx.recipient?.mobileNumber || "N/A"})</p>
                        </>
                      )}
                      <p><strong>Status:</strong> <span className="status-badge">Completed</span></p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  )}
</div>
        </div>
      </div>
    </div>
  );
}
