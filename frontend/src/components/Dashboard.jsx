import React, { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { QRCodeSVG } from 'qrcode.react';
import { Home, Send, PlusCircle, History, Shield, LogOut, Bell, Menu, User, X, Clock, Check, Receipt, QrCode, Users } from 'lucide-react';
import "./Css/ModernDashboard.css";

const SOCKET_URL = "http://localhost:5000";

export default function Dashboard({ userData, onLogout }) {
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // home, send, add, history, profile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // User Data
  const storedData = JSON.parse(localStorage.getItem("user") || "{}");
  const initialData = userData && Object.keys(userData).length > 0 ? userData : storedData;
  const user = initialData.user ? initialData.user : initialData;
  const userId = user._id || user.id;

  // Dashboard Data State
  const [balance, setBalance] = useState(0);
  const [isFrozen, setIsFrozen] = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Profile State
  const [profile, setProfile] = useState(null);
  const [profilePicture, setProfilePicture] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});

  // Transaction Detail Modal
  const [selectedTx, setSelectedTx] = useState(null);
  const [showTxDetail, setShowTxDetail] = useState(false);

  // Forms
  const [sendForm, setSendForm] = useState({ recipient: '', amount: '', note: '' });
  const [addForm, setAddForm] = useState({ amount: '', method: 'card', cardNumber: '', expiry: '', cvc: '' });
  const [otp, setOtp] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);

  // New Features State
  const [billForm, setBillForm] = useState({ provider: 'K-Electric', consumerNumber: '', amount: '', type: 'Electricity' });
  const [splitForm, setSplitForm] = useState({ description: '', totalAmount: '', friends: [{ mobileNumber: '', amount: '' }] });
  const [splits, setSplits] = useState([]);

  // --- INITIALIZATION ---
  const getToken = () => localStorage.getItem("userToken");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:5000/api/wallet/dashboard", {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance);
        setIsFrozen(data.isFrozen);
        setTxHistory(data.history);
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:5000/api/wallet/notifications", {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:5000/api/profile", {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
        setProfilePicture(data.profilePicture);
        setProfileForm({
          firstName: data.firstName,
          midName: data.midName || '',
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
          nationality: data.nationality
        });
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchSplits = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch("http://localhost:5000/api/wallet/get-splits", {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSplits(data.requests || []);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchData();
    fetchNotifications();
    fetchProfile();
    fetchSplits();

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      if (userId) newSocket.emit("join_user_room", userId);
    });

    newSocket.on("notification", (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);
      setToast({ title: notif.title, msg: notif.message, type: 'info' });
      setTimeout(() => setToast(null), 5000);
      fetchData();
      fetchSplits();
    });

    return () => newSocket.close();
  }, [userId, fetchData, fetchNotifications, fetchProfile]);

  // --- NOTIFICATION ACTIONS ---
  const markAsRead = async (notificationId) => {
    try {
      await fetch("http://localhost:5000/api/wallet/mark-notification-read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ notificationId })
      });
      fetchNotifications();
    } catch (e) { console.error(e); }
  };

  const markAllAsRead = () => markAsRead('all');

  // --- TRANSACTION ACTIONS ---
  const handleSend = async (e) => {
    e.preventDefault();
    if (isFrozen) return setToast({ title: "Error", msg: "Wallet is Frozen", type: "error" });
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/wallet/send-money", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ recipientMobile: sendForm.recipient, amount: Number(sendForm.amount) })
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Money Sent!", type: "success" });
        setSendForm({ recipient: '', amount: '', note: '' });
        fetchData();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
    finally { setLoading(false); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (isFrozen) return setToast({ title: "Error", msg: "Wallet is Frozen", type: "error" });
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/wallet/add-money", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          amount: Number(addForm.amount),
          cardNumber: addForm.cardNumber,
          expiryDate: addForm.expiry,
          cvc: addForm.cvc
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Funds Added!", type: "success" });
        setAddForm({ amount: '', method: 'card', cardNumber: '', expiry: '', cvc: '' });
        fetchData();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
    finally { setLoading(false); }
  };

  const requestFreeze = async () => {
    try {
      await fetch("http://localhost:5000/api/auth/send-freeze-otp", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
      setShowOtpModal(true);
    } catch { setToast({ title: "Error", msg: "Could not send OTP", type: "error" }); }
  };

  const confirmFreeze = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/wallet/verify-freeze-otp", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ otp })
      });
      const data = await res.json();
      if (res.ok) {
        setIsFrozen(data.isFrozen);
        setShowOtpModal(false);
        setOtp("");
        setToast({ title: "Success", msg: data.message, type: "success" });
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
  };

  // --- PROFILE ACTIONS ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Profile updated!", type: "success" });
        setIsEditingProfile(false);
        fetchProfile();
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
    finally { setLoading(false); }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return setToast({ title: "Error", msg: "Image too large (max 2MB)", type: "error" });
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      try {
        const res = await fetch("http://localhost:5000/api/profile/upload-picture", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ profilePicture: base64 })
        });
        const data = await res.json();
        if (res.ok) {
          setProfilePicture(data.profilePicture);
          setToast({ title: "Success", msg: "Profile picture updated!", type: "success" });
        } else {
          setToast({ title: "Error", msg: data.message, type: "error" });
        }
      } catch { setToast({ title: "Error", msg: "Upload failed", type: "error" }); }
    };
    reader.readAsDataURL(file);
  };

  // --- NEW FEATURE ACTIONS ---
  const handlePayBill = async (e) => {
    e.preventDefault();
    if (isFrozen) return setToast({ title: "Error", msg: "Wallet is Frozen", type: "error" });
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/wallet/pay-bill", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(billForm)
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Bill Paid Successfully!", type: "success" });
        setBillForm({ provider: 'K-Electric', consumerNumber: '', amount: '', type: 'Electricity' });
        fetchData();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
    finally { setLoading(false); }
  };

  const handleFetchBillAmount = () => {
     // Mock fetch bill
     if (!billForm.consumerNumber) {
        return setToast({ title: "Error", msg: "Enter consumer number first", type: "error" });
     }
     const mockAmount = Math.floor(Math.random() * 5000) + 500;
     setBillForm(prev => ({...prev, amount: mockAmount.toString()}));
     setToast({ title: "Info", msg: "Bill details fetched", type: "info" });
  };

  const handleRequestSplit = async (e) => {
    e.preventDefault();
    if (!splitForm.description || !splitForm.totalAmount) {
       return setToast({ title: "Error", msg: "Enter description and total amount", type: "error" });
    }
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/wallet/request-split", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(splitForm)
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Split Request Sent!", type: "success" });
        setSplitForm({ description: '', totalAmount: '', friends: [{ mobileNumber: '', amount: '' }] });
        fetchSplits();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
    finally { setLoading(false); }
  };

  const handleAcceptSplit = async (splitId) => {
    if (isFrozen) return setToast({ title: "Error", msg: "Wallet is Frozen", type: "error" });
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/wallet/accept-split", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ splitId })
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Split Paid Successfully!", type: "success" });
        fetchData();
        fetchSplits();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch { setToast({ title: "Error", msg: "Network error", type: "error" }); }
    finally { setLoading(false); }
  };

  // --- HELPER FUNCTIONS ---
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatTimeOnly = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // --- RENDERERS ---
  const renderHome = () => (
    <div className="view-container">
      <div className="balance-card">
        <span className="balance-label">Total Balance</span>
        <h2 className="balance-amount">
          {isFrozen ? "❄️ FROZEN" : (showBalance ? `PKR ${balance.toLocaleString()}` : "****")}
        </h2>
        <button onClick={() => setShowBalance(!showBalance)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer' }}>
          {showBalance ? "Hide" : "Show"} Balance
        </button>
      </div>

      <div className="quick-actions-grid">
        <div className="action-tile" onClick={() => setActiveTab('send')}>
          <div className="tile-icon"><Send size={24} /></div>
          <span>Send Money</span>
        </div>
        <div className="action-tile" onClick={() => setActiveTab('add')}>
          <div className="tile-icon"><PlusCircle size={24} /></div>
          <span>Add Money</span>
        </div>
        <div className="action-tile" onClick={() => setActiveTab('history')}>
          <div className="tile-icon"><History size={24} /></div>
          <span>History</span>
        </div>
      </div>
    </div>
  );

  const renderSend = () => (
    <div className="view-container">
      <h2 className="page-title">Send Money</h2>
      <form className="mt-4" onSubmit={handleSend}>
        <div className="form-group">
          <label className="form-label">Recipient Mobile</label>
          <input className="form-input" placeholder="03001234567" value={sendForm.recipient} onChange={e => setSendForm({ ...sendForm, recipient: e.target.value })} required disabled={isFrozen} />
        </div>
        <div className="form-group">
          <label className="form-label">Amount (PKR)</label>
          <input className="form-input" type="number" placeholder="0.00" value={sendForm.amount} onChange={e => setSendForm({ ...sendForm, amount: e.target.value })} required disabled={isFrozen} />
        </div>
        <button type="submit" className="primary-button" disabled={loading || isFrozen}>{loading ? 'Processing...' : 'Confirm Transfer'}</button>
      </form>
    </div>
  );

  const renderAdd = () => (
    <div className="view-container">
      <h2 className="page-title">Add Funds</h2>
      <form className="mt-4" onSubmit={handleAdd}>
        <div className="form-group">
          <label className="form-label">Amount (PKR)</label>
          <input className="form-input" type="number" placeholder="5000" value={addForm.amount} onChange={e => setAddForm({ ...addForm, amount: e.target.value })} required disabled={isFrozen} />
        </div>

        <h4 className="form-label" style={{ marginTop: '20px' }}>Payment Details</h4>
        <div className="form-group">
          <input className="form-input" placeholder="Card Number (16 digits)" value={addForm.cardNumber} onChange={e => setAddForm({ ...addForm, cardNumber: e.target.value })} required disabled={isFrozen} />
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <input className="form-input" placeholder="MM/YY" value={addForm.expiry} onChange={e => setAddForm({ ...addForm, expiry: e.target.value })} required disabled={isFrozen} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <input className="form-input" type="password" placeholder="CVC" value={addForm.cvc} onChange={e => setAddForm({ ...addForm, cvc: e.target.value })} required disabled={isFrozen} />
          </div>
        </div>

        <button type="submit" className="primary-button" disabled={loading || isFrozen}>{loading ? 'Processing...' : 'Deposit Funds'}</button>
      </form>
    </div>
  );

  const renderHistory = () => (
    <div className="view-container">
      <h2 className="page-title">Transaction History</h2>
      <div className="history-section" style={{ marginTop: '20px' }}>
        {txHistory.length === 0 ? <p style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No transactions yet.</p> : txHistory.map(tx => (
          <div key={tx._id} className="tx-row" onClick={() => { setSelectedTx(tx); setShowTxDetail(true); }} style={{ cursor: 'pointer' }}>
            <div className={`tx-icon ${tx.type === 'ADD_MONEY' ? 'add' : (tx.isSender ? 'send' : 'receive')}`}>
              {tx.type === 'ADD_MONEY' ? <PlusCircle size={20} /> : (tx.isSender ? <Send size={20} /> : <ArrowDownCircle size={20} />)}
            </div>
            <div className="tx-info">
              <div className="tx-party" style={{ fontWeight: 600, color: '#1e293b' }}>{tx.type === 'BILL_PAYMENT' ? tx.description : tx.otherPartyName}</div>
              <div className="tx-date" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', color: '#64748b' }}>
                <Clock size={14} /> {formatTime(tx.createdAt)}
              </div>
            </div>
            <div>
              <span className={`tx-amount ${tx.isSender ? 'debit' : 'credit'}`}>
                {tx.isSender ? '-' : '+'} PKR {tx.amount?.toLocaleString()}
              </span>
              <span className="status-pill success">Success</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderBills = () => (
    <div className="view-container">
      <h2 className="page-title">Pay Bills</h2>
      <form className="mt-4" onSubmit={handlePayBill}>
        <div className="form-group">
          <label className="form-label">Service Type</label>
          <select className="form-input" value={billForm.type} onChange={e => setBillForm({ ...billForm, type: e.target.value })} required disabled={isFrozen}>
            <option value="Electricity">Electricity</option>
            <option value="Gas">Gas</option>
            <option value="Internet">Internet</option>
            <option value="Mobile Package">Mobile Package</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Provider Name</label>
          <input className="form-input" placeholder="e.g. K-Electric, SSGC, Jazz" value={billForm.provider} onChange={e => setBillForm({ ...billForm, provider: e.target.value })} required disabled={isFrozen} />
        </div>
        <div className="form-group">
          <label className="form-label">Consumer / Account Number</label>
          <input className="form-input" placeholder="Enter Consumer Number" value={billForm.consumerNumber} onChange={e => setBillForm({ ...billForm, consumerNumber: e.target.value })} required disabled={isFrozen} />
        </div>
        <div className="form-group">
          <label className="form-label">Amount (PKR)</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input className="form-input" type="number" placeholder="0.00" value={billForm.amount} onChange={e => setBillForm({ ...billForm, amount: e.target.value })} required disabled={isFrozen} readOnly />
            <button type="button" className="secondary-button" onClick={handleFetchBillAmount} disabled={isFrozen}>
              Fetch Bill
            </button>
          </div>
        </div>
        <button type="submit" className="primary-button" disabled={loading || isFrozen || !billForm.amount}>{loading ? 'Processing...' : 'Pay Bill'}</button>
      </form>
    </div>
  );

  const renderQR = () => (
    <div className="view-container">
      <h2 className="page-title">My QR Code</h2>
      <div style={{ textAlign: "center", marginTop: "30px", background: 'white', padding: '30px', borderRadius: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <QRCodeSVG value={user.mobileNumber} size={250} />
        <h3 style={{ marginTop: "20px", color: "#1e293b", fontSize: '1.5rem' }}>Scan to Pay Me</h3>
        <p style={{ color: "#64748b", fontSize: '1.1rem' }}>Mobile: <strong>{user.mobileNumber}</strong></p>
      </div>
    </div>
  );

  const renderSplit = () => {
    return (
      <div className="view-container">
        <h2 className="page-title">Bill Splitting</h2>

        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginTop: '20px' }}>
          <h3 style={{ marginBottom: '15px', color: '#1e293b' }}>Request a Split</h3>
          <form onSubmit={handleRequestSplit}>
            <div className="form-group">
              <label className="form-label">Description (e.g. 5 Burgers)</label>
              <input className="form-input" placeholder="What is this for?" value={splitForm.description} onChange={e => setSplitForm({ ...splitForm, description: e.target.value })} required disabled={isFrozen} />
            </div>
            <div className="form-group">
              <label className="form-label">Total Amount</label>
              <input className="form-input" type="number" placeholder="10000" value={splitForm.totalAmount} onChange={e => setSplitForm({ ...splitForm, totalAmount: e.target.value })} required disabled={isFrozen} />
            </div>

            <div className="form-group">
              <label className="form-label">Friends to split with</label>
              {splitForm.friends.map((friend, index) => (
                <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input className="form-input" placeholder="Mobile Number" value={friend.mobileNumber} onChange={e => {
                    const newFriends = [...splitForm.friends];
                    newFriends[index].mobileNumber = e.target.value;
                    setSplitForm({ ...splitForm, friends: newFriends });
                  }} required disabled={isFrozen} />
                  <input className="form-input" type="number" placeholder="Target per person" value={friend.amount} onChange={e => {
                    const newFriends = [...splitForm.friends];
                    newFriends[index].amount = e.target.value;
                    setSplitForm({ ...splitForm, friends: newFriends });
                  }} required disabled={isFrozen} />
                  {index > 0 && (
                    <button type="button" className="secondary-button" style={{ padding: '0 15px' }} onClick={() => {
                      const newFriends = splitForm.friends.filter((_, i) => i !== index);
                      setSplitForm({ ...splitForm, friends: newFriends });
                    }}>X</button>
                  )}
                </div>
              ))}
              <button type="button" className="secondary-button" onClick={() => setSplitForm({ ...splitForm, friends: [...splitForm.friends, { mobileNumber: '', amount: '' }] })}>
                + Add Friend
              </button>
            </div>
            <button type="submit" className="primary-button" style={{ marginTop: '10px' }} disabled={loading || isFrozen}>{loading ? 'Processing...' : 'Send Request'}</button>
          </form>
        </div>

        <h3 style={{ marginTop: '30px', color: '#1e293b' }}>Pending Split Requests</h3>
        <div style={{ marginTop: '15px' }}>
          {splits.length === 0 ? <p style={{ color: '#94a3b8' }}>No active split requests.</p> : splits.map(split => {
            const isInitiator = split.initiator._id === userId;
            const myParticipantInfo = split.participants.find(p => p.userId._id === userId);

            return (
              <div key={split._id} style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 600 }}>{split.description}</div>
                  <div style={{ fontWeight: 600 }}>Total: PKR {split.totalAmount}</div>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '10px' }}>
                  Initiated by {isInitiator ? 'You' : split.initiator.firstName} - Status: {split.status}
                </div>
                {!isInitiator && myParticipantInfo && myParticipantInfo.status === 'PENDING' && (
                  <div style={{ marginTop: '15px', background: '#f1f5f9', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Your Share: <strong>PKR {myParticipantInfo.amount}</strong></span>
                    <button className="primary-button" style={{ padding: '8px 15px' }} onClick={() => handleAcceptSplit(split._id)} disabled={loading || isFrozen}>
                      Pay Share
                    </button>
                  </div>
                )}
                <div style={{ marginTop: '10px' }}>
                  {split.participants.map((p, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem', color: p.status === 'ACCEPTED' ? '#10b981' : '#f59e0b', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span>{p.userId.firstName} {p.userId.lastName} (PKR {p.amount})</span>
                      <span>{p.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderProfile = () => {
    if (!profile) return <div className="view-container"><p>Loading profile...</p></div>;

    return (
      <div className="view-container">
        <h2 className="page-title">My Profile</h2>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '30px' }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: profilePicture ? `url(${profilePicture})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              color: 'white',
              fontWeight: 'bold',
              border: '4px solid white',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              {!profilePicture && (profile.firstName[0] + profile.lastName[0])}
            </div>
            <label htmlFor="profile-pic-upload" style={{
              position: 'absolute',
              bottom: '0',
              right: '0',
              background: '#667eea',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: '3px solid white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
              <User size={18} color="white" />
            </label>
            <input
              id="profile-pic-upload"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleProfilePictureUpload}
            />
          </div>
          <h3 style={{ marginTop: '15px', color: '#1e293b' }}>{profile.firstName} {profile.lastName}</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{profile.email}</p>
        </div>

        {!isEditingProfile ? (
          <div style={{ marginTop: '30px', background: '#f8fafc', padding: '25px', borderRadius: '12px' }}>
            <div style={{ display: 'grid', gap: '15px' }}>
              <InfoRow label="Full Name" value={`${profile.firstName} ${profile.midName} ${profile.lastName}`} />
              <InfoRow label="Email" value={profile.email} locked />
              <InfoRow label="Mobile Number" value={profile.mobileNumber} locked />
              <InfoRow label="CNIC" value={profile.cnicMasked} locked />
              <InfoRow label="Date of Birth" value={new Date(profile.dateOfBirth).toLocaleDateString()} />
              <InfoRow label="Nationality" value={profile.nationality} />
            </div>
            <button
              onClick={() => setIsEditingProfile(true)}
              className="primary-button"
              style={{ marginTop: '25px', width: '100%' }}
            >
              Edit Profile
            </button>
          </div>
        ) : (
          <form onSubmit={handleProfileUpdate} style={{ marginTop: '30px' }}>
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input className="form-input" value={profileForm.firstName} onChange={e => setProfileForm({ ...profileForm, firstName: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Middle Name (Optional)</label>
              <input className="form-input" value={profileForm.midName} onChange={e => setProfileForm({ ...profileForm, midName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input className="form-input" value={profileForm.lastName} onChange={e => setProfileForm({ ...profileForm, lastName: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input className="form-input" type="date" value={profileForm.dateOfBirth} onChange={e => setProfileForm({ ...profileForm, dateOfBirth: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Nationality</label>
              <input className="form-input" value={profileForm.nationality} onChange={e => setProfileForm({ ...profileForm, nationality: e.target.value })} required />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="submit" className="primary-button" disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setIsEditingProfile(false)} className="secondary-button" style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  // Helper Components
  const InfoRow = ({ label, value, locked }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
      <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{label}</span>
      <span style={{ color: '#1e293b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
        {value}
        {locked && <Shield size={14} color="#94a3b8" />}
      </span>
    </div>
  );

  const ArrowDownCircle = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="8 12 12 16 16 12" /><line x1="12" y1="8" x2="12" y2="16" /></svg>
  );

  return (
    <div className="dashboard-shell">
      {/* SIDEBAR */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">Waxella.</div>
        <nav className="nav-menu">
          <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <Home size={20} /> Dashboard
          </button>
          <button className={`nav-item ${activeTab === 'send' ? 'active' : ''}`} onClick={() => setActiveTab('send')}>
            <Send size={20} /> Send Money
          </button>
          <button className={`nav-item ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>
            <PlusCircle size={20} /> Add Funds
          </button>
          <button className={`nav-item ${activeTab === 'bills' ? 'active' : ''}`} onClick={() => setActiveTab('bills')}>
            <Receipt size={20} /> Pay Bills
          </button>
          <button className={`nav-item ${activeTab === 'split' ? 'active' : ''}`} onClick={() => setActiveTab('split')}>
            <Users size={20} /> Split Bill
          </button>
          <button className={`nav-item ${activeTab === 'qr' ? 'active' : ''}`} onClick={() => setActiveTab('qr')}>
            <QrCode size={20} /> My QR
          </button>
          <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <History size={20} /> History
          </button>
          <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <User size={20} /> Profile
          </button>
          <button className={`nav-item`} onClick={() => requestFreeze()}>
            <Shield size={20} /> {isFrozen ? "Unfreeze" : "Freeze"}
          </button>
        </nav>
        <div className="user-mini-profile">
          <div className="mini-avatar" style={{
            background: profilePicture ? `url(${profilePicture})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}>
            {!profilePicture && user.firstName[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user.firstName}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{user.mobileNumber}</div>
          </div>
          <LogOut size={18} style={{ cursor: 'pointer', color: '#ef4444' }} onClick={() => { socket?.disconnect(); onLogout(); }} />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        <header className="top-header">
          <div className="page-title" style={{ textTransform: 'capitalize' }}>
            {activeTab === 'home' ? 'Overview' : activeTab}
          </div>
          <div className="header-actions">
            <div style={{ position: 'relative' }}>
              <button className="notif-btn" onClick={() => setShowNotifDropdown(!showNotifDropdown)}>
                <Bell size={24} />
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>

              {/* NOTIFICATION DROPDOWN */}
              {showNotifDropdown && (
                <div className="notif-dropdown">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '0.85rem' }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <p style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No notifications</p>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif._id}
                          onClick={() => !notif.isRead && markAsRead(notif._id)}
                          style={{
                            padding: '15px',
                            borderBottom: '1px solid #f1f5f9',
                            background: notif.isRead ? 'white' : '#f8fafc',
                            cursor: notif.isRead ? 'default' : 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem', marginBottom: '4px' }}>
                                {notif.title}
                              </div>
                              <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '6px' }}>
                                {notif.message}
                              </div>
                              <div style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> {formatTimeOnly(notif.createdAt)}
                              </div>
                            </div>
                            {!notif.isRead && (
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#667eea', marginTop: '6px' }} />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {activeTab === 'home' && renderHome()}
        {activeTab === 'send' && renderSend()}
        {activeTab === 'add' && renderAdd()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'bills' && renderBills()}
        {activeTab === 'split' && renderSplit()}
        {activeTab === 'qr' && renderQR()}
        {activeTab === 'profile' && renderProfile()}

        {/* TRANSACTION DETAIL MODAL */}
        {showTxDetail && selectedTx && (
          <div className="modal-overlay" onClick={() => setShowTxDetail(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Transaction Details</h3>
                <button className="close-btn" onClick={() => setShowTxDetail(false)}>×</button>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                  <div className={`tx-icon ${selectedTx.type === 'ADD_MONEY' ? 'add' : (selectedTx.isSender ? 'send' : 'receive')}`} style={{ width: '60px', height: '60px', margin: '0 auto 15px' }}>
                    {selectedTx.type === 'ADD_MONEY' ? <PlusCircle size={30} /> : (selectedTx.isSender ? <Send size={30} /> : <ArrowDownCircle size={30} />)}
                  </div>
                  <h2 style={{ color: selectedTx.isSender ? '#ef4444' : '#10b981', margin: '10px 0' }}>
                    {selectedTx.isSender ? '-' : '+'} PKR {selectedTx.amount.toLocaleString()}
                  </h2>
                  <span className="status-pill success">Completed</span>
                </div>

                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px' }}>
                  <InfoRow label="Type" value={selectedTx.type === 'ADD_MONEY' ? 'Funds Added' : (selectedTx.isSender ? 'Money Sent' : 'Money Received')} />
                  <InfoRow label={selectedTx.type === 'ADD_MONEY' ? 'Source' : (selectedTx.isSender ? 'To' : 'From')} value={selectedTx.otherPartyName} />
                  {selectedTx.otherPartyMobile && <InfoRow label="Mobile" value={selectedTx.otherPartyMobile} />}
                  <InfoRow label="Date & Time" value={formatTime(selectedTx.createdAt)} />
                  <InfoRow label="Transaction ID" value={selectedTx._id.slice(-8).toUpperCase()} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OTP MODAL */}
        {showOtpModal && (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className="modal-header">
                <h3>Security Verification</h3>
                <button className="close-btn" onClick={() => setShowOtpModal(false)}>×</button>
              </div>
              <p style={{ marginBottom: '20px', color: '#cbd5e1' }}>Enter the OTP sent to your email to confirm this action.</p>
              <input className="form-input" style={{ textAlign: 'center', letterSpacing: '5px', fontSize: '1.5rem' }} maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} />
              <button className="primary-button" style={{ marginTop: '20px' }} onClick={confirmFreeze}>Verify & Confirm</button>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: '30px', right: '30px',
            background: toast.type === 'error' ? '#ef4444' : (toast.type === 'success' ? '#10b981' : '#3b82f6'),
            color: 'white', padding: '15px 25px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            animation: 'slideIn 0.3s ease-out', zIndex: 10000
          }}>
            <strong>{toast.title}</strong>: {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
