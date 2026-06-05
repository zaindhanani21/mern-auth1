import React, { useState, useEffect, useCallback, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import {
  Home,
  Send,
  PlusCircle,
  History,
  Shield,
  LogOut,
  Bell,
  Menu,
  User,
  X,
  Clock,
  Check,
  Receipt,
  QrCode,
  Users,
  Share2,
  Search,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
} from "lucide-react";
import "./Css/ModernDashboard.css";

const SOCKET_URL = "http://192.168.43.54:5000";
const stripePromise = loadStripe(
  "pk_test_51TSVFeDmC8zjQ7IGxqb8Hf2siIt1ixOpE1IpNevJup4eXC5JiLVU0LefrNAK3Kse9efMuAXscZXtiIVjrrrYKCQ200qQUcS87t",
);

export default function Dashboard({ userData, onLogout }) {
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState("home"); // home, send, add, history, profile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // User Data
  const storedData = JSON.parse(localStorage.getItem("userData") || "null");
  const user =
    userData && Object.keys(userData).length > 0
      ? userData.user || userData
      : storedData?.user || storedData;
  const userId = user?._id || user?.id;

  // Dashboard Data State
  const [balance, setBalance] = useState(0);
  const [isFrozen, setIsFrozen] = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showFriendsDropdown, setShowFriendsDropdown] = useState(false);
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
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sendType, setSendType] = useState("wallexa");
  const [sendForm, setSendForm] = useState({
    recipient: "",
    amount: "",
    note: "",
    recipientName: "",
  });
  const [externalForm, setExternalForm] = useState({
    bankName: "Meezan Bank",
    accountNumber: "",
    amount: "",
  });
  const [showExternalConfirm, setShowExternalConfirm] = useState(false);
  const [addForm, setAddForm] = useState({
    amount: "",
    method: "card",
    cardNumber: "",
    expiry: "",
    cvc: "",
  });
  const [otp, setOtp] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);

  // New Features State
  const [billForm, setBillForm] = useState({
    billType: "Electricity Bill",
    consumerNumber: "",
  });
  const [activeInvoices, setActiveInvoices] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [billFetched, setBillFetched] = useState(false);
  const [billOwnerName, setBillOwnerName] = useState("");
  const [showBillConfirm, setShowBillConfirm] = useState(false);
  // 🟢 Social Onboarding States
  const [socialStep, setSocialStep] = useState(1); // 1 = Activation Consent, 2 = Choose Username
  const [usernameInput, setUsernameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isUsernameAvailable, setIsUsernameAvailable] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  // 🟢 Friends, Public Profile, & Social Feed States
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResult, setFriendSearchResult] = useState(null);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendSearchError, setFriendSearchError] = useState("");
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);

  // Public Profile and Posts
  const [postVisibility, setPostVisibility] = useState("friends");
  const [selectedPublicUser, setSelectedPublicUser] = useState(null); // Jab hum kisi user ki profile details screen kholenge
    const [ownPostPrivacyFilter, setOwnPostPrivacyFilter] = useState("public"); // 🟢 Own profile tabs filter state (Default to public)
  const [publicUserPosts, setPublicUserPosts] = useState([]); // Viewed user ke posts display karne ke liye
  const [homeFeedPosts, setHomeFeedPosts] = useState([]); // Main timeline feed posts
  const [postContent, setPostContent] = useState(""); // Status update box content
  const [feedLoading, setFeedLoading] = useState(true); // Feed load spinner control
  const [splitForm, setSplitForm] = useState({
    description: "",
    totalAmount: "",
    friends: [{ mobileNumber: "", name: "" }],
  });
  const [splits, setSplits] = useState([]);
  // QR Scanner State
  const [qrView, setQrView] = useState(null); // 'myqr' | 'scanner'
  const [qrScanResult, setQrScanResult] = useState(null);
  const [qrRecipient, setQrRecipient] = useState(null);
  const [qrAmount, setQrAmount] = useState("");
  const [showQrConfirm, setShowQrConfirm] = useState(false);

  // 🟢 Auto-Reset All Forms & Modals when active tab changes (For Security & Premium UX)
  useEffect(() => {
    // 1. Reset Send Money Form
    setSendForm({ recipient: "", amount: "", note: "", recipientName: "" });
    setShowSendConfirm(false);

    // 2. Reset Add Funds Form
    setAddForm({
      amount: "",
      method: "card",
      cardNumber: "",
      expiry: "",
      cvc: "",
    });
    setOtp("");

    // 3. Reset Pay Bills Form
    setBillForm({ billType: "Electricity Bill", consumerNumber: "" });
    setBillFetched(false);
    setSelectedInvoiceIds([]);
    setShowBillConfirm(false);

    // 4. Reset Split Bills Form
    setSplitForm({
      description: "",
      totalAmount: "",
      friends: [{ mobileNumber: "", name: "" }],
    });

    // 5. Reset QR Scanner States (Camera off dynamic reset)
    try {
      if (window._html5QrCode) {
        window._html5QrCode
          .stop()
          .then(() => {
            window._html5QrCode = null;
          })
          .catch(() => {});
      }
    } catch (e) {}
    setQrScanResult(null);
    setQrRecipient(null);
    setQrAmount("");
    setQrView(null);
    setShowQrConfirm(false);

    // 6. Reset External Bank Confirm & Freeze Modal
    setShowExternalConfirm(false);
    setShowFreezeConfirm(false);
  }, [activeTab]);

  // --- INITIALIZATION ---
  const getToken = () => userData?.token || localStorage.getItem("userToken");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/dashboard",
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance);
        setIsFrozen(data.isFrozen);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("http://192.168.43.54:5000/api/wallet/history", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTxHistory(data.history);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  // 🟢 Create a ref for activeTab so that Socket listener can read its latest value safely
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // 🟢 Trigger fetchHistory when user switches to 'history' tab
  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/notifications",
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

    const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("http://192.168.43.54:5000/api/profile", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
        setProfilePicture(data.profilePicture);
        setProfileForm({
          firstName: data.firstName,
          midName: data.midName || "",
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split("T")[0] : "",
          nationality: data.nationality,
        });
      } else if (res.status === 401 || res.status === 404) {
        onLogout(); // 🟢 Token invalid ho ya user deleted ho toh safe log out kar dein
      }
    } catch (e) {
      console.error(e);
    }
  }, [onLogout]);

  const fetchSplits = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/get-splits",
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data?.requests)) {
        setSplits(data.requests);
      } else {
        setSplits([]);
      }
    } catch (err) {
      console.error("Could not fetch splits", err);
      setSplits([]);
    }
  }, []);

  // 🟢 Friends List fetch karna
  const fetchFriends = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch("http://192.168.43.54:5000/api/profile/friends", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setFriendsList(data);
      }
    } catch (e) {
      console.error("Error fetching friends list", e);
    }
  }, []);

  // 🟢 Pending incoming friend requests fetch karna
  const fetchFriendRequests = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/friend-requests",
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setFriendRequests(data);
      }
    } catch (e) {
      console.error("Error fetching friend requests", e);
    }
  }, []);

    const fetchHomeFeed = useCallback(async () => {
    if (!getToken()) {
      setFeedLoading(false); // 🟢 Token na ho toh loading status band karein
      return;
    }
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/posts/feed",
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setHomeFeedPosts(data);
      }
    } catch (e) {
      console.error("Error fetching home feed", e);
    } finally {
      setFeedLoading(false);
    }
  }, []); // Dependency wapas empty array ([]) ho gayi hai
  // 🟢 Kisi specific searched user ke posts fetch karna public profile display ke liye
  const fetchPublicUserPosts = async (userId) => {
    try {
      const res = await fetch(
        `http://192.168.43.54:5000/api/profile/posts/user/${userId}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setPublicUserPosts(data);
      }
    } catch (e) {
      console.error("Error fetching user posts", e);
    }
  };

  // 🟢 Friends Search Bar submit handler
  const handleFriendSearch = async (e) => {
    e?.preventDefault();
    if (!friendSearchQuery.trim()) return;
    setFriendSearchLoading(true);
    setFriendSearchError("");
    setFriendSearchResult(null);
    try {
      const res = await fetch(
        `http://192.168.43.54:5000/api/profile/search?username=${encodeURIComponent(friendSearchQuery.trim())}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setFriendSearchResult(data);
      } else {
        setFriendSearchError(data.message || "User not found.");
      }
    } catch {
      setFriendSearchError("Network error while searching.");
    } finally {
      setFriendSearchLoading(false);
    }
  };

  // 🟢 Send Friend Request (Updated with Instant UI Optimistic Update)
  const handleSendFriendRequest = async (recipientId) => {
    // 1. Back up current state in case of failure
    const prevSearchResult = friendSearchResult;
    const prevSelectedUser = selectedPublicUser;

    // 2. Optimistic Update: Instantly change UI status to SENT (No Delay!)
    if (friendSearchResult && friendSearchResult.id === recipientId) {
      setFriendSearchResult({ ...friendSearchResult, status: "SENT" });
    }
    if (selectedPublicUser && selectedPublicUser.id === recipientId) {
      setSelectedPublicUser((prev) => ({ ...prev, status: "SENT" }));
    }

    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/friend-request/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ recipientId }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setToast({
          title: "Request Sent",
          msg: "Friend request sent successfully!",
          type: "success",
        });

        // Finalize state with the real requestId from database
        if (friendSearchResult && friendSearchResult.id === recipientId) {
          setFriendSearchResult({
            ...friendSearchResult,
            status: "SENT",
            requestId: data.requestId,
          });
        }
        if (selectedPublicUser && selectedPublicUser.id === recipientId) {
          setSelectedPublicUser({
            ...selectedPublicUser,
            status: "SENT",
            requestId: data.requestId,
          });
        }
      } else {
        // Rollback to old state if request fails
        setFriendSearchResult(prevSearchResult);
        setSelectedPublicUser(prevSelectedUser);
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      // Rollback to old state if network fails
      setFriendSearchResult(prevSearchResult);
      setSelectedPublicUser(prevSelectedUser);
      setToast({
        title: "Error",
        msg: "Network error sending request.",
        type: "error",
      });
    }
  };

  // 🟢 Accept Friend Request (Updated with Instant UI Optimistic Update)
  const handleAcceptFriendRequest = async (requestId, senderName) => {
    // 1. Back up current states
    const prevSearchResult = friendSearchResult;
    const prevSelectedUser = selectedPublicUser;
    const prevRequests = friendRequests;

    // Find sender ID dynamically
    const requestObj = friendRequests.find((r) => r._id === requestId);
    const senderId = requestObj?.sender?._id || requestObj?.sender?.id;

    // 2. Optimistic Update: Instantly set status to FRIENDS and hide from dropdown (No Delay!)
    if (
      friendSearchResult &&
      (friendSearchResult.requestId === requestId ||
        friendSearchResult.id === senderId)
    ) {
      setFriendSearchResult({ ...friendSearchResult, status: "FRIENDS" });
    }
    if (
      selectedPublicUser &&
      (selectedPublicUser.requestId === requestId ||
        selectedPublicUser.id === senderId)
    ) {
      setSelectedPublicUser({ ...selectedPublicUser, status: "FRIENDS" });
    }
    setFriendRequests((prev) => prev.filter((r) => r._id !== requestId));

    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/friend-request/accept",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ requestId }),
        },
      );
            if (res.ok) {
        setToast({
          title: "Accepted 🎉",
          msg: `You are now friends with ${senderName}!`,
          type: "success",
        });
        fetchFriendRequests();
        fetchFriends();
        fetchHomeFeed();
        // 🟢 User Profile page ke posts ko foran refresh karein
        if (senderId) {
          fetchPublicUserPosts(senderId);
        }
      } else {
        // Rollback if server rejects request
        setFriendSearchResult(prevSearchResult);
        setSelectedPublicUser(prevSelectedUser);
        setFriendRequests(prevRequests);
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      // Rollback on network failure
      setFriendSearchResult(prevSearchResult);
      setSelectedPublicUser(prevSelectedUser);
      setFriendRequests(prevRequests);
      setToast({
        title: "Error",
        msg: "Network error accepting request.",
        type: "error",
      });
    }
  };

  // 🟢 Reject / Cancel Friend Request (Updated with Instant UI Optimistic Update)
  const handleRejectFriendRequest = async (requestId) => {
    // 1. Back up current states
    const prevSearchResult = friendSearchResult;
    const prevSelectedUser = selectedPublicUser;
    const prevRequests = friendRequests;

    // Find sender ID dynamically
    const requestObj = friendRequests.find((r) => r._id === requestId);
    const senderId = requestObj?.sender?._id || requestObj?.sender?.id;

    // 2. Optimistic Update: Instantly set status to NONE and hide from dropdown (No Delay!)
    if (
      friendSearchResult &&
      (friendSearchResult.requestId === requestId ||
        friendSearchResult.id === senderId)
    ) {
      setFriendSearchResult({
        ...friendSearchResult,
        status: "NONE",
        requestId: null,
      });
    }
    if (
      selectedPublicUser &&
      (selectedPublicUser.requestId === requestId ||
        selectedPublicUser.id === senderId)
    ) {
      setSelectedPublicUser((prev) => ({
        ...prev,
        status: "NONE",
        requestId: null,
      }));
    }
    setFriendRequests((prev) => prev.filter((r) => r._id !== requestId));

    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/friend-request/reject",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ requestId }),
        },
      );
      if (res.ok) {
        setToast({
          title: "Deleted",
          msg: "Friend request cancelled/removed.",
          type: "success",
        });
        fetchFriendRequests();
      } else {
        // Rollback if server fails
        setFriendSearchResult(prevSearchResult);
        setSelectedPublicUser(prevSelectedUser);
        setFriendRequests(prevRequests);
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      // Rollback on network failure
      setFriendSearchResult(prevSearchResult);
      setSelectedPublicUser(prevSelectedUser);
      setFriendRequests(prevRequests);
      setToast({
        title: "Error",
        msg: "Network error deleting request.",
        type: "error",
      });
    }
  };
  // 🟢 Unfriend / Remove Friend
  const handleRemoveFriend = async (friendId, friendName) => {
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/friend/remove",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ friendId }),
        },
      );
           if (res.ok) {
        setToast({
          title: "Removed",
          msg: `Removed ${friendName} from friends.`,
          type: "success",
        });
        fetchFriends();
        fetchHomeFeed();
        if (friendSearchResult && friendSearchResult.id === friendId) {
          setFriendSearchResult({ ...friendSearchResult, status: "NONE" });
        }
        if (selectedPublicUser && selectedPublicUser.id === friendId) {
          setSelectedPublicUser((prev) => ({ ...prev, status: "NONE" }));
          fetchPublicUserPosts(friendId); // 🟢 User Profile page ke posts ko foran refresh karein
        }
      } else {
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({
        title: "Error",
        msg: "Network error unfriending.",
        type: "error",
      });
    }
  };

  // 🟢 Create status post handler
    const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    try {
      const res = await fetch("http://192.168.43.54:5000/api/profile/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          content: postContent,
          visibility: postVisibility,
        }),
      });
      if (res.ok) {
        setToast({
          title: "Post Shared",
          msg: "Your status has been posted!",
          type: "success",
        });
        setPostContent("");
        fetchHomeFeed();
        
        // 🟢 Agar hum apni hi profile ("SELF") par khare hain toh profile timeline refresh karein
        if (selectedPublicUser && selectedPublicUser.status === "SELF") {
          fetchPublicUserPosts(selectedPublicUser.id);
        }
      } else {
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({
        title: "Error",
        msg: "Network error sharing post.",
        type: "error",
      });
    }
  };

  useEffect(() => {
    fetchData();
    fetchNotifications();
    fetchProfile();
    fetchSplits();
    fetchFriends(); // Friends list fetch karna on mount
    fetchFriendRequests(); // Friend requests list fetch karna on mount
    fetchHomeFeed(); // Home status posts feed fetch karna on mount

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      if (userId) newSocket.emit("join_user_room", userId);
    });

    newSocket.on("notification", (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((prev) => prev + 1);
      setToast({ title: notif.title, msg: notif.message, type: "info" });
      fetchData();
      fetchSplits();
      fetchNotifications();
      if (activeTabRef.current === "history") {
        fetchHistory();
      }
    });

    // 👤 Real-time Friend Request Received
        // 👤 Real-time Friend Request Received
    newSocket.on("friend_request_received", (data) => {
      setToast({
        title: "New Friend Request 👤",
        msg: `${data.sender.firstName} sent you a friend request!`,
        type: "info",
      });
      fetchFriendRequests(); // Refresh requests box
      
      // REAL-TIME PROFILE UPDATE: Agar user usi ki profile par khara hai toh foran "Accept/Reject" dikhao
      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.sender.id) {
          return { ...prev, status: "RECEIVED", requestId: data.requestId };
        }
        return prev;
      });
    });

    // 🎉 Real-time Friend Request Accepted
        newSocket.on("friend_request_accepted", (data) => {
      setToast({
        title: "Request Accepted 🎉",
        msg: `${data.friend.firstName} accepted your friend request!`,
        type: "success",
      });
      fetchFriends();
      fetchHomeFeed();
      
      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.friend.id) {
          fetchPublicUserPosts(data.friend.id); // 🟢 User Profile page ko update karein
          return { ...prev, status: "FRIENDS" };
        }
        return prev;
      });
    });

            // 💔 Real-time Unfriend (Dosti khatam)
       newSocket.on("friend_removed", (data) => {
      fetchFriends();
      fetchHomeFeed();
      
      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.friendId) {
          fetchPublicUserPosts(data.friendId); // 🟢 User Profile page ko update karein
          return { ...prev, status: "NONE" };
        }
        return prev;
      });
    });

    // ❌ Real-time Friend Request Rejected / Cancelled (Naya Code)
    newSocket.on("friend_request_rejected", (data) => {
      fetchFriendRequests(); // Requests list refresh karo
      
      // REAL-TIME PROFILE UPDATE: Profile card ko wapas "Add Friend" (NONE) state par le jao
      setSelectedPublicUser((prev) => {
        if (prev && (prev.id === data.senderId || prev.requestId === data.requestId)) {
          return { ...prev, status: "NONE", requestId: null };
        }
        return prev;
      });
    });

     // 📢 Real-time Post Creation (Social Feed Instant Update - Naya Code)
    newSocket.on("post_created", (data) => {
      // Agar main khud author hoon, toh refresh karne ki zaroorat nahi hai
      if (data.authorId === userId) return;
      // 1. Home Feed timeline update check
      if (data.visibility === "public") {
        fetchHomeFeed(); // Public posts sabko dikhani hain
      } else if (data.visibility === "friends") {
        // Agar mera ID uske friends array mein hai, toh feed update hogi
        if (data.friends && data.friends.includes(userId)) {
          fetchHomeFeed();
        }
      }
            // 2. Agar main currently isi specific user ki profile timeline dekh raha hoon, toh wo bhi update ho jaye
      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.authorId) {
          if (data.visibility === "public" || (data.visibility === "friends" && data.friends.includes(userId))) {
            fetchPublicUserPosts(data.authorId);
          }
        }
        return prev;
      });
    });

    // 🚫 Real-time Deactivation (Clear deactivated user's posts instantly - Naya Code)
    newSocket.on("social_deactivated", (data) => {
      // 1. Timeline feed se deactivated user ke posts foran delete karo
      setHomeFeedPosts((prev) => prev.filter((post) => post.author._id !== data.userId));

      // 2. Agar hum currently isi user ki profile dekh rahe hain, toh use close kar do
      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.userId) {
          return null;
        }
        return prev;
      });
    });
  }, [
    userId,
    fetchData,
    fetchNotifications,
    fetchProfile,
    fetchSplits,
    fetchHistory,
    fetchFriends,
    fetchFriendRequests,
    fetchHomeFeed,
  ]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- NOTIFICATION ACTIONS ---
  const markAsRead = async (notificationId) => {
    try {
      await fetch(
        "http://192.168.43.54:5000/api/wallet/mark-notification-read",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ notificationId }),
        },
      );
      fetchNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  const markAllAsRead = () => markAsRead("all");

  const handleExternalTransfer = async () => {
    setShowExternalConfirm(false);
    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/send-external-money",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            bankName: externalForm.bankName,
            accountNumber: externalForm.accountNumber,
            amount: Number(externalForm.amount),
          }),
        },
      );
      const data = await res.json();

      if (res.ok) {
        setToast({
          title: "Transfer Successful 🎉",
          msg: `PKR ${externalForm.amount} sent to ${externalForm.bankName}!`,
          type: "success",
        });
        setExternalForm({
          bankName: "Meezan Bank",
          accountNumber: "",
          amount: "",
        });
        fetchData();
        fetchNotifications();
      } else {
        setToast({
          title: "Transfer Failed ❌",
          msg: data.message,
          type: "error",
        });
      }
    } catch (err) {
      setToast({
        title: "Network Error ❌",
        msg: "Connection failed. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const initiateExternalTransfer = (e) => {
    e.preventDefault();
    if (isFrozen)
      return setToast({
        title: "Error",
        msg: "Wallet is Frozen!",
        type: "error",
      });
    if (!externalForm.accountNumber || externalForm.accountNumber.length < 6) {
      return setToast({
        title: "Error",
        msg: "Please enter a valid Account Number (min 6 digits)",
        type: "error",
      });
    }
    if (!externalForm.amount || Number(externalForm.amount) <= 0) {
      return setToast({
        title: "Error",
        msg: "Please enter a valid amount",
        type: "error",
      });
    }
    // Show confirmation popup BEFORE hitting Stripe
    setShowExternalConfirm(true);
  };

  // --- TRANSACTION ACTIONS ---
  const fetchRecipientName = async () => {
    if (!sendForm.recipient || sendForm.recipient.length < 10) {
      setSendForm((prev) => ({ ...prev, recipientName: "" }));
      return;
    }
    try {
      const res = await fetch(
        `http://192.168.43.54:5000/api/profile/mobile/${sendForm.recipient}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setSendForm((prev) => ({
          ...prev,
          recipientName: `${data.firstName} ${data.lastName}`,
        }));
      } else {
        setSendForm((prev) => ({ ...prev, recipientName: "User not found" }));
      }
    } catch {}
  };

  const initiateSend = async (e) => {
    e.preventDefault();
    if (isFrozen)
      return setToast({
        title: "Error",
        msg: "Wallet is Frozen",
        type: "error",
      });

    let currentName = sendForm.recipientName;

    if (!currentName || currentName === "User not found") {
      if (!sendForm.recipient || sendForm.recipient.length < 10) {
        return setToast({
          title: "Error",
          msg: "Invalid Recipient Mobile Number",
          type: "error",
        });
      }
      try {
        const res = await fetch(
          `http://192.168.43.54:5000/api/profile/mobile/${sendForm.recipient}`,
          {
            headers: { Authorization: `Bearer ${getToken()}` },
          },
        );
        const data = await res.json();
        if (res.ok) {
          currentName = `${data.firstName} ${data.lastName}`;
          setSendForm((prev) => ({ ...prev, recipientName: currentName }));
        } else {
          setSendForm((prev) => ({ ...prev, recipientName: "User not found" }));
          return setToast({
            title: "Error",
            msg: "Invalid Recipient: User not found",
            type: "error",
          });
        }
      } catch (err) {
        console.error("Recipient check error:", err);
        return setToast({
          title: "Error",
          msg: `Network check failed: ${err.message}`,
          type: "error",
        });
      }
    }

    setShowSendConfirm(true);
  };

  const handleSend = async () => {
    setLoading(true);
    setShowSendConfirm(false);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/send-money",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            recipientMobile: sendForm.recipient,
            amount: Number(sendForm.amount),
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        // 💸 Instantly update balance on screen (Real-time Feel!)
        setBalance((prev) => prev - Number(sendForm.amount));
        setToast({ title: "Success", msg: "Money Sent!", type: "success" });
        setSendForm({ recipient: "", amount: "", note: "", recipientName: "" });
        fetchData();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const stripe = useStripe();
  const elements = useElements();

  const handleAdd = async (e) => {
    e.preventDefault();
    if (isFrozen)
      return setToast({
        title: "Error",
        msg: "Wallet is Frozen",
        type: "error",
      });
    if (!stripe || !elements)
      return setToast({
        title: "Error",
        msg: "Stripe is not loaded yet",
        type: "error",
      });

    setLoading(true);
    try {
      const cardElement = elements.getElement(CardElement);
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });

      if (error) {
        setToast({ title: "Card Error", msg: error.message, type: "error" });
        setLoading(false);
        return;
      }

      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/add-money",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            amount: Number(addForm.amount),
            paymentMethodId: paymentMethod.id,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setToast({ title: "Success", msg: "Funds Added!", type: "success" });
        setAddForm({
          amount: "",
          method: "card",
          cardNumber: "",
          expiry: "",
          cvc: "",
        });
        cardElement.clear();
        fetchData();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const requestFreeze = async () => {
    try {
      await fetch("http://192.168.43.54:5000/api/auth/send-freeze-otp", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setShowOtpModal(true);
    } catch {
      setToast({ title: "Error", msg: "Could not send OTP", type: "error" });
    }
  };

  const confirmFreeze = async () => {
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/verify-freeze-otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ otp }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setIsFrozen(data.isFrozen);
        setShowOtpModal(false);
        setOtp("");
        setToast({ title: "Success", msg: data.message, type: "success" });
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    }
  };

  // --- PROFILE ACTIONS ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://192.168.43.54:5000/api/profile/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          title: "Success",
          msg: "Profile updated!",
          type: "success",
        });
        setIsEditingProfile(false);
        fetchProfile();
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return setToast({
        title: "Error",
        msg: "Image too large (max 2MB)",
        type: "error",
      });
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      try {
        const res = await fetch(
          "http://192.168.43.54:5000/api/profile/upload-picture",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify({ profilePicture: base64 }),
          },
        );
        const data = await res.json();
        if (res.ok) {
          setProfilePicture(data.profilePicture);
          setToast({
            title: "Success",
            msg: "Profile picture updated!",
            type: "success",
          });
        } else {
          setToast({ title: "Error", msg: data.message, type: "error" });
        }
      } catch {
        setToast({ title: "Error", msg: "Upload failed", type: "error" });
      }
    };
    reader.readAsDataURL(file);
  };

  // --- QR SCANNER SEND HANDLER ---
  const handleQrSend = async () => {
    if (!qrScanResult || !qrAmount || Number(qrAmount) <= 0) return;
    setLoading(true);
    setShowQrConfirm(false);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/send-money",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            recipientMobile: qrScanResult,
            amount: Number(qrAmount),
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        // 💸 Instantly update balance on screen (Real-time Feel!)
        setBalance((prev) => prev - Number(qrAmount));

        setToast({
          title: "Transfer Successful ✅",
          msg: `PKR ${qrAmount} sent to ${qrRecipient?.firstName} ${qrRecipient?.lastName}`,
          type: "success",
        });
        setQrScanResult(null);
        setQrRecipient(null);
        setQrAmount("");
        setQrView(null); // 🟢 Wapas selection screen par redirect karega
        fetchData();
        fetchNotifications();
      } else {
        setToast({
          title: "Transfer Failed ❌",
          msg: data.message,
          type: "error",
        });
      }
    } catch {
      setToast({
        title: "Error",
        msg: "Network error. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // --- NEW FEATURE ACTIONS ---
  const handlePayBill = async () => {
    if (isFrozen)
      return setToast({
        title: "Wallet Frozen",
        msg: "Your wallet is currently frozen. Please unfreeze to proceed.",
        type: "error",
      });
    if (selectedInvoiceIds.length === 0)
      return setToast({
        title: "No Bills Selected",
        msg: "Please select at least one bill to proceed with payment.",
        type: "error",
      });
    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/pay-selected-bills",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ invoiceIds: selectedInvoiceIds }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setToast({
          title: "Payment Successful",
          msg: `${selectedInvoiceIds.length} bill(s) paid. PKR ${data.totalPaid.toLocaleString()} deducted from your wallet.`,
          type: "success",
        });
        setSelectedInvoiceIds([]);
        setBillFetched(false);
        setActiveInvoices([]);
        setBillForm({ billType: "Electricity Bill", consumerNumber: "" });
        fetchData();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchBillAmount = async () => {
    if (!billForm.consumerNumber || billForm.consumerNumber.length !== 11) {
      return setToast({
        title: "Invalid Account Number",
        msg: "Please enter a valid 11-digit mobile number linked to your utility account.",
        type: "error",
      });
    }
    setLoading(true);
    try {
      const res = await fetch(
        // 🌟 Niche 'XXXX' ki jagah apna IP (jaise localhost ya network IP) likhein
        `http://192.168.43.54:5000/api/wallet/fetch-bills?billType=${encodeURIComponent(billForm.billType)}&consumerNumber=${billForm.consumerNumber}`, // Add your IP here
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const data = await res.json();
      if (res.ok) {
        setActiveInvoices(data.invoices);
        setBillOwnerName(data.ownerName); // 🟢 Verified name ko humne memory notebook mein save kar liya!
        setSelectedInvoiceIds([]);
        setBillFetched(true);
        setToast({
          title: "Bills Retrieved",
          msg: `${data.invoices.length} bill(s) found for account ${billForm.consumerNumber}.`,
          type: "success",
        });
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 🟢 Live Username verification & cleaning
  const handleUsernameChange = async (val) => {
    // Semicolons aur special characters ko type karte waqt hi automatically strip (delete) kar dena!
    const cleanVal = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "");
    setUsernameInput(cleanVal);
    setIsUsernameAvailable(false);
    setUsernameError("");

    if (cleanVal.length < 4) {
      setUsernameError("Username must be at least 4 characters long.");
      return;
    }
    if (cleanVal.length > 15) {
      setUsernameError("Username cannot exceed 15 characters.");
      return;
    }

    // Live backend call to check username availability
    setUsernameChecking(true);
    try {
      const res = await fetch(
        `http://192.168.43.54:5000/api/profile/check-username/${cleanVal}`,
        {
          // 🌟 Niche IP update rakhiyega
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setIsUsernameAvailable(true);
      } else {
        setUsernameError(data.message);
      }
    } catch {
      setUsernameError("Network error while checking username.");
    } finally {
      setUsernameChecking(false);
    }
  };

  // 🟢 Finalize & Save username to database
  // 🟢 Finalize & Save username & displayName to database
  const handleSaveUsername = async (e) => {
    e.preventDefault();
    if (!isUsernameAvailable) return;
    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/set-username",
        {
          // 🌟 Niche IP update rakhiyega
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            username: usernameInput,
            displayName: displayNameInput,
          }), // 🟢 Send displayName too
        },
      );
      const data = await res.json();
      if (res.ok) {
        // Update local React state taake screen directly main feed par redirect ho jaye!
        setProfile((prev) => ({ ...prev, username: data.username }));
        setToast({
          title: "Success",
          msg: "Social Feed activated successfully!",
          type: "success",
        });
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 🟢 Deactivate Social Profile (Delete username & displayName)
  const confirmDeactivateSocial = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/profile/deactivate-social",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      if (res.ok) {
        // Local React state ko reset karna taake screen instantly onboarding par chali jaye!
        setProfile((prev) => ({ ...prev, username: null }));
        setSocialStep(1); // Consent screen (step 1) par reset karna
        setUsernameInput(""); // Type kiya hua purana username clear karna
        setDisplayNameInput(""); // 🟢 Reset display name too
        setIsUsernameAvailable(false);
        setToast({
          title: "Profile Deleted",
          msg: "Your Wallexa Social Profile has been deactivated successfully.",
          type: "success",
        });
      } else {
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchFriendName = async (index, mobileNumber) => {
    if (!mobileNumber || mobileNumber.length < 10) {
      const newFriends = [...splitForm.friends];
      newFriends[index].name = "";
      setSplitForm({ ...splitForm, friends: newFriends });
      return;
    }
    try {
      const res = await fetch(
        `http://192.168.43.54:5000/api/profile/mobile/${mobileNumber}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      const newFriends = [...splitForm.friends];
      if (res.ok) {
        newFriends[index].name = `${data.firstName} ${data.lastName}`;
      } else {
        newFriends[index].name = "User not found";
      }
      setSplitForm({ ...splitForm, friends: newFriends });
    } catch {}
  };

  const handleRequestSplit = async (e) => {
    e.preventDefault();
    if (!splitForm.description || !splitForm.totalAmount) {
      return setToast({
        title: "Error",
        msg: "Enter description and total amount",
        type: "error",
      });
    }

    const validFriends = splitForm.friends.filter(
      (f) => f.name && f.name !== "User not found",
    );
    if (validFriends.length === 0) {
      return setToast({
        title: "Error",
        msg: "Add at least one valid friend",
        type: "error",
      });
    }

    const splitCount = validFriends.length + 1; // including requester
    const perPerson = Number((splitForm.totalAmount / splitCount).toFixed(2));

    const payload = {
      description: splitForm.description,
      totalAmount: Number(splitForm.totalAmount),
      friends: validFriends.map((f) => ({
        mobileNumber: f.mobileNumber,
        amount: splitForm.isCustom ? Number(f.amount || 0) : perPerson,
      })),
    };

    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/request-split",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setToast({
          title: "Success",
          msg: "Split Request Sent!",
          type: "success",
        });
        setSplitForm({
          description: "",
          totalAmount: "",
          friends: [{ mobileNumber: "", name: "" }],
        });
        fetchSplits();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptSplit = async (splitId) => {
    if (isFrozen)
      return setToast({
        title: "Error",
        msg: "Wallet is Frozen",
        type: "error",
      });
    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/accept-split",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ splitId }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setToast({
          title: "Success",
          msg: "Split Bill Paid!",
          type: "success",
        });
        fetchData();
        fetchSplits();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectSplit = async (splitId) => {
    setLoading(true);
    try {
      const res = await fetch(
        "http://192.168.43.54:5000/api/wallet/reject-split",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ splitId }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setToast({
          title: "Rejected",
          msg: "You rejected the split request",
          type: "success",
        });
        fetchSplits();
        fetchNotifications();
      } else {
        setToast({ title: "Failed", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // --- HELPER FUNCTIONS ---
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatTimeOnly = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const addFriend = () => {
    setSplitForm({
      ...splitForm,
      friends: [
        ...splitForm.friends,
        { mobileNumber: "", name: "", amount: "" },
      ],
    });
  };

  const removeFriend = (index) => {
    if (splitForm.friends.length > 1) {
      const newFriends = splitForm.friends.filter((_, i) => i !== index);
      setSplitForm({ ...splitForm, friends: newFriends });
    }
  };

  // --- RENDERERS ---
  const renderHome = () => (
    <div className="view-container">
      <div className="balance-card">
        <span className="balance-label">Total Balance</span>
        <h2 className="balance-amount">
          {isFrozen
            ? "❄️ FROZEN"
            : showBalance
              ? `PKR ${balance.toLocaleString()}`
              : "****"}
        </h2>
        <button
          onClick={() => setShowBalance(!showBalance)}
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "none",
            color: "white",
            padding: "5px 12px",
            borderRadius: "20px",
            cursor: "pointer",
          }}
        >
          {showBalance ? "Hide" : "Show"} Balance
        </button>
      </div>

      <div className="quick-actions-grid">
        <div className="action-tile" onClick={() => setActiveTab("send")}>
          <div className="tile-icon">
            <Send size={24} />
          </div>
          <span>Send Money</span>
        </div>
        <div className="action-tile" onClick={() => setActiveTab("add")}>
          <div className="tile-icon">
            <PlusCircle size={24} />
          </div>
          <span>Add Money</span>
        </div>
        <div className="action-tile" onClick={() => setActiveTab("history")}>
          <div className="tile-icon">
            <History size={24} />
          </div>
          <span>History</span>
        </div>
      </div>
    </div>
  );

  const renderSend = () => (
    <div className="view-container">
      <h2 className="page-title">Send Money</h2>

      {/* Choice Buttons */}
      <div
        style={{
          display: "flex",
          gap: "15px",
          marginBottom: "25px",
          marginTop: "20px",
        }}
      >
        <button
          type="button"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            border:
              sendType === "wallexa"
                ? "1px solid #667eea"
                : "1px solid rgba(255,255,255,0.1)",
            background:
              sendType === "wallexa"
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "rgba(255,255,255,0.05)",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "all 0.3s ease",
            boxShadow:
              sendType === "wallexa"
                ? "0 4px 15px rgba(102, 126, 234, 0.4)"
                : "none",
          }}
          onClick={() => setSendType("wallexa")}
        >
          📱 Send to Wallexa
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            border:
              sendType === "external"
                ? "1px solid #667eea"
                : "1px solid rgba(255,255,255,0.1)",
            background:
              sendType === "external"
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "rgba(255,255,255,0.05)",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "all 0.3s ease",
            boxShadow:
              sendType === "external"
                ? "0 4px 15px rgba(102, 126, 234, 0.4)"
                : "none",
          }}
          onClick={() => setSendType("external")}
        >
          🏦 External Bank
        </button>
      </div>

      {/* Option 1: Send within Wallexa (Unchanged P2P Form) */}
      {sendType === "wallexa" && (
        <form className="mt-4" onSubmit={initiateSend}>
          <div className="form-group">
            <label className="form-label">Recipient Mobile</label>
            <input
              className="form-input"
              placeholder="03001234567"
              value={sendForm.recipient}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, "");
                setSendForm({ ...sendForm, recipient: val, recipientName: "" });
              }}
              onBlur={fetchRecipientName}
              required
              disabled={isFrozen}
            />
            {sendForm.recipientName && (
              <div
                style={{
                  fontSize: "0.85rem",
                  marginTop: "5px",
                  color:
                    sendForm.recipientName === "User not found"
                      ? "#ef4444"
                      : "#10b981",
                  fontWeight: 500,
                }}
              >
                {sendForm.recipientName !== "User not found"
                  ? `Sending to: ${sendForm.recipientName}`
                  : sendForm.recipientName}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Amount (PKR)</label>
            <input
              className="form-input"
              type="text"
              placeholder="0"
              value={sendForm.amount}
              onChange={(e) =>
                setSendForm({
                  ...sendForm,
                  amount: e.target.value.replace(/[^0-9]/g, ""),
                })
              }
              required
              disabled={isFrozen}
            />
          </div>
          <button
            type="submit"
            className="primary-button"
            disabled={loading || isFrozen}
          >
            {loading ? "Processing..." : "Proceed to Send"}
          </button>
        </form>
      )}

      {/* Option 2: Send to External Bank */}
      {sendType === "external" && (
        <div className="mt-4" style={{ animation: "fadeIn 0.3s ease" }}>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.9rem",
              marginBottom: "20px",
            }}
          >
            🏦 Transfer funds directly to any external bank account via Stripe
            secure sandbox.
          </p>

          <form onSubmit={initiateExternalTransfer}>
            <div className="form-group">
              <label className="form-label">Select Destination Bank</label>
              <select
                className="form-input"
                style={{
                  background: "#0f172a",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                value={externalForm.bankName}
                onChange={(e) =>
                  setExternalForm({ ...externalForm, bankName: e.target.value })
                }
                required
                disabled={isFrozen}
              >
                <option value="Meezan Bank">Meezan Bank 🏦</option>
                <option value="HBL Bank">HBL Bank 🏦</option>
                <option value="Easypaisa">Easypaisa 📱</option>
                <option value="JazzCash">JazzCash 📱</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Bank Account Number</label>
              <input
                className="form-input"
                maxLength={20}
                placeholder="Enter account number e.g. 0001234567"
                value={externalForm.accountNumber}
                onChange={(e) =>
                  setExternalForm({
                    ...externalForm,
                    accountNumber: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                required
                disabled={isFrozen}
              />
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                  marginTop: "5px",
                }}
              >
                🔒 Account will be validated in real-time via Stripe API
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Amount (PKR)</label>
              <input
                className="form-input"
                type="text"
                placeholder="0"
                value={externalForm.amount}
                onChange={(e) =>
                  setExternalForm({
                    ...externalForm,
                    amount: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                required
                disabled={isFrozen}
              />
            </div>

            <button
              type="submit"
              className="primary-button"
              style={{
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              }}
              disabled={loading || isFrozen}
            >
              {loading ? "Processing..." : "Proceed to Transfer"}
            </button>
          </form>
        </div>
      )}
    </div>
  );

  const renderAdd = () => (
    <div className="view-container">
      <h2 className="page-title">Add Funds</h2>
      <form className="mt-4" onSubmit={handleAdd}>
        <div className="form-group">
          <label className="form-label">Amount (PKR)</label>
          <input
            className="form-input"
            type="text"
            placeholder="5000"
            value={addForm.amount}
            onChange={(e) =>
              setAddForm({
                ...addForm,
                amount: e.target.value.replace(/[^0-9]/g, ""),
              })
            }
            required
            disabled={isFrozen}
          />
        </div>

        <h4 className="form-label" style={{ marginTop: "20px" }}>
          Payment Details
        </h4>
        <div className="form-group">
          <label className="form-label">Card Information</label>
          <div
            style={{
              padding: "12px 15px",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <CardElement
              options={{
                disabled: isFrozen,
                hidePostalCode: true,
                style: {
                  base: {
                    fontSize: "16px",
                    color: "#f8fafc",
                    "::placeholder": { color: "#94a3b8" },
                    iconColor: "#667eea",
                  },
                  invalid: { color: "#ef4444" },
                },
              }}
            />
          </div>
          <p
            style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "8px" }}
          >
            🔒 Your card details are encrypted and secured by Stripe.
          </p>
        </div>

        <button
          type="submit"
          className="primary-button"
          disabled={loading || isFrozen || !stripe}
        >
          {loading ? "Processing..." : "Deposit Funds"}
        </button>
      </form>
    </div>
  );

  const renderSocial = () => {
    // 1. Loading screen agar profile fetch nahi hui abhi tak
    if (!profile) {
      return (
        <div
          className="view-container"
          style={{ textAlign: "center", padding: "50px" }}
        >
          <p style={{ color: "#94a3b8" }}>Loading profile details...</p>
        </div>
      );
    }

    // 2. ONBOARDING FLOW: Agar user ka username register nahi hai (First-Time Visit)
    if (!profile.username) {
      return (
        <div className="view-container">
          <h2 className="page-title">Social Feed Setup</h2>

          <div
            style={{
              maxWidth: "500px",
              margin: "30px auto 0 auto",
              background: "var(--bg-card)",
              padding: "30px",
              borderRadius: "24px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              textAlign: "center",
            }}
          >
            {socialStep === 1 ? (
              <div>
                <Share2
                  size={64}
                  style={{ marginBottom: "20px", color: "#6366f1" }}
                />
                <h3
                  style={{
                    fontSize: "1.4rem",
                    color: "#f8fafc",
                    marginBottom: "15px",
                  }}
                >
                  Activate Wallexa Social
                </h3>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.95rem",
                    lineHeight: "1.6",
                    marginBottom: "25px",
                  }}
                >
                  Connect with friends securely! By activating social feed, you
                  can search friends using usernames, share transaction receipts
                  with hidden amounts, and react to payments.
                </p>
                <button
                  className="primary-button"
                  onClick={() => setSocialStep(2)}
                >
                  🚀 Activate Social Feed
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveUsername}>
                <h3
                  style={{
                    fontSize: "1.4rem",
                    color: "#f8fafc",
                    marginBottom: "10px",
                  }}
                >
                  Choose a Username
                </h3>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    marginBottom: "20px",
                    lineHeight: "1.5",
                  }}
                >
                  Your mobile number and email will remain private. Friends will
                  search you using this unique username.
                </p>

                {/* 🟢 Display Name Input */}
                <div className="form-group" style={{ marginBottom: "15px" }}>
                  <input
                    className="form-input"
                    placeholder="Display Name (e.g. Zain Ali)"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    style={{ fontSize: "1.05rem", padding: "12px 15px" }}
                    required
                  />
                </div>

                <div
                  className="form-group"
                  style={{ marginBottom: "20px", position: "relative" }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "15px",
                      top: "12px",
                      color: "#6366f1",
                      fontWeight: 700,
                      fontSize: "1.1rem",
                    }}
                  >
                    @
                  </div>
                  <input
                    className="form-input"
                    placeholder="e.g. John"
                    value={usernameInput}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    style={{
                      paddingLeft: "35px",
                      fontSize: "1.05rem",
                      letterSpacing: "0.5px",
                    }}
                    required
                  />

                  <div
                    style={{
                      textAlign: "left",
                      marginTop: "8px",
                      fontSize: "0.82rem",
                    }}
                  >
                    {usernameChecking && (
                      <span style={{ color: "#94a3b8" }}>
                        Checking availability...
                      </span>
                    )}
                    {isUsernameAvailable && (
                      <span style={{ color: "#10b981", fontWeight: 600 }}>
                        ✓ Username is available!
                      </span>
                    )}
                    {usernameError && (
                      <span style={{ color: "#ef4444" }}>
                        ✗ {usernameError}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={loading || !isUsernameAvailable}
                    style={{ flex: 2 }}
                  >
                    {loading ? "Activating..." : "Confirm & Save"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSocialStep(1)}
                    style={{ flex: 1 }}
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      );
    }

    // 3. PUBLIC PROFILE SCREEN: Jab selectedPublicUser set ho (User clicks on a searched card or friend)
    if (selectedPublicUser) {
      return (
        <div className="view-container">
          {/* Header with Back button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              marginBottom: "20px",
            }}
          >
            <button
              className="secondary-button"
              style={{
                width: "auto",
                padding: "8px 16px",
                borderRadius: "10px",
              }}
              onClick={() => {
                setSelectedPublicUser(null);
                setPublicUserPosts([]);
              }}
            >
              ← Back to Feed
            </button>
            <h2 className="page-title" style={{ margin: 0 }}>
              User Profile
            </h2>
          </div>

          {/* Profile Card Banner */}
          <div
            style={{
              background: "var(--bg-card)",
              padding: "30px",
              borderRadius: "24px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              textAlign: "center",
              marginBottom: "30px",
            }}
          >
            {/* User Avatar */}
            <div
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
                fontWeight: 700,
                color: "white",
                margin: "0 auto 15px auto",
                boxShadow: "0 8px 24px rgba(99, 102, 241, 0.3)",
              }}
            >
              {selectedPublicUser.profilePicture ? (
                <img
                  src={selectedPublicUser.profilePicture}
                  alt="Avatar"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                selectedPublicUser.firstName.charAt(0).toUpperCase()
              )}
            </div>

            {/* User Name & Handle */}
            <h3
              style={{
                fontSize: "1.5rem",
                color: "#f8fafc",
                margin: "0 0 5px 0",
              }}
            >
              {selectedPublicUser.firstName} {selectedPublicUser.lastName}
            </h3>
            <p
              style={{
                color: "#6366f1",
                fontWeight: 600,
                fontSize: "1rem",
                margin: "0 0 20px 0",
              }}
            >
              @{selectedPublicUser.username}
            </p>

            {/* Dynamic Friendship Status Action Button */}
            <div style={{ maxWidth: "250px", margin: "0 auto" }}>
              {selectedPublicUser.status === "NONE" && (
                <button
                  className="primary-button"
                  onClick={() => handleSendFriendRequest(selectedPublicUser.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <UserPlus size={18} /> Add Friend
                </button>
              )}
              {selectedPublicUser.status === "SENT" && (
                <button
                  className="secondary-button"
                  disabled
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    background: "rgba(255,255,255,0.05)",
                    color: "#94a3b8",
                  }}
                >
                  <Clock size={18} /> Pending Request
                </button>
              )}
                            {selectedPublicUser.status === "RECEIVED" && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    className="primary-button"
                    style={{
                      background: "#10b981",
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "5px",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.lastAcceptTime = Date.now(); // Track accept time for ghost click protection
                      handleAcceptFriendRequest(
                        selectedPublicUser.requestId,
                        selectedPublicUser.firstName,
                      )
                    }}
                  >
                    <Check size={16} /> Accept
                  </button>
                  <button
                    className="primary-button"
                    style={{
                      background: "#ef4444",
                      color: "white",
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "5px",
                    }}
                    onClick={() =>
                      handleRejectFriendRequest(selectedPublicUser.requestId)
                    }
                  >
                    <X size={16} /> Reject
                  </button>
                </div>
              )}
               {selectedPublicUser.status === "FRIENDS" && (
                <div
                  key="friends-container"
                  style={{
                    display: "flex",
                    gap: "10px", 
                  }}
                >
                  <button
  key="friends-label"
  className="primary-button"
  style={{
    background: "#10b981",
    flex: 1, 
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    pointerEvents: "none",
  }}
>
  <UserCheck size={16} /> Friends
</button>

{/* UNFRIEND BUTTON */}
<button
  key="unfriend-action-btn"
  className="primary-button"
  style={{
    background: "#ef4444",
    color: "white",
    flex: 1, 
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
  }}
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.lastAcceptTime && Date.now() - window.lastAcceptTime < 1000) return;
    setSelectedPublicUser({...selectedPublicUser, showUnfriendConfirm: true});
  }}
>
  <UserMinus size={16} /> Unfriend
</button>
                </div>
              )}

              {/* CUSTOM UNFRIEND MODAL */}
              {selectedPublicUser.showUnfriendConfirm && (
                <div className="modal-overlay" onMouseDown={(e) => e.stopPropagation()} onClick={() => setSelectedPublicUser({...selectedPublicUser, showUnfriendConfirm: false})}>
                  <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ maxWidth: "400px", textAlign: "center" }}>
                    <div style={{ background: "rgba(239, 68, 68, 0.1)", width: "60px", height: "60px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                      <UserMinus size={30} color="#ef4444" />
                    </div>
                    <h3 style={{ color: "#f8fafc", marginBottom: "10px", fontSize: "1.2rem" }}>Unfriend @{selectedPublicUser.username}?</h3>
                    <p style={{ color: "#94a3b8", marginBottom: "25px", fontSize: "0.95rem", lineHeight: "1.5" }}>
                      Are you sure you want to remove <strong>{selectedPublicUser.firstName}</strong> from your friends list? Unfriending will also remove you from their friends list.
                    </p>
                    <div style={{ display: "flex", gap: "12px" }}>
  <button
    className="primary-button"
    style={{ background: "#ef4444", color: "white", flex: 1, padding: "12px" }}
    onClick={() => {
      setSelectedPublicUser({...selectedPublicUser, showUnfriendConfirm: false});
      handleRemoveFriend(selectedPublicUser.id, selectedPublicUser.firstName);
    }}
  >
    Yes, Unfriend
  </button>
  <button
    className="primary-button"
    style={{ background: "rgba(255, 255, 255, 0.1)", color: "white", flex: 1, padding: "12px" }}
    onClick={() => setSelectedPublicUser({...selectedPublicUser, showUnfriendConfirm: false})}
  >
    Cancel
  </button>
  
</div>
                  </div>
                </div>
              )}
            </div>
          </div>

                 {/* 👥 My Friends List Section (With Hide/Show & Modern UI) */}
        {selectedPublicUser.status === "SELF" && friendsList.length > 0 && (
          <div style={{ marginBottom: "25px" }}>
            {/* 🔽 Toggle Button */}
            <button
              style={{
                background: "rgba(99, 102, 241, 0.1)",
                color: "#818cf8",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                padding: "8px 16px",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "15px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
              onClick={() => setSelectedPublicUser({...selectedPublicUser, showFriends: !selectedPublicUser.showFriends})}
            >
              👥 My Friends ({friendsList.length})
            </button>

            {/* 📋 List of Friends (Yeh sirf tab dikhegi jab showFriends true hoga) */}
            {selectedPublicUser.showFriends && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column", /* Isko vertical list bana diya */
                  gap: "10px",
                }}
              >
                {friendsList.map((friend) => (
                  <div
                    key={friend._id}
                    onClick={() => {
                      setSelectedPublicUser({
                        id: friend._id,
                        firstName: friend.firstName,
                        lastName: friend.lastName,
                        username: friend.username,
                        profilePicture: friend.profilePicture,
                        status: "FRIENDS",
                      });
                      fetchPublicUserPosts(friend._id);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      padding: "10px 15px",
                      borderRadius: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center", /* Sab center me align */
                      gap: "15px", /* DP aur text ke darmiyan space */
                      transition: "background 0.2s",
                    }}
                  >
                    {/* DP (Left Side) */}
                    <div
                      style={{
                        width: "45px",
                        height: "45px",
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        color: "white",
                        fontSize: "1.1rem"
                      }}
                    >
                      {friend.profilePicture ? (
                        <img
                          src={friend.profilePicture}
                          alt="Avatar"
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        friend.firstName.charAt(0).toUpperCase()
                      )}
                    </div>
                    
                    {/* Names (Right Side of DP) */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ color: "#f8fafc", fontWeight: 600, fontSize: "0.95rem" }}>
                        @{friend.username}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                        {friend.firstName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 🟢 3 Privacy Tabs: Public, Friends Only, Private (Visible only on own profile "SELF") */}
        {selectedPublicUser.status === "SELF" && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              width: "100%",
              marginBottom: "25px",
            }}
          >
            {["public", "friends", "private"].map((tab) => (
              <button
                key={tab}
                onClick={() => setOwnPostPrivacyFilter(tab)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "12px",
                  border: "1px solid",
                  borderColor:
                    ownPostPrivacyFilter === tab
                      ? "rgba(99, 102, 241, 0.4)"
                      : "rgba(255, 255, 255, 0.05)",
                  background:
                    ownPostPrivacyFilter === tab
                      ? "rgba(99, 102, 241, 0.15)"
                      : "var(--bg-card)",
                  color: ownPostPrivacyFilter === tab ? "#818cf8" : "#94a3b8",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  transition: "all 0.2s ease",
                  textTransform: "capitalize",
                }}
              >
                {tab === "friends" ? "Friends Only" : tab}
              </button>
            ))}
          </div>
        )}


        {/* User Posts List Section */}
        <div>
          <h4
            style={{
              color: "#f8fafc",
              fontSize: "1.2rem",
              marginBottom: "15px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              paddingBottom: "10px",
            }}
          >
            Posts by @{selectedPublicUser.username}
          </h4>

                   {(() => {
            // 🟢 Agar apni profile ("SELF") hai toh selected tab ke mutabiq filter karein, warna normal posts dikhayein
            const displayedPosts = selectedPublicUser.status === "SELF"
              ? publicUserPosts.filter((post) => post.visibility === ownPostPrivacyFilter)
              : publicUserPosts;

            return displayedPosts.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "#94a3b8",
                }}
              >
                No posts shared by this user yet.
              </p>
            ) : (
              displayedPosts.map((post) => (
                <div
                  key={post._id}
                  style={{
                    background: "var(--bg-card)",
                    padding: "20px",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    marginBottom: "15px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          background: "#6366f1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 600,
                          color: "white",
                      }}
                      >
                        {post.author.profilePicture ? (
                          <img
                            src={post.author.profilePicture}
                            alt="Avatar"
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: "50%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          post.author.firstName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#f8fafc", fontWeight: 600 }}>
                          {post.author.firstName} {post.author.lastName}
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                          {new Date(post.createdAt).toLocaleDateString()}{" "}
                          {new Date(post.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Visibility Badge */}
                    <div
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.75rem",
                        background: "rgba(255, 255, 255, 0.05)",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {post.visibility === "public"
                        ? "🌍 Public"
                        : post.visibility === "friends"
                        ? "👥 Friends"
                        : "🔒 Private"}
                    </div>
                  </div>
                  <p
                    style={{
                      color: "#cbd5e1",
                      fontSize: "0.95rem",
                      lineHeight: "1.5",
                      margin: 0,
                    }}
                  >
                    {post.content}
                  </p>
                </div>
              ))
            );
          })()}
        </div>
      </div>
    );
  }
    // 4. MAIN SOCIAL FEED: Default view containing Search, Post Box, Friends & Feed Timeline
    return (
      <div className="view-container">
        {/* Header jisme Left par title aur Right par Deactivate button hoga */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >

          <button
            onClick={() => setShowDeactivateConfirm(true)}
            style={{
              background: "none",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#ef4444",
              padding: "8px 14px",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            🗑️ Deactivate Social
          </button>
        </div>

        {/* 🔍 Search Bar Section */}
        <div style={{ marginBottom: "20px" }}>
          <form
            onSubmit={handleFriendSearch}
            style={{ display: "flex", gap: "10px" }}
          >
            <div style={{ flex: 1, position: "relative" }}>
              <Search
                size={18}
                style={{
                  position: "absolute",
                  left: "15px",
                  top: "13px",
                  color: "#94a3b8",
                }}
              />
              <input
                className="form-input"
                placeholder="Search friends by username (e.g. John)..."
                value={friendSearchQuery}
                onChange={(e) => setFriendSearchQuery(e.target.value)}
                style={{ paddingLeft: "45px" }}
              />
            </div>
            <button
              className="primary-button"
              style={{ width: "auto", padding: "0 25px" }}
              type="submit"
              disabled={friendSearchLoading}
            >
              {friendSearchLoading ? "Searching..." : "Search"}
            </button>
          </form>

          {/* Search Error Indicator */}
          {friendSearchError && (
            <p
              style={{
                color: "#ef4444",
                fontSize: "0.85rem",
                marginTop: "8px",
                marginLeft: "5px",
              }}
            >
              ✗ {friendSearchError}
            </p>
          )}

          {/* Searched User Card (Result) */}
          {friendSearchResult && (
            <div
              style={{
                background: "rgba(99, 102, 241, 0.05)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                padding: "15px 20px",
                borderRadius: "16px",
                marginTop: "15px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <div
                  style={{
                    width: "45px",
                    height: "45px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {friendSearchResult.profilePicture ? (
                    <img
                      src={friendSearchResult.profilePicture}
                      alt="Avatar"
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    friendSearchResult.firstName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div style={{ color: "#f8fafc", fontWeight: 600 }}>
                    {friendSearchResult.firstName} {friendSearchResult.lastName}
                  </div>
                  <div
                    style={{
                      color: "#6366f1",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  >
                    @{friendSearchResult.username}
                  </div>
                </div>
              </div>

              {/* Click triggers detail profile & fetches their posts */}
              <button
                className="primary-button"
                style={{
                  width: "auto",
                  padding: "8px 18px",
                  fontSize: "0.85rem",
                  background: "#6366f1",
                }}
                onClick={() => {
                  setSelectedPublicUser(friendSearchResult);
                  fetchPublicUserPosts(friendSearchResult.id);
                  setFriendSearchResult(null);
                  setFriendSearchQuery("");
                }}
              >
                View Profile
              </button>
            </div>
          )}
        </div>

        {/* ✍️ Post Creation Card (Active/Enabled!) */}
        <div
          style={{
            background: "var(--bg-card)",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            marginBottom: "20px",
            boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
          }}
        >
          <h4 style={{ color: "#f8fafc", marginBottom: "12px" }}>
            What's on your mind, @{profile.username}?
          </h4>
          <form
            onSubmit={handleCreatePost}
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <input
              className="form-input"
              placeholder="Share updates with your friends..."
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              style={{ width: "100%" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <select
                className="form-input"
                value={postVisibility}
                onChange={(e) => setPostVisibility(e.target.value)}
                style={{
                  width: "auto",
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                <option value="public">🌍 Public</option>
                <option value="friends">👥 Friends Only</option>
                <option value="private">🔒 Private</option>
              </select>
              <button
                className="primary-button"
                style={{ width: "auto", padding: "0 25px" }}
                type="submit"
                disabled={!postContent.trim()}
              >
                Post
              </button>
            </div>
          </form>
        </div>


        {/* 📱 Social Feed Timeline Posts (Loaded dynamically) */}
        <div>
          <h4
            style={{
              color: "#f8fafc",
              fontSize: "1.1rem",
              marginBottom: "15px",
            }}
          >
            Recent Updates
          </h4>

          {feedLoading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <p style={{ color: "#94a3b8" }}>🔄 Refreshing feed...</p>
            </div>
          ) : homeFeedPosts.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "45px",
                color: "#94a3b8",
                background: "var(--bg-card)",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <Users
                size={40}
                style={{ color: "#6366f1", marginBottom: "15px" }}
              />
              <p style={{ margin: 0, fontSize: "0.95rem" }}>
                No posts to display. Search friends to grow your network!
              </p>
            </div>
          ) : (
            homeFeedPosts.map((post) => (
              <div
                key={post._id}
                style={{
                  background: "var(--bg-card)",
                  padding: "20px",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  marginBottom: "15px",
                  boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
                }}
              >
                                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between", // Dono sides par space distribute karne ke liye
                    alignItems: "flex-start",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    {/* Click avatar to open profile */}
                    <div
                      onClick={() => {
                        const isMe = post.author._id === profile.id;
                        setSelectedPublicUser({
                          id: post.author._id,
                          firstName: post.author.firstName,
                          lastName: post.author.lastName,
                          username: post.author.username,
                          profilePicture: post.author.profilePicture,
                          status: isMe
                            ? "SELF"
                            : friendsList.some((f) => f._id === post.author._id)
                              ? "FRIENDS"
                              : "NONE",
                        });
                        fetchPublicUserPosts(post.author._id);
                      }}
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "#6366f1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      {post.author.profilePicture ? (
                        <img
                          src={post.author.profilePicture}
                          alt="Avatar"
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        post.author.firstName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div
                        onClick={() => {
                          const isMe = post.author._id === profile.id;
                          setSelectedPublicUser({
                            id: post.author._id,
                            firstName: post.author.firstName,
                            lastName: post.author.lastName,
                            username: post.author.username,
                            profilePicture: post.author.profilePicture,
                            status: isMe
                              ? "SELF"
                              : friendsList.some((f) => f._id === post.author._id)
                                ? "FRIENDS"
                                : "NONE",
                          });
                          fetchPublicUserPosts(post.author._id);
                        }}
                        style={{
                          color: "#f8fafc",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {post.author.firstName} {post.author.lastName}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                        @{post.author.username} •{" "}
                        {new Date(post.createdAt).toLocaleDateString()}{" "}
                        {new Date(post.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true ,
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Visibility Badge */}
                  <div
                    style={{
                      color: "#94a3b8",
                      fontSize: "0.75rem",
                      background: "rgba(255, 255, 255, 0.05)",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {post.visibility === "public" ? "🌍 Public" : post.visibility === "friends" ? "👥 Friends" : "🔒 Private"}
                  </div>
                </div>
                <p
                  style={{
                    color: "#cbd5e1",
                    fontSize: "0.95rem",
                    lineHeight: "1.5",
                    margin: 0,
                  }}
                >
                  {post.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="view-container">
      <h2 className="page-title">Transaction History</h2>
      <div className="history-section" style={{ marginTop: "20px" }}>
        {historyLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px",
              gap: "15px",
            }}
          >
            <div
              className="animate-spin"
              style={{
                width: "40px",
                height: "40px",
                border: "4px solid rgba(255,255,255,0.1)",
                borderTopColor: "#6366f1",
                borderRadius: "50%",
              }}
            ></div>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
              🔄 Loading transactions...
            </p>
          </div>
        ) : txHistory.length === 0 ? (
          <p style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
            No transactions yet.
          </p>
        ) : (
          txHistory.map((tx) => (
            <div
              key={tx._id}
              className="tx-row"
              style={{ cursor: "pointer", position: "relative" }}
            >
              <div
                onClick={() => {
                  setSelectedTx(tx);
                  setShowTxDetail(true);
                }}
                style={{
                  display: "flex",
                  flex: 1,
                  alignItems: "center",
                  gap: "15px",
                }}
              >
                <div
                  className={`tx-icon ${tx.type === "ADD_MONEY" ? "add" : tx.isSender ? "send" : "receive"}`}
                >
                  {tx.type === "ADD_MONEY" ? (
                    <PlusCircle size={20} />
                  ) : tx.isSender ? (
                    <Send size={20} />
                  ) : (
                    <ArrowDownCircle size={20} />
                  )}
                </div>
                <div className="tx-info">
                  <div
                    className="tx-party"
                    style={{ fontWeight: 600, color: "#f8fafc" }}
                  >
                    {tx.type === "BILL_PAYMENT"
                      ? tx.description
                      : tx.otherPartyName}
                  </div>
                  <div
                    className="tx-date"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "0.85rem",
                      color: "#94a3b8",
                    }}
                  >
                    <Clock size={14} /> {formatTime(tx.createdAt)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    className={`tx-amount ${tx.isSender ? "debit" : "credit"}`}
                  >
                    {tx.isSender ? "-" : "+"} PKR {tx.amount?.toLocaleString()}
                  </span>
                  <span
                    className="status-pill success"
                    style={{ display: "block", fontSize: "0.7rem" }}
                  >
                    Success
                  </span>
                </div>
              </div>

              {/* Split from History Feature  */}
              {tx.isSender && tx.type === "TRANSFER" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSplitForm({
                      description: `Split for ${tx.otherPartyName}`,
                      totalAmount: tx.amount.toString(),
                      friends: [{ mobileNumber: "", name: "" }],
                    });
                    setActiveTab("split");
                  }}
                  style={{
                    marginLeft: "15px",
                    background: "#6366f1",
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Users size={14} /> Split
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderBills = () => {
    const selectedTotal = activeInvoices
      .filter((inv) => selectedInvoiceIds.includes(inv.invoiceId))
      .reduce((sum, inv) => sum + inv.amount, 0);

    return (
      <div className="view-container">
        <h2 className="page-title">Pay Bills</h2>

        {/* ── STEP 1: Account Number Form ── */}
        {!billFetched && (
          <div className="mt-4">
            <div className="form-group">
              <label className="form-label">Bill Type</label>
              <select
                className="form-input"
                value={billForm.billType}
                onChange={(e) =>
                  setBillForm({ ...billForm, billType: e.target.value })
                }
                disabled={isFrozen}
              >
                <option value="Electricity Bill">⚡ Electricity Bill</option>
                <option value="Gas Bill">🔥 Gas Bill</option>
                <option value="Internet Bill">🌐 Internet Bill</option>
                <option value="Mobile Package">📱 Mobile Package</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Consumer / Account Number</label>
              <input
                className="form-input"
                placeholder="Enter 11-digit mobile number"
                value={billForm.consumerNumber}
                onChange={(e) =>
                  setBillForm({
                    ...billForm,
                    consumerNumber: e.target.value
                      .replace(/[^0-9]/g, "")
                      .slice(0, 11),
                  })
                }
                maxLength={11}
                disabled={isFrozen}
              />
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "#64748b",
                  marginTop: "6px",
                }}
              >
                Enter the 11-digit mobile number linked to your utility account
                (e.g. 03001234567)
              </p>
            </div>
            <button
              className="primary-button"
              onClick={handleFetchBillAmount}
              disabled={loading || isFrozen || !billForm.consumerNumber}
            >
              {loading ? "Fetching..." : "🔍 Fetch My Bills"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Invoices List ── */}
        {billFetched && activeInvoices.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            {/* Back button */}
            <button
              type="button"
              onClick={() => {
                setBillFetched(false);
                setActiveInvoices([]);
                setSelectedInvoiceIds([]);
              }}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#94a3b8",
                padding: "6px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                marginBottom: "15px",
                fontSize: "0.85rem",
              }}
            >
              Go Back
            </button>

            {/* ── 👤 VERIFIED BILL OWNER LAYOUT CARD ── */}
            <div
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(168,85,247,0.1) 100%)",
                border: "1px solid rgba(99,102,241,0.2)",
                padding: "16px 20px",
                borderRadius: "16px",
                marginBottom: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.92rem",
                }}
              >
                <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                  👤 Registered Owner:
                </span>
                <strong style={{ color: "#38bdf8", fontWeight: 700 }}>
                  {billOwnerName} (Verified ✅)
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.92rem",
                }}
              >
                <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                  📱 Account Number:
                </span>
                <strong style={{ color: "#f8fafc" }}>
                  {billForm.consumerNumber}
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.92rem",
                }}
              >
                <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                  🏢 Bill Category:
                </span>
                <strong style={{ color: "#f8fafc" }}>
                  {billForm.billType}
                </strong>
              </div>
            </div>

            {/* Invoice Cards */}
            {activeInvoices.map((inv) => {
              const isSelected = selectedInvoiceIds.includes(inv.invoiceId);
              const isPaid = inv.status === "PAID";
              return (
                <div
                  key={inv.invoiceId}
                  onClick={() => {
                    if (isPaid) return;
                    setSelectedInvoiceIds((prev) =>
                      prev.includes(inv.invoiceId)
                        ? prev.filter((id) => id !== inv.invoiceId)
                        : [...prev, inv.invoiceId],
                    );
                  }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 20px",
                    marginBottom: "12px",
                    borderRadius: "12px",
                    border: isPaid
                      ? "1px solid rgba(16,185,129,0.3)"
                      : isSelected
                        ? "1px solid #667eea"
                        : "1px solid rgba(255,255,255,0.1)",
                    background: isPaid
                      ? "rgba(16,185,129,0.05)"
                      : isSelected
                        ? "rgba(102,126,234,0.15)"
                        : "rgba(255,255,255,0.05)",
                    cursor: isPaid ? "default" : "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    {/* Checkbox */}
                    {!isPaid && (
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "5px",
                          border: isSelected
                            ? "none"
                            : "2px solid rgba(255,255,255,0.3)",
                          background: isSelected ? "#667eea" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && (
                          <span style={{ color: "white", fontSize: "12px" }}>
                            ✓
                          </span>
                        )}
                      </div>
                    )}
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#f8fafc",
                          fontSize: "0.95rem",
                        }}
                      >
                        {inv.billMonth}
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "#94a3b8",
                          marginTop: "2px",
                        }}
                      >
                        Due: {inv.dueDate}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: "#f8fafc",
                        fontSize: "1.05rem",
                      }}
                    >
                      PKR {inv.amount.toLocaleString()}
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "20px",
                        background: isPaid
                          ? "rgba(16,185,129,0.2)"
                          : "rgba(234,179,8,0.2)",
                        color: isPaid ? "#10b981" : "#eab308",
                      }}
                    >
                      {isPaid ? "✅ PAID" : "⏳ UNPAID"}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* ── Total & Pay Button ── */}
            {selectedInvoiceIds.length > 0 && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "16px 20px",
                  borderRadius: "12px",
                  background:
                    "linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)",
                  border: "1px solid rgba(102,126,234,0.4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "14px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>
                    {selectedInvoiceIds.length} bill(s) selected
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: "1.2rem",
                      color: "#f8fafc",
                    }}
                  >
                    Total: PKR {selectedTotal.toLocaleString()}
                  </span>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setShowBillConfirm(true)} // 🌟 Open the confirmation modal first!
                  disabled={loading || isFrozen}
                  style={{ margin: 0 }}
                >
                  {loading
                    ? "Processing..."
                    : `💳 Pay PKR ${selectedTotal.toLocaleString()}`}
                </button>
              </div>
            )}

            {/* 🌟 BILL PAYMENT CONFIRMATION MODAL */}
            {showBillConfirm && (
              <div
                className="modal-overlay"
                onClick={() => setShowBillConfirm(false)}
              >
                <div
                  className="modal-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="modal-header">
                    <h3>Confirm Bill Payment</h3>
                    <button
                      className="close-btn"
                      onClick={() => setShowBillConfirm(false)}
                    >
                      ×
                    </button>
                  </div>

                  <p
                    style={{
                      marginBottom: "20px",
                      color: "#cbd5e1",
                      lineHeight: "1.6",
                      fontSize: "0.95rem",
                    }}
                  >
                    Are you sure you want to pay **PKR{" "}
                    {selectedTotal.toLocaleString()}** for your selected **
                    {billForm.billType}**?
                  </p>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      className="primary-button"
                      style={{
                        flex: 1,
                        background:
                          "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                      }}
                      onClick={() => {
                        setShowBillConfirm(false);
                        handlePayBill();
                      }}
                      disabled={loading}
                    >
                      {loading ? "Processing..." : "Yes, Confirm Payment"}
                    </button>
                    <button
                      className="secondary-button"
                      style={{ flex: 1 }}
                      onClick={() => setShowBillConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderQR = () => {
    const startScanner = async () => {
      setQrView("scanner");
      setQrScanResult(null);
      setQrRecipient(null);
      setQrAmount("");

      // Wait for DOM to render the scanner div
      setTimeout(async () => {
        try {
          const { Html5Qrcode } = await import("html5-qrcode");
          const html5QrCode = new Html5Qrcode("qr-reader");
          window._html5QrCode = html5QrCode;

          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
              // QR scanned successfully!
              const mobile = decodedText.trim();

              await html5QrCode.stop();
              setQrScanResult(mobile);

              // Fetch recipient details
              try {
                const res = await fetch(
                  `http://192.168.43.54:5000/api/profile/mobile/${mobile}`,
                  {
                    headers: { Authorization: `Bearer ${getToken()}` },
                  },
                );
                const data = await res.json();
                if (res.ok) {
                  setQrRecipient(data);
                } else {
                  // Show the actual error message sent by the server!
                  setToast({
                    title: "Scan Error",
                    msg: data.message || `Server status code: ${res.status}`,
                    type: "error",
                  });
                  // 🟢 Safe Reset on fail
                  setQrView(null);
                  setQrScanResult(null);
                  setQrRecipient(null);
                }
              } catch (err) {
                setToast({
                  title: "Error",
                  msg: "Could not fetch user details.",
                  type: "error",
                });
                // 🟢 Safe Reset on catch exception (blocks screen freeze)
                setQrView(null);
                setQrScanResult(null);
                setQrRecipient(null);
              }
            },
            (err) => {
              /* Ignore scan errors */
            },
          );
        } catch (e) {
          setToast({
            title: "Camera Error",
            msg: "Could not access camera. Please allow camera permission.",
            type: "error",
          });
        }
      }, 300);
    };

    const stopScanner = async () => {
      try {
        if (window._html5QrCode) {
          await window._html5QrCode.stop();
          window._html5QrCode = null;
        }
      } catch (e) {
        /* ignore */
      }
      setQrView(null);
      setQrScanResult(null);
      setQrRecipient(null);
      setQrAmount("");
    };

    return (
      <div className="view-container">
        <h2 className="page-title">QR Payments</h2>

        {/* 1. TOP ACTIVE MODE BADGE: Active mode ka SINGLE badge show hoga, koi doosra extra button nahi hoga */}
        {qrView !== null && !qrScanResult && (
          <div
            style={{ display: "flex", marginBottom: "25px", marginTop: "20px" }}
          >
            {qrView === "myqr" && (
              <div
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: "bold",
                  textAlign: "center",
                  border: "1px solid #667eea",
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  letterSpacing: "0.5px",
                }}
              >
                📱 My QR Code Mode
              </div>
            )}
            {qrView === "scanner" && (
              <div
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: "bold",
                  textAlign: "center",
                  border: "1px solid #10b981",
                  background:
                    "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  color: "white",
                  letterSpacing: "0.5px",
                }}
              >
                📷 Scan QR Mode
              </div>
            )}
          </div>
        )}

        {/* 2. NEUTRAL LANDING SCREEN: Jab tak user kuch select na kare */}
        {qrView === null && !qrScanResult && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "20px",
              marginTop: "30px",
            }}
          >
            {/* Option Card 1: My QR */}
            <button
              type="button"
              onClick={() => setQrView("myqr")}
              style={{
                width: "100%",
                padding: "28px 20px",
                borderRadius: "16px",
                cursor: "pointer",
                border: "1px solid rgba(102,126,234,0.4)",
                background:
                  "linear-gradient(135deg, rgba(102,126,234,0.15) 0%, rgba(118,75,162,0.15) 100%)",
                color: "white",
                transition: "all 0.3s ease",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "20px",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "translateY(-2px)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
            >
              <span style={{ fontSize: "2.5rem" }}>📱</span>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    marginBottom: "5px",
                  }}
                >
                  My QR Code
                </div>
                <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  Show your personal QR code so others can pay you instantly
                </div>
              </div>
            </button>

            {/* Option Card 2: Scan & Pay */}
            <button
              type="button"
              onClick={startScanner}
              style={{
                width: "100%",
                padding: "28px 20px",
                borderRadius: "16px",
                cursor: "pointer",
                border: "1px solid rgba(16,185,129,0.4)",
                background:
                  "linear-gradient(135deg, rgba(5,150,105,0.15) 0%, rgba(16,185,129,0.15) 100%)",
                color: "white",
                transition: "all 0.3s ease",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: "20px",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "translateY(-2px)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
            >
              <span style={{ fontSize: "2.5rem" }}>📷</span>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    marginBottom: "5px",
                  }}
                >
                  Scan & Pay
                </div>
                <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  Scan someone's QR code to send them money instantly
                </div>
              </div>
            </button>
          </div>
        )}

        {/* 3. MY QR CODE ACTIVE SCREEN */}
        {qrView === "myqr" && !qrScanResult && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div
              style={{
                textAlign: "center",
                background: "white",
                padding: "30px",
                borderRadius: "15px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
            >
              <QRCodeSVG value={profile?.mobileNumber || ""} size={250} />
              <h3
                style={{
                  marginTop: "20px",
                  color: "#1e293b",
                  fontSize: "1.3rem",
                }}
              >
                Scan to Pay Me
              </h3>
              <p style={{ color: "#64748b" }}>
                Mobile:{" "}
                <strong style={{ color: "#667eea" }}>
                  {profile?.mobileNumber || "N/A"}
                </strong>
              </p>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                  marginTop: "10px",
                }}
              >
                Show this QR to anyone with Wallexa and they can pay you
                instantly.
              </p>
            </div>
            <button
              onClick={stopScanner}
              style={{
                marginTop: "15px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#94a3b8",
                padding: "10px 20px",
                borderRadius: "10px",
                cursor: "pointer",
                width: "100%",
                fontWeight: 600,
              }}
            >
              ✕ Back to Main Menu
            </button>
          </div>
        )}

        {/* 4. CAMERA SCANNER ACTIVE SCREEN */}
        {qrView === "scanner" && !qrScanResult && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div
              id="qr-reader"
              style={{
                width: "100%",
                borderRadius: "15px",
                overflow: "hidden",
                border: "2px solid rgba(16,185,129,0.5)",
              }}
            />
            <button
              onClick={stopScanner}
              style={{
                marginTop: "15px",
                background: "rgba(239,68,68,0.15)",
                border: "1px solid #ef4444",
                color: "#ef4444",
                padding: "10px 20px",
                borderRadius: "10px",
                cursor: "pointer",
                width: "100%",
                fontWeight: 600,
              }}
            >
              ✕ Cancel Scan
            </button>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "0.85rem",
                textAlign: "center",
                marginTop: "10px",
              }}
            >
              Point your camera at another user's Wallexa QR Code
            </p>
          </div>
        )}

        {/* 5. PAYMENT WINDOW SCREEN (Scan hone ke baad - absolutely clean & isolated) */}
        {qrScanResult && qrRecipient && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {/* Recipient Card */}
            <div
              style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.4)",
                borderRadius: "16px",
                padding: "20px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "15px" }}
              >
                <div
                  style={{
                    width: "55px",
                    height: "55px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {qrRecipient.firstName?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "1.1rem",
                      color: "#f8fafc",
                    }}
                  >
                    {qrRecipient.firstName} {qrRecipient.lastName}
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "#10b981",
                      fontWeight: 500,
                    }}
                  >
                    ✅ Verified Wallexa Account
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#94a3b8",
                      marginTop: "2px",
                    }}
                  >
                    {qrRecipient.mobileNumber}
                  </div>
                </div>
              </div>
            </div>

            {/* Amount Input */}
            <div className="form-group">
              <label className="form-label">Enter Amount (PKR)</label>
              <input
                className="form-input"
                type="text"
                placeholder="0"
                value={qrAmount}
                onChange={(e) =>
                  setQrAmount(e.target.value.replace(/[^0-9]/g, ""))
                }
                autoFocus
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "12px", marginTop: "15px" }}>
              <button
                className="primary-button"
                style={{
                  flex: 2,
                  background:
                    "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  margin: 0,
                }}
                disabled={
                  !qrAmount || Number(qrAmount) <= 0 || loading || isFrozen
                }
                onClick={() => setShowQrConfirm(true)}
              >
                {loading ? "Sending..." : `💸 Send PKR ${qrAmount || "0"}`}
              </button>
              <button
                className="secondary-button"
                style={{ flex: 1 }}
                onClick={() => {
                  setQrScanResult(null);
                  setQrRecipient(null);
                  setQrAmount("");
                  startScanner();
                }}
              >
                Re-scan
              </button>
            </div>

            <button
              onClick={stopScanner}
              style={{
                marginTop: "12px",
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#94a3b8",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                width: "100%",
                fontSize: "0.85rem",
              }}
            >
              ✕ Cancel & Exit
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderSplit = () => {
    try {
      return (
        <div className="view-container">
          <h2 className="page-title">Bill Splitting</h2>

          <div
            style={{
              background: "#f8fafc",
              padding: "25px",
              borderRadius: "16px",
              marginTop: "20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            }}
          >
            <h3
              style={{
                marginBottom: "20px",
                color: "#1e293b",
                borderBottom: "2px solid #e2e8f0",
                paddingBottom: "10px",
              }}
            >
              Request a Split
            </h3>
            <form onSubmit={handleRequestSplit}>
              <div className="form-group">
                <label
                  className="form-label"
                  style={{ color: "#475569", fontWeight: 600 }}
                >
                  Description (e.g. 5 Burgers)
                </label>
                <input
                  className="form-input"
                  style={{
                    background: "white",
                    color: "#1e293b",
                    borderColor: "#cbd5e1",
                  }}
                  placeholder="What is this for?"
                  value={splitForm.description}
                  onChange={(e) =>
                    setSplitForm({ ...splitForm, description: e.target.value })
                  }
                  required
                  disabled={isFrozen}
                />
              </div>
              <div className="form-group">
                <label
                  className="form-label"
                  style={{ color: "#475569", fontWeight: 600 }}
                >
                  Total Amount
                </label>
                <input
                  className="form-input"
                  style={{
                    background: "white",
                    color: "#1e293b",
                    borderColor: "#cbd5e1",
                  }}
                  type="text"
                  placeholder="10000"
                  value={splitForm.totalAmount}
                  onChange={(e) => {
                    const amt = e.target.value.replace(/[^0-9]/g, "");
                    setSplitForm({ ...splitForm, totalAmount: amt });
                  }}
                  required
                  disabled={isFrozen}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "15px",
                }}
              >
                <input
                  type="checkbox"
                  id="customSplit"
                  checked={splitForm.isCustom}
                  onChange={(e) =>
                    setSplitForm({ ...splitForm, isCustom: e.target.checked })
                  }
                />
                <label
                  htmlFor="customSplit"
                  style={{
                    fontSize: "0.9rem",
                    color: "#475569",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Enable Custom Share
                </label>
              </div>{" "}
              {/* Split Participants Card */}
              <div
                style={{
                  background: "#f8fafc",
                  padding: "20px",
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  color: "#1e293b",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "15px",
                  }}
                >
                  <h4 style={{ margin: 0, color: "#475569" }}>
                    Participants ({splitForm.friends.length})
                  </h4>
                  <button
                    type="button"
                    onClick={addFriend}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#6366f1",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <PlusCircle size={16} /> Add Person
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "15px",
                  }}
                >
                  {splitForm.friends.map((friend, index) => (
                    <div
                      key={index}
                      style={{
                        background: "white",
                        padding: "15px",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          marginBottom: "8px",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <input
                            className="form-input"
                            style={{ background: "#f1f5f9", color: "#1e293b" }}
                            placeholder="Mobile Number"
                            value={friend.mobileNumber}
                            onChange={(e) => {
                              const newFriends = [...splitForm.friends];
                              newFriends[index].mobileNumber =
                                e.target.value.replace(/[^0-9]/g, "");
                              newFriends[index].name = ""; // reset on change
                              setSplitForm({
                                ...splitForm,
                                friends: newFriends,
                              });
                            }}
                            onBlur={() =>
                              fetchFriendName(index, friend.mobileNumber)
                            }
                            required
                            disabled={isFrozen}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFriend(index)}
                          style={{
                            padding: "8px",
                            color: "#ef4444",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          <X size={20} />
                        </button>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color:
                              friend.name === "Not found"
                                ? "#ef4444"
                                : "#10b981",
                            fontWeight: 500,
                          }}
                        >
                          {friend.name || "Enter mobile to fetch name"}
                        </span>
                        {splitForm.totalAmount && (
                          <div style={{ textAlign: "right" }}>
                            {splitForm.isCustom ? (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#64748b",
                                  }}
                                >
                                  PKR
                                </span>
                                <input
                                  style={{
                                    width: "90px",
                                    padding: "6px 10px",
                                    borderRadius: "8px",
                                    border: "1px solid #cbd5e1",
                                    fontSize: "0.85rem",
                                    textAlign: "right",
                                    fontWeight: 700,
                                    color: "#6366f1",
                                  }}
                                  value={friend.amount || ""}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value.replace(
                                      /[^0-9]/g,
                                      "",
                                    );
                                    const newFriends = [...splitForm.friends];
                                    newFriends[index].amount = val;
                                    setSplitForm({
                                      ...splitForm,
                                      friends: newFriends,
                                    });
                                  }}
                                />
                              </div>
                            ) : (
                              <span
                                style={{ fontWeight: 700, color: "#6366f1" }}
                              >
                                PKR{" "}
                                {(
                                  Number(splitForm.totalAmount) /
                                  (splitForm.friends.length + 1)
                                ).toFixed(0)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: "15px",
                    padding: "10px",
                    background: "#e0e7ff",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    color: "#4338ca",
                  }}
                >
                  Each person (including you) will pay{" "}
                  <strong>
                    PKR{" "}
                    {(
                      Number(splitForm.totalAmount) /
                      (splitForm.friends.length + 1)
                    ).toLocaleString()}
                  </strong>
                </div>
              </div>
              {splitForm.totalAmount &&
                splitForm.friends.some(
                  (f) => f.name && f.name !== "User not found",
                ) &&
                !splitForm.isCustom && (
                  <div
                    style={{
                      background: "#e0e7ff",
                      padding: "15px",
                      borderRadius: "8px",
                      color: "#3730a3",
                      marginTop: "15px",
                      fontSize: "0.95rem",
                    }}
                  >
                    <strong>Split Calculation:</strong> Total PKR{" "}
                    {splitForm.totalAmount} divided by{" "}
                    {splitForm.friends.filter(
                      (f) => f.name && f.name !== "User not found",
                    ).length + 1}{" "}
                    people (including you).
                    <br />
                    Each pays automatically:{" "}
                    <strong>
                      PKR{" "}
                      {(
                        splitForm.totalAmount /
                        (splitForm.friends.filter(
                          (f) => f.name && f.name !== "User not found",
                        ).length +
                          1)
                      ).toFixed(2)}
                    </strong>
                  </div>
                )}
              <button
                type="submit"
                className="primary-button"
                style={{ marginTop: "15px" }}
                disabled={loading || isFrozen}
              >
                {loading ? "Processing..." : "Send Request"}
              </button>
            </form>
          </div>

          <h3 style={{ marginTop: "30px", color: "#1e293b" }}>
            Split Bill Requests
          </h3>
          <div style={{ marginTop: "15px" }}>
            {!splits || splits.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>No active split requests.</p>
            ) : (
              splits.map((split) => {
                if (!split || !split.initiator) return null;

                const isInitiator = split.initiator?._id === userId;
                const participants = Array.isArray(split.participants)
                  ? split.participants
                  : [];
                const myParticipantInfo = participants.find(
                  (p) => p?.userId?._id === userId,
                );

                return (
                  <div
                    key={split._id}
                    style={{
                      background: "white",
                      padding: "20px",
                      borderRadius: "16px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "20px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "start",
                        marginBottom: "15px",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "1.1rem",
                            color: "#1e293b",
                          }}
                        >
                          {split.description || "No Description"}
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#64748b",
                            marginTop: "4px",
                          }}
                        >
                          Requested by{" "}
                          <strong>
                            {isInitiator
                              ? "You"
                              : split.initiator?.firstName || "User"}
                          </strong>{" "}
                          ({split.initiator?.mobileNumber || "N/A"})
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "1.2rem",
                            color: "#6366f1",
                          }}
                        >
                          PKR {Number(split.totalAmount || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                          Total Bill
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar (NayaPay Tracking Style) */}
                    <div style={{ marginBottom: "15px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.86rem",
                          marginBottom: "8px",
                          color: "#64748b",
                        }}
                      >
                        <span>Collection Progress</span>
                        <span style={{ fontWeight: 600, color: "#10b981" }}>
                          {
                            participants.filter((p) => p.status === "ACCEPTED")
                              .length
                          }{" "}
                          paid /{" "}
                          {
                            participants.filter((p) => p.status === "PENDING")
                              .length
                          }{" "}
                          pending
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "10px",
                          background: "#f1f5f9",
                          borderRadius: "5px",
                          overflow: "hidden",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div
                          style={{
                            width: `${participants.length > 0 ? (participants.filter((p) => p.status === "ACCEPTED").length / participants.length) * 100 : 0}%`,
                            height: "100%",
                            background:
                              "linear-gradient(90deg, #10b981, #34d399)",
                            transition:
                              "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                        />
                      </div>
                    </div>

                    {!isInitiator &&
                      myParticipantInfo &&
                      myParticipantInfo.status === "PENDING" && (
                        <div
                          style={{
                            marginTop: "15px",
                            background: "#eff6ff",
                            padding: "20px",
                            borderRadius: "12px",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <p
                            style={{
                              margin: "0 0 15px 0",
                              color: "#1e40af",
                              fontSize: "0.95rem",
                              lineHeight: "1.5",
                            }}
                          >
                            <strong>
                              {split.initiator?.firstName || "User"}
                            </strong>{" "}
                            has requested that you pay{" "}
                            <strong>
                              PKR{" "}
                              {Number(
                                myParticipantInfo.amount || 0,
                              ).toLocaleString()}
                            </strong>{" "}
                            as your share for this Bill Split.
                          </p>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <button
                              className="primary-button"
                              style={{ flex: 1, padding: "10px" }}
                              onClick={() => handleAcceptSplit(split._id)}
                              disabled={loading || isFrozen}
                            >
                              {loading ? "Processing..." : "Accept & Pay"}
                            </button>
                            <button
                              className="secondary-button"
                              style={{
                                flex: 1,
                                padding: "10px",
                                color: "#ef4444",
                                borderColor: "#fca5a5",
                              }}
                              onClick={() => handleRejectSplit(split._id)}
                              disabled={loading}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}

                    <div
                      style={{
                        marginTop: "20px",
                        borderTop: "1px solid #f1f5f9",
                        paddingTop: "15px",
                      }}
                    >
                      <h5
                        style={{
                          margin: "0 0 10px 0",
                          color: "#64748b",
                          fontSize: "0.8rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Participants Status
                      </h5>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {participants.map((p, idx) => (
                          <div
                            key={idx}
                            style={{
                              fontSize: "0.85rem",
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "8px 12px",
                              borderRadius: "8px",
                              background:
                                p?.status === "ACCEPTED"
                                  ? "#ecfdf5"
                                  : p?.status === "REJECTED"
                                    ? "#fef2f2"
                                    : "#fff7ed",
                              color:
                                p?.status === "ACCEPTED"
                                  ? "#065f46"
                                  : p?.status === "REJECTED"
                                    ? "#991b1b"
                                    : "#9a3412",
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>
                              {p?.userId?.firstName || "User"}{" "}
                              {p?.userId?.lastName || ""}
                            </span>
                            <span style={{ fontWeight: 700 }}>
                              PKR {Number(p?.amount || 0).toLocaleString()} •{" "}
                              {p?.status || "PENDING"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    } catch (err) {
      console.error("RenderSplit error:", err);
      return (
        <div className="view-container">
          <h2 className="page-title">Bill Splitting</h2>
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fee2e2",
              padding: "20px",
              borderRadius: "12px",
              color: "#991b1b",
            }}
          >
            <p style={{ fontWeight: 600 }}>Feature Temporary Unavailable</p>
            <p style={{ fontSize: "0.85rem" }}>
              We encountered an error loading your split requests. This is
              likely due to some corrupted data in your transaction history.
            </p>
            <button
              className="primary-button"
              style={{ marginTop: "10px" }}
              onClick={() => fetchSplits()}
            >
              Retry Loading
            </button>
          </div>
        </div>
      );
    }
  };

  const renderProfile = () => {
    if (!profile)
      return (
        <div className="view-container">
          <p>Loading profile...</p>
        </div>
      );

    return (
      <div className="view-container">
        <h2 className="page-title">My Profile</h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: "30px",
          }}
        >
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                background: profilePicture
                  ? `url(${profilePicture})`
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
                color: "white",
                fontWeight: "bold",
                border: "4px solid white",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {!profilePicture &&
                (profile?.firstName?.[0] || "U") +
                  (profile?.lastName?.[0] || "")}
            </div>
            <label
              htmlFor="profile-pic-upload"
              style={{
                position: "absolute",
                bottom: "0",
                right: "0",
                background: "#667eea",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: "3px solid white",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              <User size={18} color="white" />
            </label>
            <input
              id="profile-pic-upload"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleProfilePictureUpload}
            />
          </div>
          <h3 style={{ marginTop: "15px", color: "#1e293b" }}>
            {profile.firstName} {profile.lastName}
          </h3>
          <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
            {profile.email}
          </p>
        </div>

        {!isEditingProfile ? (
          <div
            style={{
              marginTop: "30px",
              background: "#f8fafc",
              padding: "25px",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "grid", gap: "15px" }}>
              <InfoRow
                label="Full Name"
                value={`${profile.firstName} ${profile.midName} ${profile.lastName}`}
              />
              <InfoRow label="Email" value={profile.email} locked />
              <InfoRow
                label="Mobile Number"
                value={profile.mobileNumber}
                locked
              />
              <InfoRow label="CNIC" value={profile.cnicMasked} locked />
              <InfoRow
                label="Date of Birth"
                value={new Date(profile.dateOfBirth).toLocaleDateString()}
              />
              <InfoRow label="Nationality" value={profile.nationality} />
            </div>
            <button
              onClick={() => setIsEditingProfile(true)}
              className="primary-button"
              style={{ marginTop: "25px", width: "100%" }}
            >
              Edit Profile
            </button>
          </div>
        ) : (
          <form onSubmit={handleProfileUpdate} style={{ marginTop: "30px" }}>
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input
                className="form-input"
                value={profileForm.firstName}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    firstName: e.target.value.replace(/[^a-zA-Z\s]/g, ""),
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Middle Name (Optional)</label>
              <input
                className="form-input"
                value={profileForm.midName}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    midName: e.target.value.replace(/[^a-zA-Z\s]/g, ""),
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input
                className="form-input"
                value={profileForm.lastName}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    lastName: e.target.value.replace(/[^a-zA-Z\s]/g, ""),
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input
                className="form-input"
                type="date"
                value={profileForm.dateOfBirth}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    dateOfBirth: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nationality</label>
              <input
                className="form-input"
                value={profileForm.nationality}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    nationality: e.target.value,
                  })
                }
                required
              />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                type="submit"
                className="primary-button"
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="secondary-button"
                style={{ flex: 1 }}
              >
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
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      <span style={{ color: "#64748b", fontSize: "0.9rem" }}>{label}</span>
      <span
        style={{
          color: "#1e293b",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {value}
        {locked && <Shield size={14} color="#94a3b8" />}
      </span>
    </div>
  );

  const ArrowDownCircle = ({ size }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 12 16 16 12" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  );

  return (
    <div className="dashboard-shell">
      {/* SIDEBAR */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">WALLEXA</div>
        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === "home" ? "active" : ""}`}
            onClick={() => setActiveTab("home")}
          >
            <Home size={20} /> Dashboard
          </button>
          <button
            className={`nav-item ${activeTab === "send" ? "active" : ""}`}
            onClick={() => setActiveTab("send")}
          >
            <Send size={20} /> Send Money
          </button>
          <button
            className={`nav-item ${activeTab === "add" ? "active" : ""}`}
            onClick={() => setActiveTab("add")}
          >
            <PlusCircle size={20} /> Add Funds
          </button>
          <button
            className={`nav-item ${activeTab === "bills" ? "active" : ""}`}
            onClick={() => setActiveTab("bills")}
          >
            <Receipt size={20} /> Pay Bills
          </button>
          <button
            className={`nav-item ${activeTab === "split" ? "active" : ""}`}
            onClick={() => setActiveTab("split")}
          >
            <Users size={20} /> Split Bill
          </button>
          <button
            className={`nav-item ${activeTab === "qr" ? "active" : ""}`}
            onClick={() => setActiveTab("qr")}
          >
            <QrCode size={20} /> QR Payments
          </button>
          <button
            className={`nav-item ${activeTab === "social" ? "active" : ""}`}
            onClick={() => setActiveTab("social")}
          >
            <Share2 size={20} /> Social Feed
          </button>
          <button
            className={`nav-item ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <History size={20} /> History
          </button>
          <button
            className={`nav-item ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <User size={20} /> Profile
          </button>
          <button
            className={`nav-item`}
            onClick={() => setShowFreezeConfirm(true)}
          >
            <Shield size={20} /> {isFrozen ? "Unfreeze" : "Freeze"}
          </button>
        </nav>
        <div className="user-mini-profile">
          <div
            className="mini-avatar"
            style={{
              background: profilePicture
                ? `url(${profilePicture})`
                : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!profilePicture && user?.firstName?.[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              {user?.firstName || "User"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              {profile?.mobileNumber || "No Number"}
            </div>
          </div>
          <LogOut
            size={18}
            style={{ cursor: "pointer", color: "#ef4444" }}
            onClick={() => {
              socket?.disconnect();
              onLogout();
            }}
          />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        <header className="top-header">
          <div className="page-title" style={{ textTransform: "capitalize" }}>
            {activeTab === "home" ? "Overview" : activeTab === "social" ? "Social Feed" : activeTab}
          </div>

          <div className="header-actions">
            {/* 👤 MY SOCIAL PROFILE ICON */}
            <button
              className="notif-btn"
                         onClick={() => {
              const myUserId = profile._id || profile.id;
              if (profile.username) {
                // Agar username hai, toh Social Feed wali profile kholo
                setActiveTab("social");
                setSelectedPublicUser({
                  id: myUserId,
                  firstName: profile.displayName,
                  lastName: "",
                  username: profile.username,
                  profilePicture: profile.profilePicture,
                  status: "SELF", // SELF likhne se khud ko 'Add Friend' bhejne ka button hide ho jayega!
                });
                fetchPublicUserPosts(myUserId); // 🟢 Apni posts fetch karein!
              } else {
                  // Agar username nahi banaya toh purani normal profile kholo
                  setActiveTab("profile");
                }
              }}
              title="My Profile"
            >
              <User size={24} />
            </button>
            {/* 👤 FRIEND REQUESTS DROPDOWN BUTTON (Only visible on Social Feed tab) */}
            {activeTab === "social" && (
              <div style={{ position: "relative" }}>
                <button
                  className="notif-btn"
                  onClick={() => {
                    setShowFriendsDropdown(!showFriendsDropdown);
                    setShowNotifDropdown(false);
                  }}
                >
                  <Users size={24} />
                  {friendRequests.length > 0 && (
                    <span className="badge" style={{ background: "#ef4444" }}>
                      {friendRequests.length}
                    </span>
                  )}
                </button>

                {/* FRIEND REQUESTS DROPDOWN */}
                {showFriendsDropdown && (
                  <div
                    className="notif-dropdown"
                    style={{
                      right: 0,
                      background: "#1e293b",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      width: "300px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "15px",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          color: "#f8fafc",
                        }}
                      >
                        Friend Requests
                      </h3>
                    </div>
                    <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                      {friendRequests.length === 0 ? (
                        <p
                          style={{
                            padding: "25px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "0.9rem",
                          }}
                        >
                          No pending requests
                        </p>
                      ) : (
                        friendRequests.map((req) => (
                          <div
                            key={req._id}
                            style={{
                              padding: "12px 15px",
                              borderBottom: "1px solid rgba(255,255,255,0.05)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                cursor: "pointer",
                              }}
                                                          onClick={() => {
                              const senderId = req.sender._id || req.sender.id;
                              setSelectedPublicUser({
                                id: senderId,
                                firstName: req.sender.firstName,
                                lastName: req.sender.lastName,
                                username: req.sender.username,
                                profilePicture: req.sender.profilePicture,
                                status: "RECEIVED",
                                requestId: req._id,
                              });
                              fetchPublicUserPosts(senderId); // 🟢 Sender ki posts fetch karein!
                              setShowFriendsDropdown(false);
                            }}
                            >
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  background:
                                    "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 600,
                                  color: "white",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {req.sender.profilePicture ? (
                                  <img
                                    src={req.sender.profilePicture}
                                    alt="Avatar"
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      borderRadius: "50%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  req.sender.firstName.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <div
                                  style={{
                                    color: "#f8fafc",
                                    fontWeight: 600,
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {req.sender.firstName} {req.sender.lastName}
                                </div>
                                <div
                                  style={{
                                    color: "#6366f1",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  @{req.sender.username}
                                </div>
                              </div>
                            </div>
                           <div style={{ display: "flex", gap: "8px" }}>
  <button
    className="primary-button"
    style={{
      background: "#10b981",
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
    }}
    onClick={(e) => {
      e.stopPropagation();
      window.lastAcceptTime = Date.now();
      handleAcceptFriendRequest(req._id, req.sender.firstName); //  Uses correct request ID and sender name
    }}
  >
    <Check size={16} /> Accept
  </button>

  <button
    className="primary-button"
    style={{
      background: "#ef4444",
      color: "white",
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
    }}
    onClick={() => handleRejectFriendRequest(req._id)} //  Uses correct request ID
  >
    <X size={16} /> Reject
  </button>
</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 🔔 BELL NOTIFICATIONS BUTTON (Visible on all tabs EXCEPT Social Feed) */}
            {activeTab !== "social" && (
              <div style={{ position: "relative" }}>
                <button
                  className="notif-btn"
                  onClick={() => {
                    setShowNotifDropdown(!showNotifDropdown);
                    setShowFriendsDropdown(false);
                  }}
                >
                  <Bell size={24} />
                  {unreadCount > 0 && (
                    <span className="badge">{unreadCount}</span>
                  )}
                </button>

                {/* NOTIFICATION DROPDOWN */}
                {showNotifDropdown && (
                  <div className="notif-dropdown">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "15px",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "1rem",
                          color: "#1e293b",
                        }}
                      >
                        Notifications
                      </h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#667eea",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                      {notifications.length === 0 ? (
                        <p
                          style={{
                            padding: "30px",
                            textAlign: "center",
                            color: "#94a3b8",
                          }}
                        >
                          No notifications
                        </p>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif._id}
                            onClick={() =>
                              !notif.isRead && markAsRead(notif._id)
                            }
                            style={{
                              padding: "15px",
                              borderBottom: "1px solid #f1f5f9",
                              background: notif.isRead ? "white" : "#f8fafc",
                              cursor: notif.isRead ? "default" : "pointer",
                              transition: "background 0.2s",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "start",
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "#1e293b",
                                    fontSize: "0.9rem",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {notif.title}
                                </div>
                                <div
                                  style={{
                                    color: "#64748b",
                                    fontSize: "0.85rem",
                                    marginBottom: "6px",
                                  }}
                                >
                                  {notif.message}
                                </div>
                                <div
                                  style={{
                                    color: "#94a3b8",
                                    fontSize: "0.75rem",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <Clock size={12} />{" "}
                                  {formatTimeOnly(notif.createdAt)}
                                </div>
                              </div>
                              {!notif.isRead && (
                                <div
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "#667eea",
                                    marginTop: "6px",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {activeTab === "home" && renderHome()}
        {activeTab === "send" && renderSend()}
        {activeTab === "add" && renderAdd()}
        {activeTab === "social" && renderSocial()}
        {activeTab === "history" && renderHistory()}
        {activeTab === "bills" && renderBills()}
        {activeTab === "split" && renderSplit()}
        {activeTab === "qr" && renderQR()}
        {activeTab === "profile" && renderProfile()}

        {/* TRANSACTION DETAIL MODAL */}
        {showTxDetail && selectedTx && (
          <div className="modal-overlay" onClick={() => setShowTxDetail(false)}>
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "500px" }}
            >
              <div className="modal-header">
                <h3>Transaction Details</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowTxDetail(false)}
                >
                  ×
                </button>
              </div>
              <div style={{ padding: "20px" }}>
                <div style={{ textAlign: "center", marginBottom: "25px" }}>
                  <div
                    className={`tx-icon ${selectedTx.type === "ADD_MONEY" ? "add" : selectedTx.isSender ? "send" : "receive"}`}
                    style={{
                      width: "60px",
                      height: "60px",
                      margin: "0 auto 15px",
                    }}
                  >
                    {selectedTx.type === "ADD_MONEY" ? (
                      <PlusCircle size={30} />
                    ) : selectedTx.isSender ? (
                      <Send size={30} />
                    ) : (
                      <ArrowDownCircle size={30} />
                    )}
                  </div>
                  <h2
                    style={{
                      color: selectedTx.isSender ? "#ef4444" : "#10b981",
                      margin: "10px 0",
                    }}
                  >
                    {selectedTx.isSender ? "-" : "+"} PKR{" "}
                    {selectedTx.amount.toLocaleString()}
                  </h2>
                  <span className="status-pill success">Completed</span>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    padding: "20px",
                    borderRadius: "8px",
                  }}
                >
                  <InfoRow
                    label="Type"
                    value={
                      selectedTx.type === "ADD_MONEY"
                        ? "Funds Added"
                        : selectedTx.type === "EXTERNAL_TRANSFER"
                          ? "🏦 External Transfer"
                          : selectedTx.isSender
                            ? "Money Sent"
                            : "Money Received"
                    }
                  />
                  <InfoRow
                    label={
                      selectedTx.type === "ADD_MONEY"
                        ? "Source"
                        : selectedTx.isSender
                          ? "To"
                          : "From"
                    }
                    value={selectedTx.otherPartyName}
                  />
                  {selectedTx.otherPartyMobile && (
                    <InfoRow
                      label="Mobile"
                      value={selectedTx.otherPartyMobile}
                    />
                  )}
                  <InfoRow
                    label="Date & Time"
                    value={formatTime(selectedTx.createdAt)}
                  />
                  <InfoRow
                    label="Transaction ID"
                    value={selectedTx._id.slice(-8).toUpperCase()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FREEZE/UNFREEZE CONFIRMATION MODAL */}
        {showFreezeConfirm && (
          <div
            className="modal-overlay"
            onClick={() => setShowFreezeConfirm(false)}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  {isFrozen ? "Unfreeze Account 🔓" : "Freeze Account ❄️"}
                </h3>
                <button
                  className="close-btn"
                  onClick={() => setShowFreezeConfirm(false)}
                >
                  ×
                </button>
              </div>

              <p
                style={{
                  marginBottom: "20px",
                  color: "#cbd5e1",
                  lineHeight: "1.6",
                  fontSize: "0.95rem",
                }}
              >
                {isFrozen
                  ? "Are you sure you want to unfreeze your Wallexa account? This will restore all transaction capabilities."
                  : "Are you sure you want to freeze your Wallexa account? This will temporarily block all transfers and deposits until you unfreeze it."}
              </p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="primary-button"
                  style={{
                    flex: 1,
                    background: isFrozen ? "#10b981" : "#ef4444",
                    color: "white",
                  }}
                  onClick={() => {
                    setShowFreezeConfirm(false); // Close confirmation modal
                    requestFreeze(); // Trigger OTP and then OTP modal
                  }}
                >
                  Confirm
                </button>
                <button
                  className="secondary-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowFreezeConfirm(false)}
                >
                  Cancel
                </button>
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
                <button
                  className="close-btn"
                  onClick={() => setShowOtpModal(false)}
                >
                  ×
                </button>
              </div>
              <p style={{ marginBottom: "20px", color: "#cbd5e1" }}>
                Enter the OTP sent to your email to confirm this action.
              </p>
              <input
                className="form-input"
                style={{
                  textAlign: "center",
                  letterSpacing: "5px",
                  fontSize: "1.5rem",
                }}
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <button
                className="primary-button"
                style={{ marginTop: "20px" }}
                onClick={confirmFreeze}
              >
                Verify & Confirm
              </button>
            </div>
          </div>
        )}

        {/* PEER TO PEER SEND CONFIRMATION MODAL */}
        {showSendConfirm && (
          <div
            className="modal-overlay"
            onClick={() => setShowSendConfirm(false)}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirm Transfer</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowSendConfirm(false)}
                >
                  ×
                </button>
              </div>
              <p style={{ marginBottom: "15px", color: "#cbd5e1" }}>
                Are you sure you want to send{" "}
                <strong>PKR {sendForm.amount}</strong> to{" "}
                <strong>{sendForm.recipientName}</strong> ({sendForm.recipient}
                )?
              </p>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button
                  className="primary-button"
                  style={{ flex: 1, background: "#667eea", color: "white" }}
                  onClick={handleSend}
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Yes, Send Now"}
                </button>
                <button
                  className="secondary-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowSendConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QR PAYMENT CONFIRMATION MODAL */}
        {showQrConfirm && qrRecipient && (
          <div
            className="modal-overlay"
            onClick={() => setShowQrConfirm(false)}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirm QR Payment</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowQrConfirm(false)}
                >
                  ×
                </button>
              </div>

              <p
                style={{
                  color: "#94a3b8",
                  marginBottom: "15px",
                  fontSize: "0.9rem",
                }}
              >
                Please confirm the transfer details:
              </p>

              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  padding: "18px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Recipient:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    {qrRecipient.firstName} {qrRecipient.lastName}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Mobile:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    {qrRecipient.mobileNumber}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "12px",
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <span style={{ color: "#94a3b8", fontSize: "1.1rem" }}>
                    Amount:
                  </span>
                  <strong style={{ color: "#10b981", fontSize: "1.3rem" }}>
                    PKR {Number(qrAmount).toLocaleString()}
                  </strong>
                </div>
              </div>

              <p
                style={{
                  color: "#f59e0b",
                  fontSize: "0.8rem",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                ⚠️ This transfer is instant and cannot be reversed once
                confirmed.
              </p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="primary-button"
                  style={{
                    flex: 1,
                    background:
                      "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  }}
                  onClick={handleQrSend}
                  disabled={loading}
                >
                  {loading ? "Sending..." : "✅ Confirm & Send"}
                </button>
                <button
                  className="secondary-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowQrConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EXTERNAL BANK CONFIRMATION MODAL */}
        {showExternalConfirm && (
          <div
            className="modal-overlay"
            onClick={() => setShowExternalConfirm(false)}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirm Bank Transfer</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowExternalConfirm(false)}
                >
                  ×
                </button>
              </div>

              <p
                style={{
                  color: "#94a3b8",
                  marginBottom: "15px",
                  fontSize: "0.9rem",
                }}
              >
                Please verify the transfer details before confirming:
              </p>

              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  padding: "18px",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Destination Bank:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    {externalForm.bankName}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Account Number:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    {"•".repeat(
                      Math.max(0, externalForm.accountNumber.length - 4),
                    )}
                    {externalForm.accountNumber.slice(-4)}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    paddingTop: "12px",
                    borderTop: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <span style={{ color: "#94a3b8", fontSize: "1.1rem" }}>
                    Amount:
                  </span>
                  <strong style={{ color: "#10b981", fontSize: "1.3rem" }}>
                    PKR {Number(externalForm.amount).toLocaleString()}
                  </strong>
                </div>
              </div>

              <p
                style={{
                  color: "#f59e0b",
                  fontSize: "0.8rem",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                ⚠️ This transaction will be validated via Stripe API and cannot
                be reversed once confirmed.
              </p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="primary-button"
                  style={{
                    flex: 1,
                    background:
                      "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  }}
                  onClick={handleExternalTransfer}
                  disabled={loading}
                >
                  {loading ? "Sending..." : "✅ Confirm Transfer"}
                </button>
                <button
                  className="secondary-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowExternalConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DEACTIVATE SOCIAL CONFIRMATION MODAL */}
        {showDeactivateConfirm && (
          <div
            className="modal-overlay"
            onClick={() => setShowDeactivateConfirm(false)}
          >
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ color: "#ef4444" }}>
                  Deactivate Social Profile 🗑️
                </h3>
                <button
                  className="close-btn"
                  onClick={() => setShowDeactivateConfirm(false)}
                >
                  ×
                </button>
              </div>

              <p
                style={{
                  marginBottom: "20px",
                  color: "#cbd5e1",
                  lineHeight: "1.6",
                  fontSize: "0.95rem",
                }}
              >
                Are you sure you want to deactivate your Wallexa Social Profile?
                This will delete your username, hide your profile from your
                friends, and reset your social feed. You can reactivate it
                anytime.
              </p>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="primary-button"
                  style={{ flex: 1, background: "#ef4444", color: "white" }}
                  onClick={() => {
                    setShowDeactivateConfirm(false); // Close confirmation modal
                    confirmDeactivateSocial(); // Trigger deactivation API
                  }}
                  disabled={loading}
                >
                  {loading ? "Deactivating..." : "Confirm & Delete"}
                </button>
                <button
                  className="secondary-button"
                  style={{ flex: 1 }}
                  onClick={() => setShowDeactivateConfirm(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: "30px",
              right: "30px",
              background:
                toast.type === "error"
                  ? "#ef4444"
                  : toast.type === "success"
                    ? "#10b981"
                    : "#3b82f6",
              color: "white",
              padding: "15px 25px",
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              animation: "slideIn 0.3s ease-out",
              zIndex: 10000,
            }}
          >
            <strong>{toast.title}</strong>: {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
