import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Heart, //   Heart icon add kiya
  Eye,
  EyeOff,
  Edit2,
  Lock,
  MessageCircle,
  MoreVertical,
} from "lucide-react";
import "./Css/ModernDashboard.css";

const SOCKET_URL = "https://mern-auth1-qnmh.onrender.com";

const REACTION_TYPES = ["like", "love", "haha", "sad", "angry"];
const REACTION_EMOJIS = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  sad: "😢",
  angry: "😠",
};
const REACTION_LABELS = {
  like: "Like",
  love: "Love",
  haha: "Haha",
  sad: "Sad",
  angry: "Angry",
};
const REACTION_COLORS = {
  like: "#60a5fa",
  love: "#f43f5e",
  haha: "#fbbf24",
  sad: "#60a5fa",
  angry: "#f97316",
};

const getReactionUserId = (reaction) =>
  String(reaction?.user?._id || reaction?.user || "");

const findMyReaction = (reactions, userId) =>
  (reactions || []).find((r) => getReactionUserId(r) === String(userId));

const getEntityUserId = (entity) =>
  String(entity?._id || entity?.id || entity || "");

const isReceiptPostContent = (content) =>
  typeof content === "string" && content.includes("[RECEIPT_POST]");

const getReceiptFromPostContent = (content) => {
  const jsonStr = content.replace("[RECEIPT_POST]", "").trim();
  return JSON.parse(jsonStr);
};

const getPostEditableText = (content) => {
  if (isReceiptPostContent(content)) {
    try {
      const receipt = getReceiptFromPostContent(content);
      return receipt.caption || "";
    } catch {
      return "";
    }
  }
  return content || "";
};

const buildPostContentAfterEdit = (originalContent, editedText) => {
  const trimmed = editedText.replace(/\s+/g, " ").trim().replace(/<[^>]*>/g, "");
  if (isReceiptPostContent(originalContent)) {
    const receipt = getReceiptFromPostContent(originalContent);
    return `[RECEIPT_POST]\n${JSON.stringify({ ...receipt, caption: trimmed })}`;
  }
  return trimmed;
};

const computeOptimisticReactions = (reactions, userId, type, meta) => {
  const uid = String(userId);
  const list = reactions || [];
  const existing = list.filter((r) => getReactionUserId(r) === uid);
  const withoutUser = list.filter((r) => getReactionUserId(r) !== uid);

  if (existing.length > 0 && existing[0].type === type) {
    return withoutUser;
  }

  return [
    ...withoutUser,
    {
      user: userId,
      type,
      displayName: meta.displayName,
      profilePicture: meta.profilePicture,
    },
  ];
};

// Security Masking Helper for mobile/account numbers
const maskInfo = (val) => {
  if (!val) return "";
  const str = String(val).trim();
  if (str.length <= 4) return str;
  // Don't mask Stripe payment card/source names
  if (str.toLowerCase().includes("visa") || str.toLowerCase().includes("mastercard")) {
    return str;
  }
  return `**** ${str.slice(-4)}`;
};

// Transaction ID Masking Helper
const maskTxId = (txId) => {
  if (!txId) return "N/A";
  const str = String(txId).trim();
  if (str.length <= 12) return str;
  return `${str.slice(0, 6)}...${str.slice(-6)}`;
};

// Helper: Format history transaction data for receipt sharing
const mapTxToReceiptData = (tx, profile) => {
  return {
    transactionId: tx._id,
    date: tx.createdAt,
    amount: tx.amount,
    description: tx.description || "",
    senderName:
      tx.type === "SEND" ||
      tx.type === "EXTERNAL_TRANSFER" ||
      tx.type === "BILL_PAYMENT"
        ? tx.isSender
          ? `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim()
          : tx.otherPartyName
        : tx.type === "ADD_MONEY"
          ? "Stripe Payment Gateway"
          : tx.otherPartyName,
    senderMobile:
      tx.type === "SEND" ||
      tx.type === "EXTERNAL_TRANSFER" ||
      tx.type === "BILL_PAYMENT"
        ? tx.isSender
          ? profile?.mobileNumber
          : tx.otherPartyMobile
        : tx.type === "ADD_MONEY"
          ? "Visa / Mastercard"
          : tx.otherPartyMobile,
    receiverName:
      tx.type === "SEND" ||
      tx.type === "EXTERNAL_TRANSFER" ||
      tx.type === "BILL_PAYMENT"
        ? tx.isSender
          ? tx.otherPartyName
          : `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim()
        : tx.type === "ADD_MONEY"
          ? `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim()
          : `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
    receiverMobile:
      tx.type === "SEND" ||
      tx.type === "EXTERNAL_TRANSFER" ||
      tx.type === "BILL_PAYMENT"
        ? tx.isSender
          ? tx.otherPartyMobile
          : profile?.mobileNumber
        : tx.type === "ADD_MONEY"
          ? profile?.mobileNumber
          : profile?.mobileNumber,
    type: tx.type === "SEND" ? "P2P_TRANSFER" : tx.type,
  };
};

// Helper: Render status posts with receipt cards embedded inside feed
const renderPostContent = (
  content,
  defaultColor = "#cbd5e1",
  options = {},
) => {
  const { compact = false } = options;
  const getReceiptTypeLabel = (type) => {
    if (type === "EXTERNAL_TRANSFER") return "Local Bank Transfer";
    if (type === "ADD_MONEY") return "Wallet Deposit";
    if (type === "BILL_PAYMENT") return "Utility Bill Payment";
    if (type === "SPLIT_PAYMENT") return "Split Bill Payment";
    if (type === "QR_PAYMENT") return "Scan & Pay (QR)";
    return "Wallexa P2P Transfer";
  };

  // Robust check: matches even if there are spaces or newlines
  if (content.includes("[RECEIPT_POST]")) {
    try {
      const jsonStr = content.replace("[RECEIPT_POST]", "").trim();
      const receipt = JSON.parse(jsonStr);

      if (compact) {
        return (
          <div>
            {receipt.caption && (
              <p
                style={{
                  color: defaultColor,
                  fontSize: "0.9rem",
                  lineHeight: "1.5",
                  marginBottom: "10px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {receipt.caption}
              </p>
            )}
            <div
              style={{
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                borderRadius: "12px",
                padding: "10px 12px",
                color: "#cbd5e1",
                fontSize: "0.85rem",
              }}
            >
              <strong style={{ color: "#e2e8f0" }}>
                {getReceiptTypeLabel(receipt.type)}
              </strong>
              {" · "}
              PKR {Number(receipt.amount).toLocaleString()}
            </div>
          </div>
        );
      }

      // Don't mask Stripe source method
      const displaySenderMobile = String(receipt.senderMobile).includes("Visa")
        ? receipt.senderMobile
        : maskInfo(receipt.senderMobile);

      const displayReceiverMobile = maskInfo(receipt.receiverMobile);

      return (
        <div>
          {receipt.caption && (
            <p
              style={{
                color: defaultColor,
                fontSize: "0.95rem",
                lineHeight: "1.5",
                marginBottom: "12px",
                whiteSpace: "pre-wrap",
              }}
            >
              {receipt.caption}
            </p>
          )}

          {/* Premium Graphical Receipt Slip */}
          <div
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
              borderRadius: "20px",
              border: "1px solid rgba(99, 102, 241, 0.18)",
              padding: "20px",
              textAlign: "left",
              boxShadow: "0 15px 30px rgba(0,0,0,0.4)",
              position: "relative",
              overflow: "hidden",
              marginTop: "8px",
            }}
          >
            {/* Glowing ambient light inside card */}
            <div
              style={{
                position: "absolute",
                top: "-40px",
                right: "-40px",
                width: "120px",
                height: "120px",
                background: "rgba(99, 102, 241, 0.15)",
                borderRadius: "50%",
                filter: "blur(35px)",
                pointerEvents: "none",
              }}
            />

            {/* Card Header: Type Title & Success Badge */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                paddingBottom: "12px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                             <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>
                {getReceiptTypeLabel(receipt.type)}
              </span>
              </div>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  color: "#10b981",
                  padding: "3px 8px",
                  borderRadius: "20px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                ? Success
              </span>
            </div>

            {/* Amount Display Block */}
            <div style={{ marginBottom: "20px", textAlign: "center" }}>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Amount
              </span>
              <div
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 800,
                  color: "#10b981",
                  marginTop: "2px",
                }}
              >
                PKR {Number(receipt.amount).toLocaleString()}
              </div>
            </div>

            {/* Details List */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                fontSize: "0.85rem",
                color: "#94a3b8",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>From:</span>
                <span style={{ color: "#e2e8f0", fontWeight: 500 }}>
                  {receipt.senderName}{" "}
                  {displaySenderMobile && (
                    <span style={{ color: "#64748b", fontSize: "0.78rem" }}>
                      ({displaySenderMobile})
                    </span>
                  )}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>To:</span>
                <span style={{ color: "#e2e8f0", fontWeight: 500 }}>
                  {receipt.receiverName}{" "}
                  {displayReceiverMobile && (
                    <span style={{ color: "#64748b", fontSize: "0.78rem" }}>
                      ({displayReceiverMobile})
                    </span>
                  )}
                </span>
              </div>
              {receipt.description && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px dashed rgba(255,255,255,0.06)",
                    paddingTop: "8px",
                    marginTop: "4px",
                  }}
                >
                  <span>Description:</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 500, textAlign: "right" }}>
                    {receipt.description}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px dashed rgba(255,255,255,0.06)",
                  paddingTop: "8px",
                  marginTop: "4px",
                }}
              >
                <span>Transaction ID:</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    color: "#cbd5e1",
                    fontSize: "0.8rem",
                  }}
                >
                  {receipt.transactionId}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    } catch (e) {
      return (
        <p
          style={{
            color: defaultColor,
            fontSize: "0.95rem",
            lineHeight: "1.5",
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </p>
      );
    }
  }
  return (
    <p
      style={{
        color: defaultColor,
        fontSize: "0.95rem",
        lineHeight: "1.5",
        margin: 0,
        whiteSpace: "pre-wrap",
      }}
    >
      {content}
    </p>
  );
};

export default function Dashboard({ userData, onLogout }) {
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState("home"); // home, send, add, history, profile
  const [sidebarOpen, setSidebarOpen] = useState(false);


    // Change Password States
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdAttempts, setPwdAttempts] = useState(0);
  const [pwdLocked, setPwdLocked] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrentPwdInput, setShowCurrentPwdInput] = useState(false);
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
  // Transaction PIN States
  const [isPinSet, setIsPinSet] = useState(true); // Default true taake load hote hi screen flash na kare
  const [setupPin, setSetupPin] = useState("");
  const [mustResetPin, setMustResetPin] = useState(false); // Force PIN change track karne ke liye
  const [forgotPinIdentifier, setForgotPinIdentifier] = useState(""); // User se input lene ke liye
  const [focusedPinField, setFocusedPinField] = useState("setup");
  const [focusedForgotPinField, setFocusedForgotPinField] = useState("new");
  const [confirmPin, setConfirmPin] = useState("");
  const [showSetupPinVal, setShowSetupPinVal] = useState(false);
  const [showConfirmPinVal, setShowConfirmPinVal] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  // Transaction verification PIN States
  const [showPinModal, setShowPinModal] = useState(false);
  const [transactionPinCode, setTransactionPinCode] = useState("");
  const [verifiedPin, setVerifiedPin] = useState(""); // Stores successfully typed PIN for the OTP phase
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [showForgotPinModal, setShowForgotPinModal] = useState(false); // Forgot PIN Trigger
  // Forgot PIN Wizard States
  const [forgotPinStep, setForgotPinStep] = useState(1); // 1: Password, 2: OTP, 3: New PIN
  const [forgotPinPassword, setForgotPinPassword] = useState("");
  const [forgotPinOtp, setForgotPinOtp] = useState("");
  const [forgotPinNewPin, setForgotPinNewPin] = useState("");
  const [forgotPinConfirmPin, setForgotPinConfirmPin] = useState("");
  const [forgotPinError, setForgotPinError] = useState("");
  const [forgotPinLoading, setForgotPinLoading] = useState(false);
  const [showForgotPinVal, setShowForgotPinVal] = useState(false);
  const [showForgotConfirmPinVal, setShowForgotConfirmPinVal] = useState(false);
  const [pinWizardMode, setPinWizardMode] = useState("change");
  const [changePinCurrent, setChangePinCurrent] = useState("");
  const [showChangePinVal, setShowChangePinVal] = useState(false);
  const [failedPinAttempts, setFailedPinAttempts] = useState(0);
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
  const [editingField, setEditingField] = useState(null); // 'name', 'dob', 'nationality', or null
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
    bankName: "",
    accountNumber: "",
    amount: "",
  });
  const [externalMode, setExternalMode] = useState("local"); //   Naya state variable mode toggle ke liye
  const [showExternalConfirm, setShowExternalConfirm] = useState(false);
  const [validatedAccountHolder, setValidatedAccountHolder] = useState("");
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false); //   Custom dropdown toggle state
  const [addForm, setAddForm] = useState({
    amount: "",
    method: "card",
    cardNumber: "",
    expiry: "",
    cvc: "",
  });
  const [otp, setOtp] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState("freeze"); //   Tracks modal purpose ("freeze" or "transaction")
  const [pendingTx, setPendingTx] = useState(null); //   Stores pending transaction info temporarily
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
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [showShareFeedModal, setShowShareFeedModal] = useState(false);
  const [shareFeedCaption, setShareFeedCaption] = useState("");
  const [shareFeedVisibility, setShareFeedVisibility] = useState("public");
  //   Social Onboarding States
  const [socialStep, setSocialStep] = useState(1); // 1 = Activation Consent, 2 = Choose Username
  const [usernameInput, setUsernameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isUsernameAvailable, setIsUsernameAvailable] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  //   Friends, Public Profile, & Social Feed States
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState([]);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendSearchError, setFriendSearchError] = useState("");
  const [friendRequests, setFriendRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);

  // Public Profile and Posts
  const [postVisibility, setPostVisibility] = useState("friends");
  const [selectedPublicUser, setSelectedPublicUser] = useState(null); // Jab hum kisi user ki profile details screen kholenge
  const [ownPostPrivacyFilter, setOwnPostPrivacyFilter] = useState("public"); //   Own profile tabs filter state (Default to public)
  const [showRequestsModal, setShowRequestsModal] = useState(false); //   Requests popup show/hide control
  const [activeCommentPost, setActiveCommentPost] = useState(null); //   Comments bottom sheet control
  const [commentText, setCommentText] = useState(""); //   Comment input text field
  const [commentSubmitting, setCommentSubmitting] = useState(false); //   Double submission block karne ke liye
  const [openCommentMenuId, setOpenCommentMenuId] = useState(null); //   Comment 3-dot menu
  const [openPostMenuId, setOpenPostMenuId] = useState(null); //   Post 3-dot menu (delete own post)
  const [editingCommentId, setEditingCommentId] = useState(null); //   Comment edit mode
  const [editingCommentText, setEditingCommentText] = useState(""); //   Comment edit text
  const [editingPostId, setEditingPostId] = useState(null); //   Post edit mode
  const [editingPostText, setEditingPostText] = useState(""); //   Post edit text
  const [editingPostOriginalContent, setEditingPostOriginalContent] =
    useState(""); //   Original post content (for receipt caption edits)
  const [confirmDialog, setConfirmDialog] = useState(null); //   Custom confirm modal
  const [reactionSubmittingPostId, setReactionSubmittingPostId] = useState(null); //   Prevents duplicate fast reaction clicks per post
  const [hoveredPostReactId, setHoveredPostReactId] = useState(null); //   Reaction picker popup show/hide control (desktop hover)
  const [activePostReactPickerId, setActivePostReactPickerId] = useState(null); //   Reaction picker open via tap/click (mobile + desktop)
  const [activeReactionsPost, setActiveReactionsPost] = useState(null); //   Reactions popup modal control
  const [reactionsFilterTab, setReactionsFilterTab] = useState("all"); //   Active reactions filter tab ('all' | 'like' | 'love' etc)
  const [publicUserPosts, setPublicUserPosts] = useState([]); // Viewed user ke posts display karne ke liye
  const [homeFeedPosts, setHomeFeedPosts] = useState([]); // Main timeline feed posts
  const [postContent, setPostContent] = useState(""); // Status update box content
  const [feedLoading, setFeedLoading] = useState(true); // Feed load spinner control

  // Chat States
  const [socialView, setSocialView] = useState("feed"); // "feed" | "messages"
  const [chatView, setChatView] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [totalUnreadMessages, setTotalUnreadMessages] = useState(0);
  // Messages screen search (friends only)
  const [msgSearchQuery, setMsgSearchQuery] = useState("");
  const [msgSearchResults, setMsgSearchResults] = useState([]);
  const [msgSearchError, setMsgSearchError] = useState("");
  const [msgSearchLoading, setMsgSearchLoading] = useState(false);

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

  //   Auto-Reset All Forms & Modals when active tab or sub-tab changes (For Security & Premium UX)
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

    // 6. Reset External Bank Form States
    setExternalForm({ bankName: "", accountNumber: "", amount: "" }); //   Clear input fields
    setExternalMode("local"); //   Reset to local mode
    setValidatedAccountHolder(""); //   Clear account holder name
    setShowExternalConfirm(false);
    setShowFreezeConfirm(false);
  }, [activeTab, sendType]); //   `sendType` parameter add kiya taake sub-tabs par bhi trigger ho

  //   Cleanup camera stream on Dashboard component unmount
  useEffect(() => {
    return () => {
      try {
        if (window._html5QrCode) {
          window._html5QrCode
            .stop()
            .then(() => {
              window._html5QrCode = null;
            })
            .catch(() => {});
        }
      } catch (e) {
        /* ignore */
      }
    };
  }, []);
  const getReceiptPdfOptions = (filename) => ({
    margin: 10,
    filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#1e293b",
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  });

  const waitForLayout = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

  const downloadPdfBlob = (pdfBlob, filename) => {
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const withReceiptPdfCapture = async (elementId, callback) => {
    const element = document.getElementById(elementId);
    if (!element) return null;

    const overlay = element.closest(".modal-overlay");
    const noPrintElements = [...element.querySelectorAll(".no-print")];
    const hiddenDisplays = noPrintElements.map((el) => el.style.display);
    const previousMaxHeight = element.style.maxHeight;
    const previousOverflow = element.style.overflow;
    const previousBackdrop = overlay?.style.backdropFilter ?? "";

    noPrintElements.forEach((el) => {
      el.style.display = "none";
    });
    element.style.maxHeight = "none";
    element.style.overflow = "visible";
    if (overlay) overlay.style.backdropFilter = "none";

    await waitForLayout();

    try {
      return await callback(element);
    } finally {
      noPrintElements.forEach((el, index) => {
        el.style.display = hiddenDisplays[index];
      });
      element.style.maxHeight = previousMaxHeight;
      element.style.overflow = previousOverflow;
      if (overlay) overlay.style.backdropFilter = previousBackdrop;
    }
  };

  const handleDownloadPdf = async (
    elementId,
    filename = "transaction_receipt.pdf",
  ) => {
    await withReceiptPdfCapture(elementId, (element) =>
      window
        .html2pdf()
        .set(getReceiptPdfOptions(filename))
        .from(element)
        .save(),
    );
  };

  const handleSharePdf = async (
    elementId,
    filename = "transaction_receipt.pdf",
  ) => {
    const pdfBlob = await withReceiptPdfCapture(elementId, (element) =>
      window
        .html2pdf()
        .set(getReceiptPdfOptions(filename))
        .from(element)
        .output("blob"),
    );

    if (!pdfBlob) return;

    const file = new File([pdfBlob], filename, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: "Wallexa Transaction Receipt",
        text: "Please find attached my payment receipt.",
      });
    } else {
      downloadPdfBlob(pdfBlob, filename);
      setToast({
        title: "PDF Downloaded",
        msg: "File sharing is not supported on this device. PDF has been saved instead.",
        type: "info",
      });
    }
  };
    // --- INITIALIZATION ---
  const getToken = () => userData?.token || localStorage.getItem("userToken");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/dashboard",
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance);
        setIsFrozen(data.isFrozen);
        setIsPinSet(data.isPinSet); // Sync PIN status from database
        setMustResetPin(data.mustResetPin); // Force reset flag ko sync karein
        setFailedPinAttempts(data.failedPinAttempts || 0);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/wallet/history", {
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
  //   Create a ref for activeTab so that Socket listener can read its latest value safely
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  //   Trigger fetchHistory when user switches to 'history' tab
  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/notifications",
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
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/profile", {
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
        onLogout(); //   Token invalid ho ya user deleted ho toh safe log out kar dein
      }
    } catch (e) {
      console.error(e);
    }
  }, [onLogout]);

  const fetchSplits = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/get-splits",
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

  //   Friends List fetch karna
  const fetchFriends = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/profile/friends", {
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

  //   Pending incoming friend requests fetch karna
  const fetchFriendRequests = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/friend-requests",
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
      setFeedLoading(false); //   Token na ho toh loading status band karein
      return;
    }
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/posts/feed",
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
  }, []);

    // Chat functions
  const fetchConversations = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/profile/chat/conversations", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        // Number of conversations with unread messages
        setTotalUnreadMessages(data.filter((c) => c.unread > 0).length);
      }
    } catch (e) {
      console.error("Error fetching conversations", e);
    }
  }, []);

  const openChatWith = useCallback(async (friend) => {
    const t = getToken();
    if (!t) return;
    const friendId = friend.id || friend._id || friend.friendId;
    const isDeactivated = friend.isDeactivated === true;
    const isFriend = isDeactivated
      ? false
      : friend.isFriend !== undefined
        ? friend.isFriend
        : friendsList.some((f) => f._id === friendId);
    setChatView({
      id: friendId,
      firstName: isDeactivated ? "Account Deactivated" : friend.firstName,
      lastName: isDeactivated ? "" : friend.lastName,
      username: isDeactivated ? null : friend.username,
      profilePicture: isDeactivated ? null : friend.profilePicture,
      isFriend,
      isDeactivated,
    });
    setSocialView("messages");
    try {
      const res = await fetch(`https://mern-auth1-qnmh.onrender.com/api/profile/chat/${friendId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
        fetchConversations();
      }
    } catch (e) {
      console.error("Error fetching chat messages", e);
    }
  }, [fetchConversations, friendsList]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !chatView || chatSending || chatView.isFriend === false || chatView.isDeactivated) return;
    const t = getToken();
    const friendId = chatView.id || chatView._id || chatView.friendId;
    setChatSending(true);
    try {
      const res = await fetch(`https://mern-auth1-qnmh.onrender.com/api/profile/chat/${friendId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ content: chatInput.trim() }),
      });
      if (res.ok) setChatInput("");
    } catch (e) {
      console.error("Error sending message", e);
    } finally {
      setChatSending(false);
    }
  };

    // Mark messages as read when chat is open
  const markChatAsRead = useCallback(async (friendId) => {
    const t = getToken();
    if (!t || !friendId) return;
    try {
      await fetch(`https://mern-auth1-qnmh.onrender.com/api/profile/chat/${friendId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      fetchConversations();
    } catch (e) {
      console.error("Error marking chat as read", e);
    }
  }, [fetchConversations]);

  // Keep chat messaging enabled/disabled in sync when friendship changes (no refresh needed)
  useEffect(() => {
    const friendIdSet = new Set(friendsList.map((f) => String(f._id)));

    setChatView((prev) => {
      if (!prev) return prev;
      const pid = String(prev.id || prev._id || prev.friendId);
      const nowFriend = friendIdSet.has(pid);
      if (prev.isFriend === nowFriend) return prev;
      return { ...prev, isFriend: nowFriend };
    });

    setConversations((prev) =>
      prev.map((c) => {
        const nowFriend = friendIdSet.has(String(c.friendId));
        if (c.isFriend === nowFriend) return c;
        return { ...c, isFriend: nowFriend };
      })
    );
  }, [friendsList]);

  // Messages screen: friend search (friends only)
  const handleMsgFriendSearch = async (e) => {
    e?.preventDefault();
    if (!msgSearchQuery.trim()) return;
    setMsgSearchLoading(true);
    setMsgSearchError("");
    setMsgSearchResults([]);
    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/search?q=${encodeURIComponent(msgSearchQuery.trim())}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await res.json();
      if (res.ok) {
        setMsgSearchResults(data.results || []);
        if ((data.results || []).length === 0) {
          setMsgSearchError("No users found.");
        }
      } else {
        setMsgSearchError(data.message || "No users found.");
      }
    } catch {
      setMsgSearchError("Network error while searching.");
    } finally {
      setMsgSearchLoading(false);
    }
  };

  //   Kisi specific searched user ke posts fetch karna public profile display ke liye
  const fetchPublicUserPosts = async (userId) => {
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [postsRes, profileRes] = await Promise.all([
        fetch(
          `https://mern-auth1-qnmh.onrender.com/api/profile/posts/user/${userId}`,
          { headers },
        ),
        fetch(`https://mern-auth1-qnmh.onrender.com/api/profile/${userId}`, {
          headers,
        }),
      ]);

      if (postsRes.ok) {
        setPublicUserPosts(await postsRes.json());
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setSelectedPublicUser((prev) =>
          prev && String(prev.id) === String(userId)
            ? {
                ...prev,
                username: profileData.username || prev.username,
                firstName: profileData.firstName || prev.firstName,
                profilePicture:
                  profileData.profilePicture || prev.profilePicture,
              }
            : prev,
        );
      }
    } catch (e) {
      console.error("Error fetching user posts", e);
    }
  };

  //   Friends Search Bar submit handler (name + username)
  const handleFriendSearch = async (e) => {
    e?.preventDefault();
    if (!friendSearchQuery.trim()) return;
    setFriendSearchLoading(true);
    setFriendSearchError("");
    setFriendSearchResults([]);
    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/search?q=${encodeURIComponent(friendSearchQuery.trim())}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setFriendSearchResults(data.results || []);
        if ((data.results || []).length === 0) {
          setFriendSearchError("No users found.");
        }
      } else {
        setFriendSearchError(data.message || "No users found.");
      }
    } catch {
      setFriendSearchError("Network error while searching.");
    } finally {
      setFriendSearchLoading(false);
    }
  };

  //   Send Friend Request (Updated with Instant UI Optimistic Update)
  const handleSendFriendRequest = async (recipientId) => {
    // 1. Back up current state in case of failure
    const prevSearchResults = friendSearchResults;
    const prevSelectedUser = selectedPublicUser;

    // 2. Optimistic Update: Instantly change UI status to SENT (No Delay!)
    setFriendSearchResults((prev) =>
      prev.map((u) =>
        u.id === recipientId ? { ...u, status: "SENT" } : u
      )
    );
    if (selectedPublicUser && selectedPublicUser.id === recipientId) {
      setSelectedPublicUser((prev) => ({ ...prev, status: "SENT" }));
    }

    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/friend-request/send",
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
        setFriendSearchResults((prev) =>
          prev.map((u) =>
            u.id === recipientId
              ? { ...u, status: "SENT", requestId: data.requestId }
              : u
          )
        );
        if (selectedPublicUser && selectedPublicUser.id === recipientId) {
          setSelectedPublicUser({
            ...selectedPublicUser,
            status: "SENT",
            requestId: data.requestId,
          });
        }
      } else {
        // Rollback to old state if request fails
        setFriendSearchResults(prevSearchResults);
        setSelectedPublicUser(prevSelectedUser);
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      // Rollback to old state if network fails
      setFriendSearchResults(prevSearchResults);
      setSelectedPublicUser(prevSelectedUser);
      setToast({
        title: "Error",
        msg: "Network error sending request.",
        type: "error",
      });
    }
  };

  //   Accept Friend Request (Updated with Instant UI Optimistic Update)
  const handleAcceptFriendRequest = async (requestId, senderName) => {
    // 1. Back up current states
    const prevSearchResults = friendSearchResults;
    const prevSelectedUser = selectedPublicUser;
    const prevRequests = friendRequests;

    // Find sender ID dynamically
    const requestObj = friendRequests.find((r) => r._id === requestId);
    const senderId = requestObj?.sender?._id || requestObj?.sender?.id;

    // 2. Optimistic Update: Instantly set status to FRIENDS and hide from dropdown (No Delay!)
    setFriendSearchResults((prev) =>
      prev.map((u) =>
        u.requestId === requestId || u.id === senderId
          ? { ...u, status: "FRIENDS" }
          : u
      )
    );
    if (
      selectedPublicUser &&
      (selectedPublicUser.requestId === requestId ||
        selectedPublicUser.id === senderId)
    ) {
      setSelectedPublicUser({ ...selectedPublicUser, status: "FRIENDS" });
    }
    setFriendRequests((prev) => prev.filter((r) => r._id !== requestId));

    setChatView((prev) => {
      if (!prev || !senderId) return prev;
      const chatUserId = String(prev.id || prev._id || prev.friendId);
      if (chatUserId === String(senderId)) {
        return { ...prev, isFriend: true };
      }
      return prev;
    });

    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/friend-request/accept",
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
          title: "Accepted ",
          msg: `You are now friends with ${senderName}!`,
          type: "success",
        });
        fetchFriendRequests();
        fetchFriends();
        fetchHomeFeed();
        //   User Profile page ke posts ko foran refresh karein
        if (senderId) {
          fetchPublicUserPosts(senderId);
        }
      } else {
        // Rollback if server rejects request
        setFriendSearchResults(prevSearchResults);
        setSelectedPublicUser(prevSelectedUser);
        setFriendRequests(prevRequests);
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      // Rollback on network failure
      setFriendSearchResults(prevSearchResults);
      setSelectedPublicUser(prevSelectedUser);
      setFriendRequests(prevRequests);
      setToast({
        title: "Error",
        msg: "Network error accepting request.",
        type: "error",
      });
    }
  };

  //   Reject / Cancel Friend Request (Updated with Instant UI Optimistic Update)
  //   Reject / Cancel Friend Request (Updated with Instant UI Optimistic Update)
  const handleRejectFriendRequest = async (requestId) => {
    // 1. Back up current states
    const prevSearchResults = friendSearchResults;
    const prevSelectedUser = selectedPublicUser;
    const prevRequests = friendRequests;

    // Find sender ID dynamically
    const requestObj = friendRequests.find((r) => r._id === requestId);
    const senderId = requestObj?.sender?._id || requestObj?.sender?.id;

    // 2. Optimistic Update: Instantly set status to NONE
    setFriendSearchResults((prev) =>
      prev.map((u) =>
        u.requestId === requestId || u.id === senderId
          ? { ...u, status: "NONE", requestId: null }
          : u
      )
    );
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
        "https://mern-auth1-qnmh.onrender.com/api/profile/friend-request/reject",
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
        setFriendSearchResults(prevSearchResults);
        setSelectedPublicUser(prevSelectedUser);
        setFriendRequests(prevRequests);
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      // Rollback on network failure
      setFriendSearchResults(prevSearchResults);
      setSelectedPublicUser(prevSelectedUser);
      setFriendRequests(prevRequests);
      setToast({
        title: "Error",
        msg: "Network error deleting request.",
        type: "error",
      });
    }
  };
  //   Unfriend / Remove Friend
  const handleRemoveFriend = async (friendId, friendName) => {
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/friend/remove",
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
        setFriendSearchResults((prev) =>
          prev.map((u) =>
            u.id === friendId ? { ...u, status: "NONE" } : u
          )
        );
        if (selectedPublicUser && selectedPublicUser.id === friendId) {
          setSelectedPublicUser((prev) => ({ ...prev, status: "NONE" }));
          fetchPublicUserPosts(friendId); //   User Profile page ke posts ko foran refresh karein
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

  //   Create status post handler
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!postContent.trim()) return;
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/profile/posts", {
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

        //   Agar hum apni hi profile ("SELF") par khare hain toh profile timeline refresh karein
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

  //   Handle Comment Submission
  //   Handle Comment Submission (Secure with Duplication & Script Protection)
  const handleCommentSubmit = async (e) => {
    e.preventDefault();

    // Click block checks
    if (!commentText.trim() || !activeCommentPost || commentSubmitting) return;

    // 1. Double/Extra spacing ko single space me tabdeel aur trim karna
    let cleanText = commentText.replace(/\s+/g, " ").trim();

    // 2. Script/HTML injection ko block aur remove karna (XSS Protection)
    cleanText = cleanText.replace(/<[^>]*>/g, "");

    // Empty input verification
    if (!cleanText) {
      setToast({
        title: "Error",
        msg: "Comment cannot contain only tags or spaces!",
        type: "error",
      });
      return;
    }

    // 3. Length Limit check (Max 300 characters)
    if (cleanText.length > 300) {
      setToast({
        title: "Limit Exceeded",
        msg: "Comment cannot be longer than 300 characters.",
        type: "error",
      });
      return;
    }

    setCommentSubmitting(true); //   Block further clicks immediately
    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${activeCommentPost._id}/comment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ content: cleanText }),
        },
      );
      if (res.ok) {
        setCommentText(""); // Clear text field
      } else {
        const data = await res.json();
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({
        title: "Error",
        msg: "Network error adding comment.",
        type: "error",
      });
    } finally {
      setCommentSubmitting(false); //   Release click block
    }
  };

  const getCommentPermissions = (comment, post) => {
    const uid = getEntityUserId(userId);
    const commentAuthorId = getEntityUserId(comment?.author);
    const postAuthorId = getEntityUserId(post?.author);
    return {
      canEdit: commentAuthorId === uid,
      canDelete: commentAuthorId === uid || postAuthorId === uid,
    };
  };

  const isPostAuthor = (post) =>
    getEntityUserId(post?.author) === getEntityUserId(userId);

  const removeCommentFromState = (postId, commentId) => {
    const updater = (prev) =>
      prev.map((p) =>
        p._id === postId
          ? {
              ...p,
              comments: (p.comments || []).filter((c) => c._id !== commentId),
            }
          : p,
      );
    setHomeFeedPosts(updater);
    setPublicUserPosts(updater);
    setActiveCommentPost((prev) =>
      prev && prev._id === postId
        ? {
            ...prev,
            comments: (prev.comments || []).filter((c) => c._id !== commentId),
          }
        : prev,
    );
  };

  const updateCommentInState = (postId, commentId, updatedComment) => {
    const updater = (prev) =>
      prev.map((p) =>
        p._id === postId
          ? {
              ...p,
              comments: (p.comments || []).map((c) =>
                c._id === commentId ? { ...c, ...updatedComment } : c,
              ),
            }
          : p,
      );
    setHomeFeedPosts(updater);
    setPublicUserPosts(updater);
    setActiveCommentPost((prev) =>
      prev && prev._id === postId
        ? {
            ...prev,
            comments: (prev.comments || []).map((c) =>
              c._id === commentId ? { ...c, ...updatedComment } : c,
            ),
          }
        : prev,
    );
  };

  const removePostFromState = (postId) => {
    setHomeFeedPosts((prev) => prev.filter((p) => p._id !== postId));
    setPublicUserPosts((prev) => prev.filter((p) => p._id !== postId));
    setActiveCommentPost((prev) => (prev && prev._id === postId ? null : prev));
    setActiveReactionsPost((prev) =>
      prev && prev._id === postId ? null : prev,
    );
  };

  const openConfirmDialog = ({
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    onConfirm,
  }) => {
    setConfirmDialog({
      title,
      message,
      confirmLabel,
      cancelLabel,
      danger,
      onConfirm,
    });
  };

  const closeConfirmDialog = () => setConfirmDialog(null);

  const handleConfirmDialogAction = () => {
    if (confirmDialog?.onConfirm) confirmDialog.onConfirm();
    closeConfirmDialog();
  };

  const performDeleteComment = async (postId, commentId) => {
    setOpenCommentMenuId(null);
    removeCommentFromState(postId, commentId);
    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}/comments/${commentId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (!res.ok) {
        fetchHomeFeed();
        if (activeCommentPost?._id === postId) {
          const postRes = await fetch(
            `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}`,
            { headers: { Authorization: `Bearer ${getToken()}` } },
          );
          if (postRes.ok) setActiveCommentPost(await postRes.json());
        }
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      fetchHomeFeed();
      setToast({
        title: "Error",
        msg: "Network error deleting comment.",
        type: "error",
      });
    }
  };

  const confirmDeleteComment = (postId, commentId) => {
    openConfirmDialog({
      title: "Delete comment?",
      message:
        "Are you sure you want to delete this comment? This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
      onConfirm: () => performDeleteComment(postId, commentId),
    });
  };

  const performSaveCommentEdit = async (postId, commentId) => {
    let cleanText = editingCommentText.replace(/\s+/g, " ").trim();
    cleanText = cleanText.replace(/<[^>]*>/g, "");
    if (!cleanText) {
      setToast({
        title: "Error",
        msg: "Comment cannot be empty.",
        type: "error",
      });
      return;
    }
    if (cleanText.length > 300) {
      setToast({
        title: "Limit Exceeded",
        msg: "Comment cannot be longer than 300 characters.",
        type: "error",
      });
      return;
    }

    setEditingCommentId(null);
    setEditingCommentText("");
    updateCommentInState(postId, commentId, { content: cleanText });

    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}/comments/${commentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ content: cleanText }),
        },
      );
      const data = await res.json();
      if (res.ok && data.comment) {
        updateCommentInState(postId, commentId, data.comment);
      } else {
        fetchHomeFeed();
        if (activeCommentPost?._id === postId) {
          const postRes = await fetch(
            `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}`,
            { headers: { Authorization: `Bearer ${getToken()}` } },
          );
          if (postRes.ok) setActiveCommentPost(await postRes.json());
        }
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      fetchHomeFeed();
      setToast({
        title: "Error",
        msg: "Network error updating comment.",
        type: "error",
      });
    }
  };

  const handleSaveCommentEdit = (postId, commentId) => {
    let cleanText = editingCommentText.replace(/\s+/g, " ").trim();
    cleanText = cleanText.replace(/<[^>]*>/g, "");
    if (!cleanText) {
      setToast({
        title: "Error",
        msg: "Comment cannot be empty.",
        type: "error",
      });
      return;
    }
    if (cleanText.length > 300) {
      setToast({
        title: "Limit Exceeded",
        msg: "Comment cannot be longer than 300 characters.",
        type: "error",
      });
      return;
    }

    openConfirmDialog({
      title: "Save changes?",
      message: "Do you want to save your changes to this comment?",
      confirmLabel: "Save",
      cancelLabel: "Cancel",
      onConfirm: () => performSaveCommentEdit(postId, commentId),
    });
  };

  const performDeletePost = async (postId) => {
    setOpenPostMenuId(null);
    removePostFromState(postId);
    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (!res.ok) {
        fetchHomeFeed();
        if (selectedPublicUser?.id) {
          fetchPublicUserPosts(selectedPublicUser.id);
        }
        setToast({ title: "Error", msg: data.message, type: "error" });
      } else {
        setToast({
          title: "Deleted",
          msg: "Post removed successfully.",
          type: "success",
        });
      }
    } catch {
      fetchHomeFeed();
      setToast({
        title: "Error",
        msg: "Network error deleting post.",
        type: "error",
      });
    }
  };

  const confirmDeletePost = (postId) => {
    openConfirmDialog({
      title: "Delete post?",
      message:
        "Are you sure you want to delete this post? All comments and reactions will be removed.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,
      onConfirm: () => performDeletePost(postId),
    });
  };

  const updatePostContentInState = (postId, content) => {
    const updater = (prev) =>
      prev.map((p) => (p._id === postId ? { ...p, content } : p));
    setHomeFeedPosts(updater);
    setPublicUserPosts(updater);
    setActiveCommentPost((prev) =>
      prev && prev._id === postId ? { ...prev, content } : prev,
    );
    setActiveReactionsPost((prev) =>
      prev && prev._id === postId ? { ...prev, content } : prev,
    );
  };

  const performSavePostEdit = async (postId) => {
    const textToSave = editingPostText;
    const originalContent = editingPostOriginalContent;
    const newContent = buildPostContentAfterEdit(originalContent, textToSave);

    if (!isReceiptPostContent(originalContent) && !newContent) {
      setToast({
        title: "Error",
        msg: "Post cannot be empty.",
        type: "error",
      });
      return;
    }

    const textLen = isReceiptPostContent(originalContent)
      ? textToSave.replace(/\s+/g, " ").trim().length
      : newContent.length;

    if (textLen > 300) {
      setToast({
        title: "Limit Exceeded",
        msg: "Text cannot be longer than 300 characters.",
        type: "error",
      });
      return;
    }

    setEditingPostId(null);
    setEditingPostText("");
    setEditingPostOriginalContent("");
    updatePostContentInState(postId, newContent);

    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ content: textToSave }),
        },
      );
      const data = await res.json();
      if (res.ok && data.content) {
        updatePostContentInState(postId, data.content);
        setToast({
          title: "Updated",
          msg: "Post updated successfully.",
          type: "success",
        });
      } else {
        fetchHomeFeed();
        if (selectedPublicUser?.id) {
          fetchPublicUserPosts(selectedPublicUser.id);
        }
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      fetchHomeFeed();
      setToast({
        title: "Error",
        msg: "Network error updating post.",
        type: "error",
      });
    }
  };

  const handleSavePostEdit = (postId) => {
    const isReceipt = isReceiptPostContent(editingPostOriginalContent);
    let cleanText = editingPostText.replace(/\s+/g, " ").trim();
    cleanText = cleanText.replace(/<[^>]*>/g, "");

    if (!isReceipt && !cleanText) {
      setToast({
        title: "Error",
        msg: "Post cannot be empty.",
        type: "error",
      });
      return;
    }

    openConfirmDialog({
      title: "Save changes?",
      message: "Do you want to save your changes to this post?",
      confirmLabel: "Save",
      cancelLabel: "Cancel",
      onConfirm: () => performSavePostEdit(postId),
    });
  };

  const requestStartPostEdit = (post) => {
    const isReceipt = isReceiptPostContent(post.content);
    openConfirmDialog({
      title: "Edit post?",
      message: isReceipt
        ? "You can edit your message above the receipt. Invoice details cannot be changed."
        : "Are you sure you want to edit this post?",
      confirmLabel: "Edit",
      cancelLabel: "Cancel",
      onConfirm: () => {
        setOpenPostMenuId(null);
        setEditingPostId(post._id);
        setEditingPostOriginalContent(post.content);
        setEditingPostText(getPostEditableText(post.content));
      },
    });
  };

  const cancelPostEdit = () => {
    setEditingPostId(null);
    setEditingPostText("");
    setEditingPostOriginalContent("");
  };

  const renderPostBody = (post) => {
    if (editingPostId === post._id) {
      const isReceipt = isReceiptPostContent(editingPostOriginalContent);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {isReceipt && (
            <p
              style={{
                color: "#94a3b8",
                fontSize: "0.82rem",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              Edit your caption above the receipt. Invoice details are locked.
            </p>
          )}
          <textarea
            className="form-input"
            value={editingPostText}
            onChange={(e) => setEditingPostText(e.target.value)}
            maxLength={300}
            placeholder={
              isReceipt
                ? "Write a caption above your receipt..."
                : "Edit your post..."
            }
            rows={isReceipt ? 3 : 4}
            style={{
              width: "100%",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              padding: "12px 14px",
              color: "#f8fafc",
              fontSize: "0.95rem",
              resize: "vertical",
              minHeight: "80px",
            }}
          />
          {isReceipt && (
            <div
              style={{
                marginTop: "4px",
                pointerEvents: "none",
                opacity: 0.92,
              }}
            >
              <p
                style={{
                  color: "#64748b",
                  fontSize: "0.75rem",
                  margin: "0 0 8px 0",
                }}
              >
                Receipt preview (locked)
              </p>
              {renderPostContent(
                buildPostContentAfterEdit(
                  editingPostOriginalContent,
                  editingPostText,
                ),
              )}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={cancelPostEdit}
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#94a3b8",
                borderRadius: "8px",
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSavePostEdit(post._id)}
              style={{
                background: "#6366f1",
                border: "none",
                color: "white",
                borderRadius: "8px",
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              Save
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          color: "#cbd5e1",
          fontSize: "0.95rem",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        {renderPostContent(post.content)}
      </div>
    );
  };

  const renderPostMenu = (post) => {
    if (!isPostAuthor(post)) return null;

    return (
      <div
        data-post-menu
        style={{ position: "relative", marginLeft: "8px" }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenPostMenuId((prev) =>
              prev === post._id ? null : post._id,
            );
          }}
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Post options"
        >
          <MoreVertical size={18} />
        </button>
        {openPostMenuId === post._id && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "4px",
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              minWidth: "130px",
              zIndex: 20,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => requestStartPostEdit(post)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                color: "#e2e8f0",
                padding: "10px 14px",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Edit post
            </button>
            <button
              type="button"
              onClick={() => confirmDeletePost(post._id)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                color: "#f87171",
                padding: "10px 14px",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 500,
              }}
            >
              Delete post
            </button>
          </div>
        )}
      </div>
    );
  };

  const closeReactionPicker = () => {
    setHoveredPostReactId(null);
    setActivePostReactPickerId(null);
  };

  const isReactionPickerOpen = (postId) =>
    hoveredPostReactId === postId || activePostReactPickerId === postId;

  const applyReactionUpdate = (postId, reactions) => {
    const updater = (prev) =>
      prev.map((p) => (p._id === postId ? { ...p, reactions } : p));
    setHomeFeedPosts(updater);
    setPublicUserPosts(updater);
    setActiveCommentPost((prev) =>
      prev && prev._id === postId ? { ...prev, reactions } : prev,
    );
    setActiveReactionsPost((prev) =>
      prev && prev._id === postId ? { ...prev, reactions } : prev,
    );
  };

  //   Handle Post Reaction (React, Update, or Toggle Off) — optimistic UI for instant feedback
  const handlePostReact = async (postId, type) => {
    if (reactionSubmittingPostId === postId) return;

    const reactorMeta = {
      displayName: profile?.displayName || user?.firstName || "You",
      profilePicture:
        profilePicture || profile?.profilePicture || user?.profilePicture || null,
    };

    let previousReactions = null;
    const withOptimistic = (reactions) => {
      if (previousReactions === null) previousReactions = reactions;
      return computeOptimisticReactions(reactions, userId, type, reactorMeta);
    };

    setHomeFeedPosts((prev) =>
      prev.map((p) =>
        p._id === postId ? { ...p, reactions: withOptimistic(p.reactions) } : p,
      ),
    );
    setPublicUserPosts((prev) =>
      prev.map((p) =>
        p._id === postId ? { ...p, reactions: withOptimistic(p.reactions) } : p,
      ),
    );
    setActiveCommentPost((prev) =>
      prev && prev._id === postId
        ? { ...prev, reactions: withOptimistic(prev.reactions) }
        : prev,
    );
    setActiveReactionsPost((prev) =>
      prev && prev._id === postId
        ? { ...prev, reactions: withOptimistic(prev.reactions) }
        : prev,
    );

    closeReactionPicker();
    setReactionSubmittingPostId(postId);

    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${postId}/react`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ type }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (data.reactions) {
          applyReactionUpdate(postId, data.reactions);
        }
      } else if (previousReactions !== null) {
        applyReactionUpdate(postId, previousReactions);
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      if (previousReactions !== null) {
        applyReactionUpdate(postId, previousReactions);
      }
      setToast({
        title: "Error",
        msg: "Network error updating reaction.",
        type: "error",
      });
    } finally {
      setReactionSubmittingPostId(null);
    }
  };

  const renderPostReactionControls = (post) => {
    const myReaction = findMyReaction(post.reactions, userId);
    const pickerOpen = isReactionPickerOpen(post._id);

    return (
      <div
        style={{ position: "relative" }}
        data-post-reaction-picker
        onMouseEnter={() => setHoveredPostReactId(post._id)}
        onMouseLeave={() => setHoveredPostReactId(null)}
      >
        <button
          type="button"
          onClick={() =>
            setActivePostReactPickerId((prev) =>
              prev === post._id ? null : post._id,
            )
          }
          style={{
            background: "none",
            border: "none",
            color: myReaction ? REACTION_COLORS[myReaction.type] : "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            cursor: "pointer",
            fontSize: "0.9rem",
            fontWeight: 600,
            transition: "color 0.2s",
          }}
        >
          {myReaction
            ? `${REACTION_EMOJIS[myReaction.type]} ${REACTION_LABELS[myReaction.type]}`
            : "React"}
        </button>

        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% - 2px)",
              left: "0",
              background: "#1e293b",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "20px",
              padding: "5px 10px",
              display: "flex",
              gap: "10px",
              zIndex: 10,
              boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {REACTION_TYPES.map((type) => (
              <span
                key={type}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePostReact(post._id, type);
                }}
                style={{
                  fontSize: "1.3rem",
                  cursor: "pointer",
                  transition: "transform 0.1s",
                  transform:
                    myReaction?.type === type ? "scale(1.25)" : "scale(1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform =
                    myReaction?.type === type ? "scale(1.25)" : "scale(1)";
                }}
              >
                {REACTION_EMOJIS[type]}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!activePostReactPickerId) return;

    const handleOutsideClick = (e) => {
      if (!e.target.closest("[data-post-reaction-picker]")) {
        setActivePostReactPickerId(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [activePostReactPickerId]);

  useEffect(() => {
    if (!openCommentMenuId && !openPostMenuId) return;

    const handleOutsideClick = (e) => {
      if (!e.target.closest("[data-comment-menu]")) {
        setOpenCommentMenuId(null);
      }
      if (!e.target.closest("[data-post-menu]")) {
        setOpenPostMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [openCommentMenuId, openPostMenuId]);

  const closeNotificationPanels = () => {
    setShowFriendsDropdown(false);
    setShowNotifDropdown(false);
  };

  //   Handle Social notification click (Opens post comments instantly)
  const handleSocialNotificationClick = async (notif) => {
    // Mark as read natively
    if (!notif.isRead) {
      markAsRead(notif._id);
    }

    setShowFriendsDropdown(false); // Close dropdown

    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/posts/${notif.metadata.postId}`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (res.ok) {
        setActiveCommentPost(data); //   Set active post to show comments sheet
        setCommentText("");
      }
    } catch (e) {
      console.error("Error fetching notification post details", e);
    }
  };

  const handleShareToFeed = async () => {
    if (!receiptData || loading) return; // loading active hone par early return (no double post!)
    setLoading(true);
    try {
      const contentString = `[RECEIPT_POST]\n${JSON.stringify({
        caption: shareFeedCaption.trim(),
        transactionId: receiptData.transactionId,
        amount: receiptData.amount,
        type: receiptData.type,
        senderName: receiptData.senderName,
        senderMobile: receiptData.senderMobile,
        receiverName: receiptData.receiverName,
        receiverMobile: receiptData.receiverMobile,
        date: receiptData.date,
      })}`;

      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/profile/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          content: contentString,
          visibility: shareFeedVisibility,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setShowShareFeedModal(false);
        setShareFeedCaption("");
        setToast({
          title: "Shared successfully ",
          msg: "Receipt shared to Wallexa Feed!",
          type: "success",
        });
        fetchHomeFeed();
      } else {
        setToast({
          title: "Share Failed ",
          msg: data.message || "Could not share post.",
          type: "error",
        });
      }
    } catch (err) {
      console.error(err);
      setToast({
        title: "Error ",
        msg: "Failed to share due to connection error.",
        type: "error",
      });
    } finally {
      setLoading(false);
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
    fetchConversations(); // Chat conversations

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      if (userId) newSocket.emit("join_user_room", userId);
    });

    newSocket.on("notification", (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((prev) => prev + 1);
      if (notif.type !== "SOCIAL_REACT") {
        setToast({ title: notif.title, msg: notif.message, type: "info" });
      }
      fetchData();
      fetchSplits();
      fetchNotifications();
      if (activeTabRef.current === "history") {
        fetchHistory();
      }
    });

    //   Real-time Friend Request Received
    newSocket.on("friend_request_received", (data) => {
      setToast({
        title: "New Friend Request ",
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

    //   Real-time Friend Request Accepted
    newSocket.on("friend_request_accepted", (data) => {
      setToast({
        title: "Request Accepted ",
        msg: `${data.friend.firstName} accepted your friend request!`,
        type: "success",
      });
      fetchFriends();
      fetchHomeFeed();

      setChatView((prev) => {
        if (!prev || !data.friend?.id) return prev;
        const chatUserId = String(prev.id || prev._id || prev.friendId);
        if (chatUserId === String(data.friend.id)) {
          return { ...prev, isFriend: true };
        }
        return prev;
      });

      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.friend.id) {
          fetchPublicUserPosts(data.friend.id); //   User Profile page ko update karein
          return { ...prev, status: "FRIENDS" };
        }
        return prev;
      });
    });

    //   Real-time Unfriend (Dosti khatam)
    newSocket.on("friend_removed", (data) => {
      fetchFriends();
      fetchHomeFeed();

      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.friendId) {
          fetchPublicUserPosts(data.friendId); //   User Profile page ko update karein
          return { ...prev, status: "NONE" };
        }
        return prev;
      });
    });

    // ? Real-time Friend Request Rejected / Cancelled (Naya Code)
    newSocket.on("friend_request_rejected", (data) => {
      fetchFriendRequests(); // Requests list refresh karo

      // REAL-TIME PROFILE UPDATE: Profile card ko wapas "Add Friend" (NONE) state par le jao
      setSelectedPublicUser((prev) => {
        if (
          prev &&
          (prev.id === data.senderId || prev.requestId === data.requestId)
        ) {
          return { ...prev, status: "NONE", requestId: null };
        }
        return prev;
      });
    });

    //   Real-time Post Creation (Social Feed Instant Update - Naya Code)
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
          if (
            data.visibility === "public" ||
            (data.visibility === "friends" && data.friends.includes(userId))
          ) {
            fetchPublicUserPosts(data.authorId);
          }
        }
        return prev;
      });
    });

    //   Real-time Comment Addition (Instant UI update!)
    newSocket.on("comment_added", (data) => {
      // 1. Home Feed posts update
      setHomeFeedPosts((prev) =>
        prev.map((post) => {
          if (post._id === data.postId) {
            const comments = post.comments || [];
            if (comments.some((c) => c._id === data.comment._id)) return post;
            return { ...post, comments: [...comments, data.comment] };
          }
          return post;
        }),
      );

      // 2. User profile posts update
      setPublicUserPosts((prev) =>
        prev.map((post) => {
          if (post._id === data.postId) {
            const comments = post.comments || [];
            if (comments.some((c) => c._id === data.comment._id)) return post;
            return { ...post, comments: [...comments, data.comment] };
          }
          return post;
        }),
      );

      // 3. Current open comment modal update
      setActiveCommentPost((prev) => {
        if (prev && prev._id === data.postId) {
          const comments = prev.comments || [];
          if (comments.some((c) => c._id === data.comment._id)) return prev;
          return { ...prev, comments: [...comments, data.comment] };
        }
        return prev;
      });
    });

    newSocket.on("comment_deleted", (data) => {
      const { postId, commentId } = data;
      const filterComments = (post) =>
        post._id === postId
          ? {
              ...post,
              comments: (post.comments || []).filter((c) => c._id !== commentId),
            }
          : post;
      setHomeFeedPosts((prev) => prev.map(filterComments));
      setPublicUserPosts((prev) => prev.map(filterComments));
      setActiveCommentPost((prev) =>
        prev && prev._id === postId ? filterComments(prev) : prev,
      );
    });

    newSocket.on("comment_updated", (data) => {
      const { postId, comment } = data;
      const updateComments = (post) =>
        post._id === postId
          ? {
              ...post,
              comments: (post.comments || []).map((c) =>
                c._id === comment._id ? { ...c, ...comment } : c,
              ),
            }
          : post;
      setHomeFeedPosts((prev) => prev.map(updateComments));
      setPublicUserPosts((prev) => prev.map(updateComments));
      setActiveCommentPost((prev) =>
        prev && prev._id === postId ? updateComments(prev) : prev,
      );
    });

    newSocket.on("post_deleted", (data) => {
      setHomeFeedPosts((prev) => prev.filter((p) => p._id !== data.postId));
      setPublicUserPosts((prev) => prev.filter((p) => p._id !== data.postId));
      setActiveCommentPost((prev) =>
        prev && prev._id === data.postId ? null : prev,
      );
      setActiveReactionsPost((prev) =>
        prev && prev._id === data.postId ? null : prev,
      );
    });

    newSocket.on("post_updated", (data) => {
      const { postId, content } = data;
      const updater = (prev) =>
        prev.map((p) => (p._id === postId ? { ...p, content } : p));
      setHomeFeedPosts(updater);
      setPublicUserPosts(updater);
      setActiveCommentPost((prev) =>
        prev && prev._id === postId ? { ...prev, content } : prev,
      );
      setActiveReactionsPost((prev) =>
        prev && prev._id === postId ? { ...prev, content } : prev,
      );
    });

    //   Real-time Post Reaction update
    newSocket.on("post_reacted", (data) => {
      // 1. Home feed posts refresh
      setHomeFeedPosts((prev) =>
        prev.map((post) => {
          if (post._id === data.postId) {
            return { ...post, reactions: data.reactions };
          }
          return post;
        }),
      );

      // 2. User profile posts refresh
      setPublicUserPosts((prev) =>
        prev.map((post) => {
          if (post._id === data.postId) {
            return { ...post, reactions: data.reactions };
          }
          return post;
        }),
      );

      // 3. Active open modal post comments refresh
      setActiveCommentPost((prev) => {
        if (prev && prev._id === data.postId) {
          return { ...prev, reactions: data.reactions };
        }
        return prev;
      });

      // 4. Active open reactions modal details refresh
      setActiveReactionsPost((prev) => {
        if (prev && prev._id === data.postId) {
          return { ...prev, reactions: data.reactions };
        }
        return prev;
      });
    });

    //   Real-time Deactivation (Clear deactivated user's posts instantly - Naya Code)
    newSocket.on("social_deactivated", (data) => {
      const stripUserFromPosts = (posts) =>
        posts.map((post) => ({
          ...post,
          comments: (post.comments || []).filter(
            (c) => String(c.author?._id || c.author?.id || c.author) !== String(data.userId)
          ),
          reactions: (post.reactions || []).filter(
            (r) => String(r.user?._id || r.user?.id || r.user) !== String(data.userId)
          ),
        })).filter((post) => String(post.author?._id || post.author?.id) !== String(data.userId));

      setHomeFeedPosts((prev) => stripUserFromPosts(prev));
      setPublicUserPosts((prev) => stripUserFromPosts(prev));
      setFriendsList((prev) => prev.filter((f) => f._id !== data.userId));
      setFriendSearchResults((prev) => prev.filter((u) => u.id !== data.userId));
      setConversations((prev) =>
        prev.map((c) =>
          c.friendId === data.userId
            ? {
                ...c,
                firstName: "Account Deactivated",
                lastName: "",
                isFriend: false,
                isDeactivated: true,
              }
            : c
        )
      );
      setSelectedPublicUser((prev) => {
        if (prev && prev.id === data.userId) {
          return null;
        }
        return prev;
      });
      fetchFriendRequests();
    });

    newSocket.on("social_activated", (data) => {
      fetchFriends();
      fetchHomeFeed();
      fetchConversations();
      fetchFriendRequests();
      setChatView((prev) => {
        if (!prev) return prev;
        const pid = String(prev.id || prev._id || prev.friendId);
        if (pid === String(data.userId)) {
          return { ...prev, isDeactivated: false, isFriend: true };
        }
        return prev;
      });
    });

    // Real-time: New chat message
    newSocket.on("new_message", (msg) => {
      const senderId = String(msg.sender?._id || msg.sender);
      const receiverId = String(msg.receiver?._id || msg.receiver);
      const myId = String(userId);

      setChatView((prevChat) => {
        if (prevChat) {
          const fid = String(prevChat.id || prevChat._id || prevChat.friendId);
          if (senderId === fid || receiverId === fid) {
            setChatMessages((prev) =>
              prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]
            );
            // Chat khuli hai aur msg saamne wale ne bheja ? read mark
            if (senderId === fid && senderId !== myId) {
              markChatAsRead(fid);
            }
          }
        }
        return prevChat;
      });

      fetchConversations();
    });


    newSocket.on("messages_read", () => fetchConversations());
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
    fetchConversations,
    markChatAsRead,
  ]);

  //   Safepay/Stripe Callback URL Parameters check (Wait until profile is loaded from backend)
  useEffect(() => {
    if (!profile) return; // Wait until profile loads from backend

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("status");
    const paymentMessage = urlParams.get("message");

    if (paymentStatus) {
      if (paymentStatus === "success") {
        const amount = urlParams.get("amount");
        const txId = urlParams.get("txId");

        if (amount && txId) {
          const txDetails = {
            transactionId: txId,
            date: new Date().toISOString(),
            amount: Number(amount),
            senderName: "Stripe Payment Gateway",
            senderMobile: "Visa / Mastercard",
            receiverName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Wallet Owner",
            receiverMobile: profile.mobileNumber || "",
            type: "ADD_MONEY",
          };
          setReceiptData(txDetails);
          setShowReceiptModal(true);
        }

        setToast({
          title: "Success ?",
          msg: paymentMessage || "Money added successfully to your wallet!",
          type: "success",
        });
      } else {
        setToast({
          title: "Failed ?",
          msg: paymentMessage || "Payment failed or cancelled.",
          type: "error",
        });
      }
      // URL address bar se query string parameters ko clear kar dein taake refresh par dobara toast na aaye
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [profile]);

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
        "https://mern-auth1-qnmh.onrender.com/api/wallet/mark-notification-read",
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
    setPendingTx({
      type: "external-transfer",
      bankName: externalForm.bankName,
      accountNumber: externalForm.accountNumber,
      amount: Number(externalForm.amount),
      mode: externalMode,
    });
    setShowPinModal(true);
  };

  const initiateExternalTransfer = async (e) => {
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

    setLoading(true);
    try {
      // 1. Account validation API ko hit karein holder name ke liye
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/validate-external-account",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            bankName: externalForm.bankName,
            accountNumber: externalForm.accountNumber,
            mode: externalMode,
          }),
        },
      );

      const data = await res.json();
      if (res.ok && data.valid) {
        // Name set karein aur modal show karein
        setValidatedAccountHolder(data.accountHolderName);
        setShowExternalConfirm(true);
      } else {
        setToast({
          title: "Validation Failed ?",
          msg: data.message || "Account not found.",
          type: "error",
        });
      }
    } catch (err) {
      setToast({
        title: "Network Error ?",
        msg: "Verification failed.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // --- TRANSACTION ACTIONS ---
  const fetchRecipientName = async () => {
    if (!sendForm.recipient || sendForm.recipient.length < 10) {
      setSendForm((prev) => ({ ...prev, recipientName: "" }));
      return;
    }

    //  ? Self-send check: Apne number par paise bejne se rokna
    if (profile?.mobileNumber && sendForm.recipient === profile.mobileNumber) {
      setSendForm((prev) => ({
        ...prev,
        recipientName: "You cannot send money to yourself",
      }));
      setToast({
        title: "Invalid Recipient",
        msg: "You cannot send money to your own mobile number.",
        type: "error",
      });
      return;
    }

    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/mobile/${sendForm.recipient}`,
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

    //  ? Final Check: Block self-send
    if (profile?.mobileNumber && sendForm.recipient === profile.mobileNumber) {
      return setToast({
        title: "Error",
        msg: "You cannot send money to yourself.",
        type: "error",
      });
    }

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
          `https://mern-auth1-qnmh.onrender.com/api/profile/mobile/${sendForm.recipient}`,
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
    // Open PIN modal and store details instead of sending immediately
    setPendingTx({
      type: "send-money",
      recipientMobile: sendForm.recipient,
      amount: Number(sendForm.amount),
    });
    setShowSendConfirm(false);
    setShowPinModal(true);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (isFrozen) {
      return setToast({
        title: "Error",
        msg: "Wallet is Frozen",
        type: "error",
      });
    }

    if (!addForm.amount || Number(addForm.amount) <= 0) {
      return setToast({
        title: "Error",
        msg: "Please enter a valid deposit amount",
        type: "error",
      });
    }

    setLoading(true);
    try {
      // 1. Backend API ko hit karein to create Stripe Session
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/stripe-initiate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            amount: Number(addForm.amount),
          }),
        },
      );
      const data = await res.json();

      if (res.ok && data.checkoutUrl) {
        // 2. Browser ko redirect kar dein Stripe ke hosted secure checkout link par
        window.location.href = data.checkoutUrl;
      } else {
        setToast({
          title: "Failed",
          msg: data.message || "Failed to initiate payment",
          type: "error",
        });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const requestFreeze = async () => {
    try {
      setOtpPurpose("freeze"); //   Purpose freeze set karein taake modal ko pata chale
      await fetch("https://mern-auth1-qnmh.onrender.com/api/auth/send-freeze-otp", {
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
        "https://mern-auth1-qnmh.onrender.com/api/wallet/verify-freeze-otp",
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
        //setToast({ title: "Success", msg: data.message, type: "success" });
      } else {
        setToast({ title: "Error", msg: data.message, type: "error" });
      }
    } catch {
      setToast({ title: "Error", msg: "Network error", type: "error" });
    }
  };
  // Handle Submitting the Transaction PIN
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError("");

    if (!transactionPinCode || transactionPinCode.length !== 6) {
      setPinError("Please enter a valid 6-digit PIN.");
      return;
    }

    setPinLoading(true);
    try {
      let url = "";
      let bodyData = {};

      // Set backend endpoint & payload parameters dynamically
      if (pendingTx.type === "send-money" || pendingTx.type === "qr-send") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/send-money";
        bodyData = {
          recipientMobile: pendingTx.recipientMobile,
          amount: pendingTx.amount,
          isQrPayment: pendingTx.type === "qr-send",
          transactionPin: transactionPinCode,
        };
      } else if (pendingTx.type === "pay-bill") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/pay-selected-bills";
        bodyData = {
          invoiceIds: pendingTx.invoiceIds,
          transactionPin: transactionPinCode,
        };
      } else if (pendingTx.type === "accept-split") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/accept-split";
        bodyData = {
          splitId: pendingTx.splitId,
          transactionPin: transactionPinCode,
        };
      } else if (pendingTx.type === "external-transfer") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/send-external-money";
        bodyData = {
          bankName: pendingTx.bankName,
          accountNumber: pendingTx.accountNumber,
          amount: pendingTx.amount,
          mode: pendingTx.mode,
          transactionPin: transactionPinCode,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.requiresOtp) {
          // Store verified PIN for the next OTP screen, close PIN modal, show OTP screen
          setVerifiedPin(transactionPinCode);
          setShowPinModal(false);
          setTransactionPinCode("");
          setOtpPurpose("transaction");
          setShowOtpModal(true);
        } else {
          // Success! Clear forms & close modal
          setShowPinModal(false);
          setTransactionPinCode("");

          if (pendingTx?.type === "send-money") {
            // Receipt details capture karein
            const txDetails = {
              transactionId: data.transaction?._id || "TXN" + Date.now(),
              date: data.transaction?.createdAt || new Date().toISOString(),
              amount: pendingTx.amount,
              description: pendingTx.note || "Sent via Wallexa",
              senderName:
                `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
              senderMobile: profile?.mobileNumber || "",
              receiverName: sendForm.recipientName || pendingTx.recipientMobile,
              receiverMobile: pendingTx.recipientMobile,
              type: "SEND",
            };
            setReceiptData(txDetails);
            setShowReceiptModal(true);

            setSendForm({
              recipient: "",
              amount: "",
              note: "",
              recipientName: "",
            });
          } else if (pendingTx.type === "qr-send") {
            // Receipt details capture karein
            const txDetails = {
              transactionId: data.transaction?._id || "TXN" + Date.now(),
              date: data.transaction?.createdAt || new Date().toISOString(),
              amount: pendingTx.amount,
              description: "Sent via Wallexa",
              senderName:
                `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
              senderMobile: profile?.mobileNumber || "",
              receiverName:
                `${qrRecipient?.firstName || ""} ${qrRecipient?.lastName || ""}`.trim() ||
                pendingTx.recipientMobile,
              receiverMobile: pendingTx.recipientMobile,
              type: "QR_PAYMENT",
            };
            setReceiptData(txDetails);
            setShowReceiptModal(true);

            setQrScanResult(null);
            setQrRecipient(null);
            setQrAmount("");
            setQrView(null);
          } else if (pendingTx.type === "pay-bill") {
            const selectedBill = activeInvoices.find(
              (inv) => inv.invoiceId === pendingTx.invoiceIds[0],
            );
            const txDetails = {
              transactionId: data.transaction?._id || "TXN" + Date.now(),
              date: data.transaction?.createdAt || new Date().toISOString(),
              amount:
                data.totalPaid ||
                (selectedBill
                  ? new Date() > new Date(selectedBill.dueDate)
                    ? selectedBill.amountAfterDueDate
                    : selectedBill.amountDue
                  : 0),
              description: selectedBill ? `Paid ${selectedBill.provider} Bill` : "Utility Bill Payment",
              senderName:
                `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
              senderMobile: profile?.mobileNumber || "",
              receiverName: selectedBill
                ? `${selectedBill.provider}`
                : "Utility Provider",
              receiverMobile:
                selectedBill?.consumerNumber ||
                billForm.consumerNumber ||
                "N/A",
              type: "BILL_PAYMENT",
            };
            setReceiptData(txDetails);
            setShowReceiptModal(true);

            setSelectedInvoiceIds([]);
          } else if (pendingTx.type === "external-transfer") {
            // Receipt details capture karein
            const txDetails = {
              transactionId: data.transaction?._id || "TXN" + Date.now(),
              date: data.transaction?.createdAt || new Date().toISOString(),
              amount: pendingTx.amount,
              description: "Bank Transfer",
              senderName:
                `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
              senderMobile: profile?.mobileNumber || "",
              receiverName: data.recipientName || pendingTx.bankName,
              receiverMobile: pendingTx.accountNumber,
              bankName: pendingTx.bankName,
              type: "EXTERNAL_TRANSFER",
            };
            setReceiptData(txDetails);
            setShowReceiptModal(true);

            setExternalForm({ bankName: "", accountNumber: "", amount: "" });
          } else if (pendingTx.type === "accept-split") {
            const selectedSplit = splits.find(
              (s) => s._id === pendingTx.splitId,
            );
            const txDetails = {
              transactionId: data.transaction?._id || "TXN" + Date.now(),
              date: data.transaction?.createdAt || new Date().toISOString(),
              amount: pendingTx.amount,
              description: selectedSplit?.description ? `Split Paid - ${selectedSplit.description}` : "Split Bill Payment",
              senderName:
                `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
              senderMobile: profile?.mobileNumber || "",
              receiverName: selectedSplit
                ? `${selectedSplit.initiator?.firstName || ""} ${selectedSplit.initiator?.lastName || ""}`.trim()
                : "Split Requester",
              receiverMobile: selectedSplit?.initiator?.mobileNumber || "N/A",
              type: "SPLIT_PAYMENT",
            };
            setReceiptData(txDetails);
            setShowReceiptModal(true);
          }

          setPendingTx(null);
          setVerifiedPin("");
          fetchData();
          fetchNotifications();

          setToast({
            title: "Transaction Successful ?",
            msg: data.message || "Completed successfully.",
            type: "success",
          });
        }
      } else {
        // Show validation warning / wrong PIN count message
        const errMsg = data.message || "Transaction authorization failed.";

        // Agar error message mein account frozen ka zikr ho (3 wrong attempts par)
        if (errMsg.toLowerCase().includes("frozen")) {
          setShowPinModal(false); // Enter PIN wala pop-up modal band karein
          setTransactionPinCode(""); // Code field ko clear karein
          setPinError(""); // Purani error clear karein

          // Screen par account freeze ka error alert dikhayein
          setToast({
            title: "Account Frozen",
            msg: errMsg,
            type: "error",
          });
        } else {
          // Agar 1st ya 2nd wrong attempt ho toh modal ke andar hi error dikhayein
          setPinError(errMsg);
        }
        fetchData(); // Update status in case account froze
      }
    } catch (err) {
      console.error("PIN submission error:", err);
      setPinError("Network error. Please try again.");
    } finally {
      setPinLoading(false);
    }
  };

  //   Confirm and complete any large transaction using OTP dynamically
  const confirmTransactionWithOtp = async () => {
    if (!pendingTx) return;
    setLoading(true);
    try {
      let url = "";
      let bodyData = {};

      // Route parameters dynamically based on transaction type (including verified PIN)
      if (pendingTx.type === "send-money" || pendingTx.type === "qr-send") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/send-money";
        bodyData = {
          recipientMobile: pendingTx.recipientMobile,
          amount: pendingTx.amount,
          isQrPayment: pendingTx.type === "qr-send",
          otp,
          transactionPin: verifiedPin,
        };
      } else if (pendingTx.type === "pay-bill") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/pay-selected-bills";
        bodyData = {
          invoiceIds: pendingTx.invoiceIds,
          otp,
          transactionPin: verifiedPin,
        };
      } else if (pendingTx.type === "accept-split") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/accept-split";
        bodyData = {
          splitId: pendingTx.splitId,
          otp,
          transactionPin: verifiedPin,
        };
      } else if (pendingTx.type === "external-transfer") {
        url = "https://mern-auth1-qnmh.onrender.com/api/wallet/send-external-money";
        bodyData = {
          bankName: pendingTx.bankName,
          accountNumber: pendingTx.accountNumber,
          amount: pendingTx.amount,
          otp,
          mode: pendingTx.mode,
          transactionPin: verifiedPin,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();

      if (res.ok) {
        setShowOtpModal(false);
        setOtp("");

        if (pendingTx?.type === "send-money") {
          // Receipt details capture karein
          const txDetails = {
            transactionId: data.transaction?._id || "TXN" + Date.now(),
            date: data.transaction?.createdAt || new Date().toISOString(),
            amount: pendingTx.amount,
            description: pendingTx.note || "Sent via Wallexa",
            senderName:
              `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
            senderMobile: profile?.mobileNumber || "",
            receiverName: sendForm.recipientName || pendingTx.recipientMobile,
            receiverMobile: pendingTx.recipientMobile,
            type: "SEND",
          };
          setReceiptData(txDetails);
          setShowReceiptModal(true);

          setSendForm({
            recipient: "",
            amount: "",
            note: "",
            recipientName: "",
          });
        } else if (pendingTx.type === "qr-send") {
          // Receipt details capture karein
          const txDetails = {
            transactionId: data.transaction?._id || "TXN" + Date.now(),
            date: data.transaction?.createdAt || new Date().toISOString(),
            amount: pendingTx.amount,
            description: "Sent via Wallexa",
            senderName:
              `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
            senderMobile: profile?.mobileNumber || "",
            receiverName:
              `${qrRecipient?.firstName || ""} ${qrRecipient?.lastName || ""}`.trim() ||
              pendingTx.recipientMobile,
            receiverMobile: pendingTx.recipientMobile,
            type: "QR_PAYMENT",
          };
          setReceiptData(txDetails);
          setShowReceiptModal(true);

          setQrScanResult(null);
          setQrRecipient(null);
          setQrAmount("");
          setQrView(null);
        } else if (pendingTx.type === "pay-bill") {
          const selectedBill = activeInvoices.find(
            (inv) => inv.invoiceId === pendingTx.invoiceIds[0],
          );
          const txDetails = {
            transactionId: data.transaction?._id || "TXN" + Date.now(),
            date: data.transaction?.createdAt || new Date().toISOString(),
            amount:
              data.totalPaid ||
              (selectedBill
                ? new Date() > new Date(selectedBill.dueDate)
                  ? selectedBill.amountAfterDueDate
                  : selectedBill.amountDue
                : 0),
            description: selectedBill ? `Paid ${selectedBill.provider} Bill` : "Utility Bill Payment",
            senderName:
              `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
            senderMobile: profile?.mobileNumber || "",
            receiverName: selectedBill
              ? `${selectedBill.provider}`
              : "Utility Provider",
            receiverMobile:
              selectedBill?.consumerNumber || billForm.consumerNumber || "N/A",
            type: "BILL_PAYMENT",
          };
          setReceiptData(txDetails);
          setShowReceiptModal(true);

          setSelectedInvoiceIds([]);
        } else if (pendingTx.type === "external-transfer") {
                  // Receipt details capture karein
        const txDetails = {
          transactionId: data.transaction?._id || "TXN" + Date.now(),
          date: data.transaction?.createdAt || new Date().toISOString(),
          amount: pendingTx.amount,
          description: "Bank Transfer",
          senderName:
            `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
          senderMobile: profile?.mobileNumber || "",
          receiverName: data.recipientName || pendingTx.bankName,
          receiverMobile: pendingTx.accountNumber,
          bankName: pendingTx.bankName,
          type: "EXTERNAL_TRANSFER",
        };
          setReceiptData(txDetails);
          setShowReceiptModal(true);

          setExternalForm({ bankName: "", accountNumber: "", amount: "" });
        } else if (pendingTx.type === "accept-split") {
          const selectedSplit = splits.find((s) => s._id === pendingTx.splitId);
          const txDetails = {
            transactionId: data.transaction?._id || "TXN" + Date.now(),
            date: data.transaction?.createdAt || new Date().toISOString(),
            amount: pendingTx.amount,
            description: selectedSplit?.description ? `Split Paid - ${selectedSplit.description}` : "Split Bill Payment",
            senderName:
              `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
            senderMobile: profile?.mobileNumber || "",
            receiverName: selectedSplit
              ? `${selectedSplit.initiator?.firstName || ""} ${selectedSplit.initiator?.lastName || ""}`.trim()
              : "Split Requester",
            receiverMobile: selectedSplit?.initiator?.mobileNumber || "N/A",
            type: "SPLIT_PAYMENT",
          };
          setReceiptData(txDetails);
          setShowReceiptModal(true);
        }

        setPendingTx(null);
        setVerifiedPin("");
        fetchData();
        fetchNotifications();

        setToast({
          title: "Success",
          msg: data.message || "Completed!",
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

  const handleOpenForgotPin = () => {
    // Modal khulte hi saare inputs aur errors ko clear karein
    setForgotPinPassword("");
    setForgotPinIdentifier("");
    setForgotPinOtp("");
    setForgotPinNewPin("");
    setForgotPinConfirmPin("");
    setForgotPinError("");
    setForgotPinStep(1);
    setPinWizardMode("change"); // By default Wizard A (Change PIN) par set karein
    setChangePinCurrent(""); // Current PIN field khali karein
    setShowForgotPinModal(true);
  };

  // Change PIN Stage 1 Form Handler: Current PIN ko backend par verify karwana
  // Change PIN Stage 1 Form Handler: Current PIN ko backend par verify karwana
  const handleChangePinCurrentSubmit = async (e) => {
    e.preventDefault();
    setForgotPinError("");

    if (!changePinCurrent || changePinCurrent.length !== 6) {
      setForgotPinError("Please enter your 6-digit current PIN.");
      return;
    }

    setForgotPinLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/change-pin/verify-current",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ currentPin: changePinCurrent }),
        },
      );

      const data = await res.json();
      if (res.ok) {
        setForgotPinStep(2); // Step 2 (Email OTP) par le jayein
      } else {
        setForgotPinError(data.message || "Verification failed.");
        if (data.failedPinAttempts !== undefined) {
          setFailedPinAttempts(data.failedPinAttempts); // Local state ko update karein taake foran input lock ho sake
        }
      }
    } catch (err) {
      console.error("Current PIN verify error:", err);
      setForgotPinError("Network error. Please try again.");
    } finally {
      setForgotPinLoading(false);
    }
  };
  // Forgot PIN Stage 1: Verify Password & Request OTP
  const handleForgotPinPasswordSubmit = async (e) => {
    e.preventDefault();
    setForgotPinError("");

    if (!forgotPinPassword || !forgotPinIdentifier) {
      setForgotPinError(
        "Please enter both login password and registered Email/Mobile.",
      );
      return;
    }

    setForgotPinLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/forgot-pin/verify-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            password: forgotPinPassword,
            identifier: forgotPinIdentifier,
          }),
        },
      );

      const data = await res.json();
      if (res.ok) {
        setForgotPinStep(2); // Move to OTP verification step
      } else {
        setForgotPinError(data.message || "Failed to verify password.");
      }
    } catch (err) {
      console.error("Forgot PIN Password verify error:", err);
      setForgotPinError("Network error. Please try again.");
    } finally {
      setForgotPinLoading(false);
    }
  };
  // Forgot PIN Stage 2: OTP collection
  const handleForgotPinOtpSubmit = (e) => {
    e.preventDefault();
    setForgotPinError("");

    if (!forgotPinOtp || forgotPinOtp.length !== 6) {
      setForgotPinError("Please enter a valid 6-digit OTP code.");
      return;
    }

    setForgotPinStep(3); // Move to Reset PIN step
  };

  // Forgot PIN Stage 3: Submit OTP and Reset PIN
  const handleForgotPinResetSubmit = async (e) => {
    e.preventDefault();
    setForgotPinError("");

    if (!forgotPinNewPin || !forgotPinConfirmPin) {
      setForgotPinError("Please fill in both fields.");
      return;
    }

    if (forgotPinNewPin.length !== 6 || forgotPinConfirmPin.length !== 6) {
      setForgotPinError("PIN must be exactly 6 digits.");
      return;
    }

    if (forgotPinNewPin !== forgotPinConfirmPin) {
      setForgotPinError("PINs do not match. Please verify.");
      return;
    }

    setForgotPinLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/forgot-pin/reset",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            otp: forgotPinOtp,
            newPin: forgotPinNewPin,
          }),
        },
      );

      const data = await res.json();
      if (res.ok) {
        // Reset recovery states
        setShowForgotPinModal(false);
        setForgotPinStep(1);
        setForgotPinPassword("");
        setForgotPinOtp("");
        setForgotPinNewPin("");
        setForgotPinConfirmPin("");
        setForgotPinError("");
        setForgotPinIdentifier("");
        setChangePinCurrent("");

        // Refresh dashboard (unfreeze wallet if it was frozen)
        fetchData();

        setToast({
          title: "PIN Reset Successful ?",
          msg: "Your transaction PIN has been reset and your wallet is now active.",
          type: "success",
        });
      } else {
        setForgotPinError(data.message || "Failed to reset PIN.");
      }
    } catch (err) {
      console.error("PIN reset submit error:", err);
      setForgotPinError("Network error. Please try again.");
    } finally {
      setForgotPinLoading(false);
    }
  };

  //   Handles redirection when user clicks submit inside OTP Modal
  const handleOtpSubmit = () => {
    if (otpPurpose === "transaction") {
      confirmTransactionWithOtp();
    } else {
      confirmFreeze();
    }
  };

  // --- PROFILE ACTIONS ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/profile/update", {
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
          "https://mern-auth1-qnmh.onrender.com/api/profile/upload-picture",
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
    setShowQrConfirm(false);
    setPendingTx({
      type: "qr-send",
      recipientMobile: qrScanResult,
      amount: Number(qrAmount),
    });
    setShowPinModal(true);
  };

  // --- NEW FEATURE ACTIONS ---
  const handlePayBill = async () => {
    if (isFrozen) {
      return setToast({
        title: "Wallet Frozen",
        msg: "Your wallet is currently frozen. Please unfreeze to proceed.",
        type: "error",
      });
    }
    if (selectedInvoiceIds.length === 0) {
      return setToast({
        title: "No Bills Selected",
        msg: "Please select at least one bill to proceed with payment.",
        type: "error",
      });
    }

    // Open PIN modal and store details instead of paying immediately
    setPendingTx({ type: "pay-bill", invoiceIds: selectedInvoiceIds });
    setShowPinModal(true);
  };

  const handleFetchBillAmount = async () => {
    if (
      !billForm.consumerNumber ||
      billForm.consumerNumber.length < 11 ||
      billForm.consumerNumber.length > 13
    ) {
      return setToast({
        title: "Invalid Account Number",
        msg: "Please enter a valid 11-to-13-digit consumer number linked to your utility account.",
        type: "error",
      });
    }
    setLoading(true);
    try {
      const res = await fetch(
        //   Niche 'XXXX' ki jagah apna IP (jaise localhost ya network IP) likhein
        `https://mern-auth1-qnmh.onrender.com/api/wallet/fetch-bills?billType=${encodeURIComponent(billForm.billType)}&consumerNumber=${billForm.consumerNumber}`, // Add your IP here
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const data = await res.json();
      if (res.ok) {
        setActiveInvoices(data.invoices);
        setBillOwnerName(data.ownerName); //   Verified name ko humne memory notebook mein save kar liya!
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

  //   Live Username verification & cleaning
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
        `https://mern-auth1-qnmh.onrender.com/api/profile/check-username/${cleanVal}`,
        {
          //   Niche IP update rakhiyega
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

  //   Finalize & Save username to database
  //   Finalize & Save username & displayName to database
  const handleSaveUsername = async (e) => {
    e.preventDefault();
    if (!isUsernameAvailable) return;
    setLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/set-username",
        {
          //   Niche IP update rakhiyega
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            username: usernameInput,
            displayName: displayNameInput,
          }), //   Send displayName too
        },
      );
      const data = await res.json();
      if (res.ok) {
        setProfile((prev) => ({
          ...prev,
          username: data.username,
          displayName: data.displayName,
          socialActive: true,
        }));
        fetchFriends();
        fetchHomeFeed();
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

    const confirmDeactivateSocial = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/deactivate-social",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      if (res.ok) {
        setProfile((prev) => ({ ...prev, socialActive: false }));
        setSelectedPublicUser(null);
        setChatView(null);
        setChatMessages([]);
        setSocialView("feed");
        setToast({
          title: "Account Deactivated",
          msg: "Your social profile has been paused. You can reactivate anytime.",
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


  //   Deactivate Social Profile (Delete username & displayName)
    const confirmActivateSocial = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/profile/activate-social",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      if (res.ok) {
        setProfile((prev) => ({ ...prev, socialActive: true }));
        fetchFriends();
        fetchHomeFeed();
        fetchConversations();
        fetchFriendRequests();
        setToast({
          title: "Account Activated",
          msg: "Welcome back! Your social profile is live again.",
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

    //  ? Check 1: Apna number add karne se rokna
    if (profile?.mobileNumber && mobileNumber === profile.mobileNumber) {
      const newFriends = [...splitForm.friends];
      newFriends[index].name = "You cannot add yourself";
      setSplitForm({ ...splitForm, friends: newFriends });
      setToast({
        title: "Invalid Participant",
        msg: "You cannot add your own number to the split list.",
        type: "error",
      });
      return;
    }

    //  ? Check 2: Duplicate number add karne se rokna
    const isDuplicate = splitForm.friends.some(
      (f, i) => i !== index && f.mobileNumber === mobileNumber,
    );
    if (isDuplicate) {
      const newFriends = [...splitForm.friends];
      newFriends[index].name = "Already added";
      setSplitForm({ ...splitForm, friends: newFriends });
      setToast({
        title: "Duplicate Participant",
        msg: "This number has already been added to the list.",
        type: "error",
      });
      return;
    }

    try {
      const res = await fetch(
        `https://mern-auth1-qnmh.onrender.com/api/profile/mobile/${mobileNumber}`,
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
      (f) =>
        f.name &&
        f.name !== "User not found" &&
        f.name !== "Already added" &&
        f.name !== "You cannot add yourself",
    );
    if (validFriends.length === 0) {
      return setToast({
        title: "Error",
        msg: "Add at least one valid friend",
        type: "error",
      });
    }

    //  ? Check: Custom split me kisi bhi friend ki amount 0 ya negative nahi honi chahiye
    if (splitForm.isCustom) {
      const hasZeroOrInvalid = validFriends.some(
        (f) => Number(f.amount || 0) <= 0,
      );
      if (hasZeroOrInvalid) {
        return setToast({
          title: "Error",
          msg: "Each person's split amount must be greater than 0",
          type: "error",
        });
      }

      //  ? Check: Custom splits ka total sum total bill amount se zyada nahi hona chahiye
      const totalCustomSum = validFriends.reduce(
        (sum, f) => sum + Number(f.amount || 0),
        0,
      );
      if (totalCustomSum > Number(splitForm.totalAmount)) {
        return setToast({
          title: "Error",
          msg: `The sum of custom split amounts (PKR ${totalCustomSum}) cannot exceed the total bill amount (PKR ${splitForm.totalAmount})`,
          type: "error",
        });
      }
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
        "https://mern-auth1-qnmh.onrender.com/api/wallet/request-split",
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

  const handleAcceptSplit = async (splitId, amount) => {
    if (isFrozen) {
      return setToast({
        title: "Error",
        msg: "Wallet is Frozen",
        type: "error",
      });
    }

    // Open PIN modal and store details instead of accepting immediately
    setPendingTx({ type: "accept-split", splitId, amount });
    setShowPinModal(true);
  };
  const handleRejectSplit = async (splitId) => {
    setLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/reject-split",
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
        // setToast({
        //   title: "Rejected",
        //   msg: "You rejected the split request",
        //   type: "success",
        // });
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

  // --- RENDERERS ---
  const renderHome = () => (
    <div className="view-container">
      {mustResetPin && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "15px",
            padding: "15px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            color: "#fca5a5",
            fontSize: "0.9rem",
          }}
        >
          <span>x</span>
          <div>
            <strong>Security Action Required:</strong> You must reset your
            transaction PIN from your Profile tab before you can make any
            payments.
          </div>
        </div>
      )}

      <div className="balance-card">
        <span className="balance-label">Total Balance</span>
        <h2 className="balance-amount">
          {isFrozen
            ? "FROZEN"
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
          Send to Wallexa
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
          External Bank
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // Form submit block karein
                  fetchRecipientName();
                }
              }}
              required
              disabled={isFrozen}
            />
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
          {/* ?? Mode Selector Buttons Group */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button
              type="button"
              onClick={() => {
                setExternalMode("local");
                setExternalForm({
                  bankName: "",
                  accountNumber: "",
                  amount: "",
                });
              }}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)",
                background:
                  externalMode === "local"
                    ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
                    : "#0f172a",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Local Bank Transfer
            </button>
            <button
              type="button"
              onClick={() => {
                setExternalMode("stripe");
                setExternalForm({
                  bankName: "Stripe Sandbox Bank",
                  accountNumber: "",
                  amount: "",
                });
              }}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.15)",
                background:
                  externalMode === "stripe"
                    ? "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)"
                    : "#0f172a",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Stripe Payout
            </button>
          </div>

          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.9rem",
              marginBottom: "20px",
            }}
          >
            {externalMode === "local"
              ? "Transfer funds instantly to Pakistani bank accounts via our local simulated network."
              : "Transfer funds to international sandbox accounts using Stripe secure token validation."}
          </p>

          <form onSubmit={initiateExternalTransfer}>
            <div className="form-group">
              <label className="form-label">Select Destination Bank</label>
              {externalMode === "local" ? (
                <div style={{ position: "relative" }}>
                  <div
                    onClick={() =>
                      !isFrozen && setBankDropdownOpen(!bankDropdownOpen)
                    }
                    className="form-input"
                    style={{
                      background: "#0f172a",
                      color: "white",
                      border: "1px solid rgba(255,255,255,0.15)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{externalForm.bankName || "Select Bank"}</span>
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                      {bankDropdownOpen ? "?" : "?"}
                    </span>
                  </div>

                  {bankDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        width: "100%",
                        maxHeight: "200px",
                        overflowY: "auto",
                        background: "#0f172a",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: "10px",
                        marginTop: "5px",
                        zIndex: 1000,
                        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                      }}
                    >
                      {[
                        { value: "", label: "Select Bank " },
                        { value: "Meezan Bank", label: "Meezan Bank " },
                        {
                          value: "HBL Bank",
                          label: "Habib Bank Limited (HBL)",
                        },
                        {
                          value: "United Bank Limited (UBL)",
                          label: "United Bank Limited (UBL)",
                        },
                        {
                          value: "National Bank of Pakistan (NBP)",
                          label: "National Bank of Pakistan (NBP)",
                        },
                        {
                          value: "Allied Bank Limited (ABL)",
                          label: "Allied Bank Limited (ABL)",
                        },
                        { value: "Bank Alfalah", label: "Bank Alfalah" },
                        { value: "MCB Bank", label: "MCB Bank" },
                        {
                          value: "Habib Metropolitan Bank",
                          label: "Habib Metropolitan Bank ",
                        },
                        { value: "Soneri Bank", label: "Soneri Bank" },
                        { value: "Askari Bank", label: "Askari Bank" },
                        { value: "Faysal Bank", label: "Faysal Bank " },
                        { value: "Bank Al Habib", label: "Bank Al Habib" },
                        {
                          value: "The Bank of Punjab (BOP)",
                          label: "The Bank of Punjab (BOP) ",
                        },
                        { value: "JS Bank", label: "JS Bank " },
                        {
                          value: "Standard Chartered Bank (SCB)",
                          label: "Standard Chartered Bank (SCB) ",
                        },
                        {
                          value: "BankIslami Pakistan",
                          label: "BankIslami Pakistan ",
                        },
                        {
                          value: "Dubai Islamic Bank (DIB)",
                          label: "Dubai Islamic Bank (DIB) ",
                        },
                        { value: "Al Baraka Bank", label: "Al Baraka Bank " },
                        { value: "Easypaisa", label: "Easypaisa " },
                        { value: "JazzCash", label: "JazzCash " },
                        { value: "NayaPay", label: "NayaPay " },
                        { value: "SadaPay", label: "SadaPay" },
                      ].map((bank) => (
                        <div
                          key={bank.value}
                          onClick={() => {
                            setExternalForm({
                              ...externalForm,
                              bankName: bank.value,
                            });
                            setBankDropdownOpen(false);
                          }}
                          style={{
                            padding: "10px 14px",
                            cursor: "pointer",
                            color: "white",
                            background:
                              externalForm.bankName === bank.value
                                ? "rgba(99,102,241,0.2)"
                                : "transparent",
                            borderBottom: "1px solid rgba(255,255,255,0.02)",
                            fontSize: "0.9rem",
                          }}
                          onMouseEnter={(e) =>
                            (e.target.style.background =
                              "rgba(255,255,255,0.08)")
                          }
                          onMouseLeave={(e) =>
                            (e.target.style.background =
                              externalForm.bankName === bank.value
                                ? "rgba(99,102,241,0.2)"
                                : "transparent")
                          }
                        >
                          {bank.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <select
                  className="form-input"
                  style={{
                    background: "#0f172a",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                  value={externalForm.bankName}
                  onChange={(e) =>
                    setExternalForm({
                      ...externalForm,
                      bankName: e.target.value,
                    })
                  }
                  required
                  disabled
                >
                  <option value="Stripe Sandbox Bank">
                    Stripe Sandbox Bank 
                  </option>
                </select>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Bank Account Number / IBAN</label>
              <input
                className="form-input"
                maxLength={24}
                placeholder={
                  externalMode === "local"
                    ? "Enter A/C Number or 24-character IBAN"
                    : "Enter Stripe test account e.g. 0001234567"
                }
                value={externalForm.accountNumber}
                onChange={(e) =>
                  setExternalForm({
                    ...externalForm,
                    // Security Sanitization: Allows only letters & numbers. Blocks XSS/NoSQL characters like < > / ' " { }
                    accountNumber: e.target.value.replace(/[^a-zA-Z0-9]/g, ""),
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
                {externalMode === "local"
                  ? "Account will be verified instantly against our local simulated registry."
                  : "Account will be validated in real-time via Stripe Sandbox API."}
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

        <div className="form-group" style={{ marginTop: "20px" }}>
          <p
            style={{
              fontSize: "0.85rem",
              color: "#94a3b8",
              padding: "15px",
              border: "1px dashed rgba(255,255,255,0.15)",
              borderRadius: "10px",
              textAlign: "center",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            Payments are processed securely in PKR via stipe
            Portal**. You will be redirected to complete your payment.
          </p>
        </div>
        <button
          type="submit"
          className="primary-button"
          disabled={loading || isFrozen}
        >
          {loading ? "Processing..." : "Proceed"}
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
              {/* Floating Chat Box Widget */}
      
        </div>
      );
    }
        // 2b. DEACTIVATED ACCOUNT SCREEN (pause � data safe, can reactivate)
    if (profile.username && profile.socialActive === false) {
      return (
        <div className="view-container">
          <div
            style={{
              maxWidth: "500px",
              margin: "50px auto 0 auto",
              background: "var(--bg-card)",
              padding: "40px 30px",
              borderRadius: "24px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              textAlign: "center",
            }}
          >
            <h2 style={{ color: "#f8fafc", marginBottom: "12px", fontSize: "1.4rem" }}>
              Social Account Deactivated
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: "1.6", marginBottom: "28px", fontSize: "0.95rem" }}>
              Your social profile is currently hidden from everyone.
              Your posts, friends, and data are saved safely.
            </p>
            <p style={{ color: "#cbd5e1", fontWeight: 600, marginBottom: "20px" }}>
              Do you want to activate your account?
            </p>
            <button
              className="primary-button"
              onClick={confirmActivateSocial}
              disabled={loading}
              style={{ width: "100%", marginBottom: "12px" }}
            >
              {loading ? "Activating..." : "Yes, Activate My Account"}
            </button>
            <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
              Your wallet and other features still work normally.
            </p>
          </div>
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
                  Connect with friends securely! Search people by name, share
                  transaction receipts with hidden amounts, and react to
                  payments.
                </p>
                <button
                  className="primary-button"
                  onClick={() => setSocialStep(2)}
                >
                  Activate Social Feed
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
                  Choose Your Search ID
                </h3>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    marginBottom: "20px",
                    lineHeight: "1.5",
                  }}
                >
                  Pick a unique ID so friends can find you. It stays hidden on
                  your feed — only your display name is shown publicly.
                </p>

                {/* ?? Display Name Input */}
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
                  <input
                    className="form-input"
                    placeholder="Search ID (e.g. john.doe)"
                    value={usernameInput}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    style={{
                      fontSize: "1.05rem",
                      letterSpacing: "0.5px",
                      padding: "12px 15px",
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
                        ? Username is available!
                      </span>
                    )}
                    {usernameError && (
                      <span style={{ color: "#ef4444" }}>
                        ? {usernameError}
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
    if (selectedPublicUser && !chatView && socialView !== "messages") {
      return (
        <div className="view-container">
          {/* Header with Back button */}
          <div className="social-profile-header">
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
              Back to Feed
            </button>
            <h2 className="page-title" style={{ margin: 0 }}>
              User Profile
            </h2>
          </div>

          {/* Profile Card Banner */}
          <div className="social-profile-card">
            {/* User Avatar */}
            <div className="social-profile-avatar">
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
                selectedPublicUser.firstName?.charAt(0)?.toUpperCase() || "?"
              )}
            </div>

            {/* User Name & Username (profile page only) */}
            <h3 className="social-profile-name">
              {selectedPublicUser.firstName} {selectedPublicUser.lastName}
            </h3>
            {(selectedPublicUser.username ||
              (selectedPublicUser.status === "SELF" && profile?.username)) && (
              <p className="social-profile-username">
                @
                {selectedPublicUser.username ||
                  (selectedPublicUser.status === "SELF" ? profile.username : "")}
              </p>
            )}

            {/* Dynamic Friendship Status Action Button */}
            <div className="social-profile-actions">
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
                <div className="social-action-row">
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
                      );
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
                <div key="friends-container" className="social-action-row">
                  <button
                    key="friends-label"
                    className="primary-button social-action-btn social-action-btn-status"
                  >
                    <UserCheck size={16} /> Friends
                  </button>

                  {/* MESSAGE BUTTON */}
                                    {/* MESSAGE BUTTON */}
                  <button
                    key="message-friend-btn"
                    className="primary-button social-action-btn social-action-btn-message"
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}
                    onClick={() => openChatWith({
  id: selectedPublicUser.id,
  firstName: selectedPublicUser.firstName,
  lastName: selectedPublicUser.lastName,
  username: selectedPublicUser.username,
  profilePicture: selectedPublicUser.profilePicture,
  isFriend: true,
})}
                  >
                    Message
                  </button>

                  {/* UNFRIEND BUTTON */}
                  <button
                    key="unfriend-action-btn"
                    className="primary-button social-action-btn social-action-btn-danger"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (
                        window.lastAcceptTime &&
                        Date.now() - window.lastAcceptTime < 1000
                      )
                        return;
                      setSelectedPublicUser({
                        ...selectedPublicUser,
                        showUnfriendConfirm: true,
                      });
                    }}
                  >
                    <UserMinus size={16} /> Unfriend
                  </button>
                  
                </div>
              )}
              {selectedPublicUser.status === "SELF" && (
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
                    justifyContent: "center",
                    gap: "6px",
                    width: "100%",
                  }}
                >
                  Deactivate Social
                </button>
              )}

              {/* CUSTOM UNFRIEND MODAL */}
              {selectedPublicUser.showUnfriendConfirm && (
                <div
                  className="modal-overlay"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    setSelectedPublicUser({
                      ...selectedPublicUser,
                      showUnfriendConfirm: false,
                    })
                  }
                >
                  <div
                    className="modal-content"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxWidth: "400px", textAlign: "center" }}
                  >
                    <div
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 20px",
                      }}
                    >
                      <UserMinus size={30} color="#ef4444" />
                    </div>
                    <h3
                      style={{
                        color: "#f8fafc",
                        marginBottom: "10px",
                        fontSize: "1.2rem",
                      }}
                    >
                      Unfriend {selectedPublicUser.firstName}?
                    </h3>
                    <p
                      style={{
                        color: "#94a3b8",
                        marginBottom: "25px",
                        fontSize: "0.95rem",
                        lineHeight: "1.5",
                      }}
                    >
                      Are you sure you want to remove{" "}
                      <strong>{selectedPublicUser.firstName}</strong> from your
                      friends list? Unfriending will also remove you from their
                      friends list.
                    </p>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <button
                        className="primary-button"
                        style={{
                          background: "#ef4444",
                          color: "white",
                          flex: 1,
                          padding: "12px",
                        }}
                        onClick={() => {
                          setSelectedPublicUser({
                            ...selectedPublicUser,
                            showUnfriendConfirm: false,
                          });
                          handleRemoveFriend(
                            selectedPublicUser.id,
                            selectedPublicUser.firstName,
                          );
                        }}
                      >
                        Yes, Unfriend
                      </button>
                      <button
                        className="primary-button"
                        style={{
                          background: "rgba(255, 255, 255, 0.1)",
                          color: "white",
                          flex: 1,
                          padding: "12px",
                        }}
                        onClick={() =>
                          setSelectedPublicUser({
                            ...selectedPublicUser,
                            showUnfriendConfirm: false,
                          })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ?? My Friends List Section (With Hide/Show & Modern UI) */}
          {selectedPublicUser.status === "SELF" && friendsList.length > 0 && (
            <div style={{ marginBottom: "25px" }}>
              {/* My Friends tab toggle */}
              <button
                style={{
                  background: selectedPublicUser.showFriends
                    ? "var(--primary-gradient)"
                    : "#243447",
                  color: selectedPublicUser.showFriends ? "white" : "#e2e8f0",
                  border: selectedPublicUser.showFriends
                    ? "none"
                    : "1px solid #475569",
                  padding: "8px 18px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  marginBottom: "15px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onClick={() =>
                  setSelectedPublicUser({
                    ...selectedPublicUser,
                    showFriends: !selectedPublicUser.showFriends,
                  })
                }
              >
                My Friends ({friendsList.length})
              </button>

              {/* Friends list (shown when showFriends tab is active) */}
              {selectedPublicUser.showFriends && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column" /* Isko vertical list bana diya */,
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
                        alignItems: "center" /* Sab center me align */,
                        gap: "15px" /* DP aur text ke darmiyan space */,
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
                          fontSize: "1.1rem",
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
                      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                        <div
                          style={{
                            color: "#f8fafc",
                            fontWeight: 600,
                            fontSize: "0.95rem",
                          }}
                        >
                          {friend.firstName} {friend.lastName}
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                          Friend
                        </div>
                      </div>
                      {/* Chat button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); openChatWith({ id: friend._id, firstName: friend.firstName, lastName: friend.lastName, username: friend.username, profilePicture: friend.profilePicture }); }}
                        style={{ background: "#6366f1", color: "#ffffff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600, boxShadow: "0 2px 8px rgba(99,102,241,0.35)" }}
                      >
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ?? 3 Privacy Tabs: Public, Friends Only, Private (Visible only on own profile "SELF") */}
          {selectedPublicUser.status === "SELF" && (
            <div className="social-privacy-tabs">
              {["public", "friends", "private"].map((tab) => (
                <button
                  key={tab}
                  className={`social-privacy-tab${ownPostPrivacyFilter === tab ? " active" : ""}`}
                  onClick={() => setOwnPostPrivacyFilter(tab)}
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
              Posts by {selectedPublicUser.firstName} {selectedPublicUser.lastName}
            </h4>

            {(() => {
              //   Agar apni profile ("SELF") hai toh selected tab ke mutabiq filter karein, warna normal posts dikhayein
              const displayedPosts =
                selectedPublicUser.status === "SELF"
                  ? publicUserPosts.filter(
                      (post) => post.visibility === ownPostPrivacyFilter,
                    )
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

                      {/* Right Side: Visibility Badge + Post Menu */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
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
                            ? "Public"
                            : post.visibility === "friends"
                              ? "Friends"
                              : "Private"}
                        </div>
                        {renderPostMenu(post)}
                      </div>
                    </div>
                    {renderPostBody(post)}
                    {/* Reactions Count Summary */}
                    {post.reactions && post.reactions.length > 0 && (
                      <div
                        onClick={() => {
                          setActiveReactionsPost(post);
                          setReactionsFilterTab("all");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.85rem",
                          color: "#cbd5e1",
                          marginTop: "10px",
                          paddingBottom: "8px",
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                          cursor: "pointer",
                          transition: "color 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#a5b4fc")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "#cbd5e1")
                        }
                      >
                        <span>
                          {Array.from(
                            new Set(post.reactions.map((r) => r.type)),
                          )
                            .slice(0, 3)
                            .map((type) => REACTION_EMOJIS[type])
                            .join("")}
                        </span>
                        <span style={{ fontWeight: 500 }}>
                          {post.reactions.length} reaction
                          {post.reactions.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}

                    {/* ?? Post Action Footer (React & Comment Buttons) */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "20px",
                        marginTop: "12px",
                        paddingTop: "10px",
                        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                      }}
                    >
                      {renderPostReactionControls(post)}

                      <button
                        onClick={() => {
                          setActiveCommentPost(post);
                          setCommentText("");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#94a3b8",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          transition: "color 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#818cf8")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "#94a3b8")
                        }
                      >
                        Comment ({post.comments ? post.comments.length : 0})
                      </button>
                    </div>
                  </div>
                ))
              );
            })()}
          </div>

        </div>
      );
    
    }

    // 4a. MESSAGES LIST SCREEN
    if (socialView === "messages" && !chatView) {
      return (
        <div className="view-container">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <button
              onClick={() => {
                setSocialView("feed");
                setMsgSearchQuery("");
                setMsgSearchResults([]);
                setMsgSearchError("");
              }}
              style={{ background: "#1e293b", border: "1px solid #475569", color: "#e2e8f0", padding: "8px 16px", borderRadius: "10px", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}
            >
              &larr; Back to Feed
            </button>
            <h2 style={{ color: "#f8fafc", margin: 0, fontSize: "1.2rem" }}>Messages</h2>
            {totalUnreadMessages > 0 && (
              <span style={{ background: "#ef4444", color: "white", borderRadius: "20px", padding: "2px 10px", fontSize: "0.8rem", fontWeight: 700 }}>
                {totalUnreadMessages} unread
              </span>
            )}
          </div>

          <form onSubmit={handleMsgFriendSearch} style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={18} style={{ position: "absolute", left: "15px", top: "13px", color: "#94a3b8" }} />
              <input
                className="form-input"
                placeholder="Search by name..."
                value={msgSearchQuery}
                onChange={(e) => setMsgSearchQuery(e.target.value)}
                style={{ paddingLeft: "45px" }}
              />
            </div>
            <button className="primary-button" style={{ width: "auto", padding: "0 25px" }} type="submit" disabled={msgSearchLoading}>
              {msgSearchLoading ? "..." : "Search"}
            </button>
          </form>

          {msgSearchError && (
            <p style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "12px" }}>? {msgSearchError}</p>
          )}

          {msgSearchResults.length > 0 && (
            <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {msgSearchResults.map((user) => (
                <div
                  key={user.id}
                  style={{
                    background: "rgba(99, 102, 241, 0.05)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    padding: "15px 20px",
                    borderRadius: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "45px", height: "45px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", overflow: "hidden" }}>
                      {user.profilePicture ? (
                        <img src={user.profilePicture} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        user.firstName?.[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <div style={{ color: "#f8fafc", fontWeight: 600 }}>{user.firstName} {user.lastName}</div>
                    </div>
                  </div>
                  {user.status === "FRIENDS" ? (
                    <button
                      className="primary-button"
                      style={{ width: "auto", padding: "8px 18px", background: "#6366f1" }}
                      onClick={() => {
                        openChatWith(user);
                        setMsgSearchResults([]);
                        setMsgSearchQuery("");
                      }}
                    >
                      Open Chat
                    </button>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>You can only chat with friends</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <h4 style={{ color: "#f8fafc", fontSize: "1rem", fontWeight: 700, marginBottom: "14px", borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
            Recent Conversations
          </h4>
          {conversations.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", textAlign: "center", padding: "24px 0" }}>
              No conversations yet. Search a friend above!
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.friendId}
                onClick={() => openChatWith(conv)}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "12px", cursor: "pointer", background: "#243447", marginBottom: "8px", border: "1px solid #334155" }}
              >
                <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, overflow: "hidden", flexShrink: 0 }}>
                  {conv.profilePicture ? <img src={conv.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : conv.firstName?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ color: "#f8fafc", fontWeight: 600, fontSize: "0.92rem" }}>{conv.firstName} {conv.lastName}</div>
                  <div style={{ color: "#94a3b8", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lastMessage}</div>
                </div>
                {conv.unread > 0 && (
                  <span style={{ background: "#6366f1", color: "white", borderRadius: "50%", minWidth: "22px", height: "22px", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{conv.unread}</span>
                )}
              </div>
            ))
          )}
        </div>
      );
    }

    // 4b. CHAT VIEW
    if (chatView) {
      const scrollRef = (el) => { if (el) el.scrollTop = el.scrollHeight; };
      return (
        <div className="view-container">
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <button
              onClick={async () => {
                const friendId = chatView.id || chatView._id || chatView.friendId;
                if (friendId) {
                  await markChatAsRead(friendId);
                }
                setChatView(null);
                setChatMessages([]);
                setSocialView("messages");
              }}
              style={{
                background: "#1e293b",
                border: "1px solid #475569",
                color: "#e2e8f0",
                padding: "8px 16px",
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              &larr; Back
            </button>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, overflow: "hidden" }}>
              {chatView.profilePicture ? <img src={chatView.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : chatView.firstName?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ color: "#f8fafc", fontWeight: 600 }}>{chatView.firstName} {chatView.lastName}</div>
            </div>
          </div>
          <div ref={scrollRef} style={{ background: "#0f172a", borderRadius: "16px", border: "1px solid #334155", padding: "16px", minHeight: "350px", maxHeight: "420px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            {chatMessages.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center", margin: "auto", fontSize: "0.95rem" }}>No messages yet. Say hi!</div>
            ) : chatMessages.map((msg, i) => {
              const isMe = msg.sender === userId || msg.sender?._id === userId;
              return (
                <div key={msg._id || i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "72%", background: isMe ? "linear-gradient(135deg,#6366f1,#4f46e5)" : "#243447", color: "#f8fafc", padding: "10px 14px", borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", fontSize: "0.9rem", lineHeight: "1.5", border: isMe ? "none" : "1px solid #334155" }}>
                    <div>{msg.content}</div>
                    <div style={{ fontSize: "0.72rem", color: isMe ? "rgba(255,255,255,0.65)" : "#64748b", marginTop: "5px", textAlign: isMe ? "right" : "left" }}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {(chatView.isDeactivated || chatView.isFriend === false) && (
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "12px", marginBottom: "0", textAlign: "center" }}>
              {chatView.isDeactivated
                ? "This account is deactivated. You can view past messages but cannot send new ones."
                : "You are no longer friends. You can view past messages but cannot send new ones."}
            </p>
          )}
          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
            <input className="form-input" placeholder={(chatView.isFriend === false || chatView.isDeactivated) ? "Messaging disabled" : "Type a message..."} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && chatView.isFriend !== false && !chatView.isDeactivated) { e.preventDefault(); handleSendMessage(); } }} maxLength={1000} disabled={chatView.isFriend === false || chatView.isDeactivated} style={{ flex: 1, background: "#1e293b", color: "#f8fafc", border: "1px solid #334155", opacity: (chatView.isFriend === false || chatView.isDeactivated) ? 0.6 : 1, cursor: (chatView.isFriend === false || chatView.isDeactivated) ? "not-allowed" : "text" }} />
            <button className="primary-button" style={{ width: "auto", padding: "0 24px", background: "#6366f1", color: "white", fontWeight: 600, opacity: (chatView.isFriend === false || chatView.isDeactivated) ? 0.6 : 1, cursor: (chatView.isFriend === false || chatView.isDeactivated) ? "not-allowed" : "pointer" }} onClick={handleSendMessage} disabled={chatSending || !chatInput.trim() || chatView.isFriend === false || chatView.isDeactivated}>Send</button>
          </div>
        </div>
      );
    }

    // 4. MAIN SOCIAL FEED: Default view containing Search, Post Box, Friends & Feed Timeline
    return (
      <div className="view-container">
        {/* ?? Search Bar Section */}
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
                placeholder="Search by name (e.g. Zain)..."
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
              ? {friendSearchError}
            </p>
          )}

          {/* Search Results List */}
          {friendSearchResults.length > 0 && (
            <div style={{ marginTop: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 4px 5px" }}>
                {friendSearchResults.length} result(s) found
              </p>
              {friendSearchResults.map((user) => (
                <div key={user.id} className="social-search-result">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1 1 180px", minWidth: 0 }}>
                    <div
                      style={{
                        width: "45px",
                        height: "45px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        color: "white",
                        overflow: "hidden",
                      }}
                    >
                      {user.profilePicture ? (
                        <img
                          src={user.profilePicture}
                          alt="Avatar"
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        user.firstName?.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#f8fafc", fontWeight: 600 }}>
                        {user.firstName} {user.lastName}
                      </div>
                      {user.username && (
                        <div
                          style={{
                            color: "#818cf8",
                            fontSize: "0.82rem",
                            marginTop: "2px",
                          }}
                        >
                          @{user.username}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    className="primary-button"
                    style={{
                      width: "auto",
                      padding: "8px 18px",
                      fontSize: "0.85rem",
                      background: "#6366f1",
                    }}
                    onClick={() => {
                      setSelectedPublicUser(user);
                      fetchPublicUserPosts(user.id);
                      setFriendSearchResults([]);
                      setFriendSearchQuery("");
                    }}
                  >
                    View Profile
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ?? Post Creation Card (Active/Enabled!) */}
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
            What's on your mind, {profile.displayName || profile.firstName}?
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
                <option value="public">Public</option>
                <option value="friends">Friends Only</option>
                <option value="private">Private</option>
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

        {/* ?? Social Feed Timeline Posts (Loaded dynamically) */}
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
              <p style={{ color: "#94a3b8" }}>Refreshing feed...</p>
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
                              : friendsList.some(
                                    (f) => f._id === post.author._id,
                                  )
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
                        {new Date(post.createdAt).toLocaleDateString()}{" "}
                        {new Date(post.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Visibility Badge + Post Menu */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
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
                        ? "Public"
                        : post.visibility === "friends"
                          ? "Friends"
                          : "Private"}
                    </div>
                    {renderPostMenu(post)}
                  </div>
                </div>
                {renderPostBody(post)}
                {/* Reactions Count Summary */}
                {post.reactions && post.reactions.length > 0 && (
                  <div
                    onClick={() => {
                      setActiveReactionsPost(post);
                      setReactionsFilterTab("all");
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "0.85rem",
                      color: "#cbd5e1",
                      marginTop: "10px",
                      paddingBottom: "8px",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      cursor: "pointer",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#a5b4fc")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#cbd5e1")
                    }
                  >
                    <span>
                      {Array.from(new Set(post.reactions.map((r) => r.type)))
                        .slice(0, 3)
                        .map((type) => REACTION_EMOJIS[type])
                        .join("")}
                    </span>
                    <span style={{ fontWeight: 500 }}>
                      {post.reactions.length} reaction
                      {post.reactions.length > 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {/* ?? Post Action Footer (React & Comment Buttons) */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                    marginTop: "12px",
                    paddingTop: "10px",
                    borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                >
                  {renderPostReactionControls(post)}

                  <button
                    onClick={() => {
                      setActiveCommentPost(post);
                      setCommentText("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#818cf8")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#94a3b8")
                    }
                  >
                    Comment ({post.comments ? post.comments.length : 0})
                  </button>
                </div>
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
              Loading transactions...
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
      .reduce((sum, inv) => {
        const isLate = inv.rawDueDate && new Date() > new Date(inv.rawDueDate);
        const payableAmount = isLate ? inv.amountAfterDueDate : inv.amount;
        return sum + payableAmount;
      }, 0);
    return (
      <div className="view-container">
        <h2 className="page-title">Pay Bills</h2>

        {/* -- STEP 1: Account Number Form -- */}
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
                <option value="Electricity Bill">Electricity Bill</option>
                <option value="Gas Bill">Gas Bill</option>
                <option value="Water Bill">Water Bill</option>
                <option value="Internet Bill">Internet Bill</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Consumer / Account Number</label>
              <input
                className="form-input"
                placeholder="Enter 11 to 13-digit consumer number"
                value={billForm.consumerNumber}
                onChange={(e) =>
                  setBillForm({
                    ...billForm,
                    consumerNumber: e.target.value
                      .replace(/[^0-9]/g, "")
                      .slice(0, 13),
                  })
                }
                maxLength={13}
                disabled={isFrozen}
              />
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "#64748b",
                  marginTop: "6px",
                }}
              >
                Enter the 11-to-13-digit consumer number (e.g. 1300023459157 for
                KE, 41998765432 for SSGC)
              </p>
            </div>
            <button
              className="primary-button"
              onClick={handleFetchBillAmount}
              disabled={loading || isFrozen || !billForm.consumerNumber}
            >
              {loading ? "Fetching..." : "Fetch My Bills"}
            </button>
          </div>
        )}

        {/* -- STEP 2: Invoices List -- */}
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

            {/* -- ?? KARACHI PHYSICAL BILL REPLICA CARD -- */}
            {activeInvoices.map((inv) => {
              const isSelected = selectedInvoiceIds.includes(inv.invoiceId);
              const isPaid = inv.status === "PAID";

              // Define dynamic styling based on Provider
              let billGradient =
                "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";
              let accentColor = "#6366f1";
              let providerLogo = "";

              if (inv.provider === "K-Electric") {
                billGradient =
                  "linear-gradient(135deg, #1e3a8a 0%, #172554 100%)";
                accentColor = "#38bdf8";
                providerLogo = "KE (K-Electric)";
              } else if (inv.provider === "SSGC") {
                billGradient =
                  "linear-gradient(135deg, #7c2d12 0%, #431407 100%)";
                accentColor = "#f97316";
                providerLogo = "SSGC (Gas)";
              } else if (inv.provider === "KWSB") {
                billGradient =
                  "linear-gradient(135deg, #115e59 0%, #042f2e 100%)";
                accentColor = "#14b8a6";
                providerLogo = "KWSB (Water)";
              } else if (inv.provider === "PTCL") {
                billGradient =
                  "linear-gradient(135deg, #065f46 0%, #022c22 100%)";
                accentColor = "#10b981";
                providerLogo = "PTCL (Internet)";
              }

              return (
                <div
                  key={inv.invoiceId}
                  style={{
                    background: billGradient,
                    border: `1px solid rgba(255,255,255,0.1)`,
                    borderRadius: "24px",
                    padding: "24px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                    color: "#f8fafc",
                    marginBottom: "20px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Decorative background circle */}
                  <div
                    style={{
                      position: "absolute",
                      top: "-50px",
                      right: "-50px",
                      width: "150px",
                      height: "150px",
                      background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)`,
                      opacity: 0.2,
                      pointerEvents: "none",
                    }}
                  />

                  {/* Header Row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px dashed rgba(255,255,255,0.15)",
                      paddingBottom: "16px",
                      marginBottom: "20px",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: "1.5px",
                          color: "#94a3b8",
                        }}
                      >
                        Utility Provider
                      </span>
                      <h3
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: "1.3rem",
                          fontWeight: 800,
                          color: accentColor,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {providerLogo}
                      </h3>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: "1.5px",
                          color: "#94a3b8",
                        }}
                      >
                        Bill Status
                      </span>
                      <div style={{ marginTop: "4px" }}>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            padding: "4px 12px",
                            borderRadius: "30px",
                            background: isPaid
                              ? "rgba(16,185,129,0.2)"
                              : "rgba(239,68,68,0.2)",
                            color: isPaid ? "#34d399" : "#f87171",
                            border: `1px solid ${isPaid ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                          }}
                        >
                          {isPaid ? "? PAID" : "? UNPAID"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "16px 24px",
                      fontSize: "0.85rem",
                      marginBottom: "24px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginBottom: "2px",
                        }}
                      >
                        Consumer Number
                      </div>
                      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>
                        {inv.consumerNumber || billForm.consumerNumber}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginBottom: "2px",
                        }}
                      >
                        Contract Number
                      </div>
                      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>
                        {inv.contractNumber}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginBottom: "2px",
                        }}
                      >
                        Registered Owner
                      </div>
                      <div style={{ fontWeight: 700, color: "#38bdf8" }}>
                        {inv.ownerName}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginBottom: "2px",
                        }}
                      >
                        Billing Month
                      </div>
                      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>
                        {inv.billMonth}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginBottom: "2px",
                        }}
                      >
                        Units Consumed
                      </div>
                      <div style={{ fontWeight: 600, color: "#e2e8f0" }}>
                        {inv.unitsConsumed}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: "0.75rem",
                          marginBottom: "2px",
                        }}
                      >
                        Due Date
                      </div>
                      <div style={{ fontWeight: 600, color: "#fca5a5" }}>
                        {inv.dueDate}
                      </div>
                    </div>
                  </div>

                  {/* Charges Breakdown */}
                  <div
                    style={{
                      background: "rgba(15,23,42,0.4)",
                      borderRadius: "16px",
                      padding: "16px",
                      fontSize: "0.85rem",
                      border: "1px solid rgba(255,255,255,0.05)",
                      marginBottom: "24px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ color: "#94a3b8" }}>
                        Net Amount (Within Due Date):
                      </span>
                      <span style={{ fontWeight: 600, color: "#f8fafc" }}>
                        PKR {inv.amount.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                        paddingBottom: "8px",
                      }}
                    >
                      <span style={{ color: "#f87171" }}>
                        Late Payment Surcharge:
                      </span>
                      <span style={{ fontWeight: 600, color: "#f87171" }}>
                        + PKR {inv.lateFee.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        paddingTop: "4px",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#38bdf8" }}>
                        Gross Amount (After Due Date):
                      </span>
                      <span style={{ fontWeight: 700, color: "#38bdf8" }}>
                        PKR {inv.amountAfterDueDate.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {/* Pay Selector Box */}
                  {!isPaid &&
                    (() => {
                      // Check if today is past the due date dynamically
                      const isLate =
                        inv.rawDueDate && new Date() > new Date(inv.rawDueDate);
                      const payableAmount = isLate
                        ? inv.amountAfterDueDate
                        : inv.amount;

                      return (
                        <div
                          onClick={() => {
                            setSelectedInvoiceIds((prev) =>
                              prev.includes(inv.invoiceId)
                                ? prev.filter((id) => id !== inv.invoiceId)
                                : [...prev, inv.invoiceId],
                            );
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "14px 18px",
                            borderRadius: "14px",
                            background: isSelected
                              ? "rgba(99,102,241,0.15)"
                              : "rgba(255,255,255,0.02)",
                            border: isSelected
                              ? `1px solid ${accentColor}`
                              : "1px solid rgba(255,255,255,0.05)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        >
                          <div
                            style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "6px",
                              border: isSelected
                                ? "none"
                                : "2px solid rgba(255,255,255,0.3)",
                              background: isSelected
                                ? accentColor
                                : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {isSelected && (
                              <span
                                style={{
                                  color: "white",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                }}
                              >
                                ?
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: "0.9rem",
                              fontWeight: 500,
                              color: isSelected ? "#f8fafc" : "#94a3b8",
                            }}
                          >
                            {isLate
                              ? `Select this bill for checkout payment (PKR ${payableAmount.toLocaleString()} - Late Payment)`
                              : `Select this bill for checkout payment (PKR ${payableAmount.toLocaleString()})`}
                          </span>
                        </div>
                      );
                    })()}

                  {isPaid && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "12px",
                        borderRadius: "14px",
                        background: "rgba(16,185,129,0.1)",
                        border: "1px solid rgba(16,185,129,0.2)",
                        color: "#34d399",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                      }}
                    >
                       This bill is fully paid. No outstanding charges.
                    </div>
                  )}
                </div>
              );
            })}

            {/* -- Total & Pay Button -- */}
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
                  onClick={() => setShowBillConfirm(true)} //   Open the confirmation modal first!
                  disabled={loading || isFrozen}
                  style={{ margin: 0 }}
                >
                  {loading
                    ? "Processing..."
                    : `Pay PKR ${selectedTotal.toLocaleString()}`}
                </button>
              </div>
            )}

            {/* ?? BILL PAYMENT CONFIRMATION MODAL */}
            {/* ?? BILL PAYMENT CONFIRMATION MODAL */}
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
                      {"\u00D7"}
                    </button>
                  </div>

                  <p
                    style={{
                      color: "#94a3b8",
                      marginBottom: "15px",
                      fontSize: "0.9rem",
                      textAlign: "center",
                    }}
                  >
                    Please verify the bill details before paying:
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
                      <span style={{ color: "#94a3b8" }}>Bill Type:</span>
                      <strong style={{ color: "#f8fafc" }}>
                        {billForm.billType}
                      </strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                      }}
                    >
                      <span style={{ color: "#94a3b8" }}>Provider:</span>
                      <strong style={{ color: "#f8fafc" }}>
                        {billForm.provider}
                      </strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "12px",
                      }}
                    >
                      <span style={{ color: "#94a3b8" }}>Consumer Number:</span>
                      <strong style={{ color: "#f8fafc" }}>
                        {billForm.consumerNumber}
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
                        PKR {Number(selectedTotal).toLocaleString()}
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
                    This payment is instant and cannot be reversed once
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
                      onClick={() => {
                        setShowBillConfirm(false);
                        handlePayBill();
                      }}
                      disabled={loading}
                    >
                      {loading ? "Processing..." : "Confirm & Pay"}
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
                  `https://mern-auth1-qnmh.onrender.com/api/profile/mobile/${mobile}`,
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
                  //   Safe Reset on fail
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
                //   Safe Reset on catch exception (blocks screen freeze)
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
                My QR Code Mode
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
                Scan QR Mode
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
              <span style={{ fontSize: "2.5rem" }}>x</span>
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
              <span style={{ fontSize: "2.5rem" }}>x</span>
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
              Back to Main Menu
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
              Cancel Scan
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
                    Verified Wallexa Account
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
                {loading ? "Sending..." : `Send PKR ${qrAmount || "0"}`}
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
              Cancel & Exit
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
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault(); // Default form submit block karein
                                fetchFriendName(index, friend.mobileNumber);
                              }
                            }}
                            required
                            disabled={isFrozen}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              fetchFriendName(index, friend.mobileNumber)
                            }
                            disabled={isFrozen || !friend.mobileNumber}
                            style={{
                              padding: "4px 12px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #6366f1",
                              background: friend.mobileNumber
                                ? "#6366f1"
                                : "#e2e8f0",
                              color: friend.mobileNumber ? "white" : "#94a3b8",
                              cursor: friend.mobileNumber
                                ? "pointer"
                                : "not-allowed",
                              transition: "all 0.2s",
                            }}
                          >
                            Fetch
                          </button>
                          {friend.name && (
                            <span
                              style={{
                                fontSize: "0.85rem",
                                color:
                                  friend.name === "User not found" ||
                                  friend.name === "Not found" ||
                                  friend.name === "Already added" ||
                                  friend.name === "You cannot add yourself"
                                    ? "#ef4444"
                                    : "#10b981",
                                fontWeight: 500,
                              }}
                              font-weight={500}
                            >
                              {friend.name}
                            </span>
                          )}
                        </div>
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
                                    background:
                                      !friend.name ||
                                      friend.name === "User not found" ||
                                      friend.name === "Not found" ||
                                      friend.name === "Already added" ||
                                      friend.name === "You cannot add yourself"
                                        ? "#e2e8f0"
                                        : "white",
                                    cursor:
                                      !friend.name ||
                                      friend.name === "User not found" ||
                                      friend.name === "Not found" ||
                                      friend.name === "Already added" ||
                                      friend.name === "You cannot add yourself"
                                        ? "not-allowed"
                                        : "text",
                                  }}
                                  disabled={
                                    !friend.name ||
                                    friend.name === "User not found" ||
                                    friend.name === "Not found" ||
                                    friend.name === "Already added" ||
                                    friend.name === "You cannot add yourself"
                                  }
                                  value={friend.amount || ""}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value.replace(
                                      /[^0-9]/g,
                                      "",
                                    );

                                    //  ? Calculate other friends' total custom amounts
                                    const otherSum = splitForm.friends.reduce(
                                      (sum, f, i) => {
                                        if (i === index) return sum;
                                        return sum + Number(f.amount || 0);
                                      },
                                      0,
                                    );

                                    //  ? Max allowed share for this specific field
                                    const maxAllowed =
                                      Number(splitForm.totalAmount || 0) -
                                      otherSum;
                                    const newAmount = Number(val || 0);

                                    //  ? If entered value exceeds the limit, cap it automatically
                                    if (newAmount > maxAllowed) {
                                      const cappedVal =
                                        maxAllowed > 0
                                          ? String(maxAllowed)
                                          : "";
                                      const newFriends = [...splitForm.friends];
                                      newFriends[index].amount = cappedVal;
                                      setSplitForm({
                                        ...splitForm,
                                        friends: newFriends,
                                      });
                                      return;
                                    }

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
                                ).toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* ?? Live Custom Split Breakdown */}
              {splitForm.isCustom &&
                splitForm.totalAmount &&
                splitForm.friends.length > 0 &&
                splitForm.friends.every(
                  (f) =>
                    f.name &&
                    f.name !== "User not found" &&
                    f.name !== "Not found" &&
                    f.name !== "Already added" &&
                    f.name !== "You cannot add yourself",
                ) && (
                  <div
                    style={{
                      background: "#e0e7ff",
                      padding: "15px",
                      borderRadius: "12px",
                      color: "#3730a3",
                      marginTop: "15px",
                      fontSize: "0.95rem",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: "8px" }}>
                      Live Split Breakdown:
                    </strong>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {/* Friends custom shares list */}
                      {splitForm.friends.map((f, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>{f.name} will pay:</span>
                          <strong>
                            PKR {Number(f.amount || 0).toLocaleString()}
                          </strong>
                        </div>
                      ))}

                      {/* Divider line */}
                      <hr
                        style={{
                          border: "0",
                          borderTop: "1px solid #c7d2fe",
                          margin: "8px 0",
                        }}
                      />
                      {/* Initiator (You) remainder share */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>You will pay:</span>
                        <strong
                          style={{
                            color:
                              Number(splitForm.totalAmount) -
                                splitForm.friends.reduce(
                                  (sum, f) => sum + Number(f.amount || 0),
                                  0,
                                ) <
                              0
                                ? "#ef4444"
                                : "#3730a3",
                          }}
                        >
                          PKR{" "}
                          {(
                            Number(splitForm.totalAmount) -
                            splitForm.friends.reduce(
                              (sum, f) => sum + Number(f.amount || 0),
                              0,
                            )
                          ).toLocaleString()}
                        </strong>
                      </div>
                      {/* Warning error if custom amounts exceed total bill */}
                      {Number(splitForm.totalAmount) -
                        splitForm.friends.reduce(
                          (sum, f) => sum + Number(f.amount || 0),
                          0,
                        ) <
                        0 && (
                        <div
                          style={{
                            color: "#ef4444",
                            fontWeight: 600,
                            marginTop: "5px",
                            fontSize: "0.85rem",
                          }}
                        >
                          Warning: Sum of custom amounts exceeds total amount
                          by PKR{" "}
                          {Math.abs(
                            Number(splitForm.totalAmount) -
                              splitForm.friends.reduce(
                                (sum, f) => sum + Number(f.amount || 0),
                                0,
                              ),
                          ).toLocaleString()}
                          !
                        </div>
                      )}
                    </div>
                  </div>
                )}
              {/* ?? Live Equal Split Breakdown */}
              {splitForm.totalAmount &&
                splitForm.friends.length > 0 &&
                splitForm.friends.every(
                  (f) =>
                    f.name &&
                    f.name !== "User not found" &&
                    f.name !== "Not found" &&
                    f.name !== "Already added" &&
                    f.name !== "You cannot add yourself",
                ) &&
                !splitForm.isCustom && (
                  <div
                    style={{
                      background: "#e0e7ff",
                      padding: "15px",
                      borderRadius: "12px",
                      color: "#3730a3",
                      marginTop: "15px",
                      fontSize: "0.95rem",
                    }}
                  >
                    <strong style={{ display: "block", marginBottom: "8px" }}>
                      Live Equal Split Breakdown:
                    </strong>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {/* Friends equal shares */}
                      {splitForm.friends.map((f, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>{f.name} will pay:</span>
                          <strong>
                            PKR{" "}
                            {(
                              Number(splitForm.totalAmount) /
                              (splitForm.friends.length + 1)
                            ).toFixed(2)}
                          </strong>
                        </div>
                      ))}

                      {/* Divider line */}
                      <hr
                        style={{
                          border: "0",
                          borderTop: "1px solid #c7d2fe",
                          margin: "8px 0",
                        }}
                      />

                      {/* Initiator (You) share */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>You (Initiator) will pay:</span>
                        <strong>
                          PKR{" "}
                          {(
                            Number(splitForm.totalAmount) /
                            (splitForm.friends.length + 1)
                          ).toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              <button
                type="submit"
                className="primary-button"
                style={{ marginTop: "15px" }}
                disabled={
                  loading ||
                  isFrozen ||
                  !splitForm.description ||
                  !splitForm.totalAmount ||
                  Number(splitForm.totalAmount) <= 0 ||
                  splitForm.friends.length === 0 ||
                  splitForm.friends.some(
                    (f) =>
                      !f.name ||
                      f.name === "User not found" ||
                      f.name === "Not found" ||
                      f.name === "Already added" ||
                      f.name === "You cannot add yourself",
                  ) ||
                  (splitForm.isCustom &&
                    (splitForm.friends.some(
                      (f) => Number(f.amount || 0) <= 0,
                    ) ||
                      splitForm.friends.reduce(
                        (sum, f) => sum + Number(f.amount || 0),
                        0,
                      ) > Number(splitForm.totalAmount)))
                }
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
                              onClick={() => handleAcceptSplit(split._id, myParticipantInfo.amount)}
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
                              disabled={loading || isFrozen}
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
                              PKR {Number(p?.amount || 0).toLocaleString()} �{" "}
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

    const cancelEdit = () => {
      setEditingField(null);
      setProfileForm({
        firstName: profile.firstName || "",
        midName: profile.midName || "",
        lastName: profile.lastName || "",
        dateOfBirth: profile.dateOfBirth
          ? profile.dateOfBirth.split("T")[0]
          : "",
        nationality: profile.nationality || "",
      });
    };

    const saveField = async (fieldName) => {
      if (fieldName === "name") {
        if (!profileForm.firstName || !profileForm.lastName) {
          setToast({
            title: "Validation Error",
            msg: "First Name and Last Name are required.",
            type: "error",
          });
          return;
        }
      } else if (fieldName === "dob") {
        if (!profileForm.dateOfBirth) {
          setToast({
            title: "Validation Error",
            msg: "Date of Birth is required.",
            type: "error",
          });
          return;
        }

        // Age calculation & 18 years check
        const dobDate = new Date(profileForm.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const monthDiff = today.getMonth() - dobDate.getMonth();

        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < dobDate.getDate())
        ) {
          age--;
        }

        if (age < 18) {
          setToast({
            title: "Age Restriction",
            msg: "You must be at least 18 years old to use Wallexa.",
            type: "error",
          });
          return;
        }
      } else if (fieldName === "nationality") {
        if (!profileForm.nationality) {
          setToast({
            title: "Validation Error",
            msg: "Nationality is required.",
            type: "error",
          });
          return;
        }
      }

      setLoading(true);
      try {
        const res = await fetch(
          "https://mern-auth1-qnmh.onrender.com/api/profile/update",
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify(profileForm),
          },
        );
        const data = await res.json();
        if (res.ok) {
          setToast({
            title: "Success ?",
            msg: "Profile updated successfully!",
            type: "success",
          });
          setEditingField(null);
          fetchProfile();
        } else {
          setToast({ title: "Error", msg: data.message, type: "error" });
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
              value={
                editingField === "name" ? (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="First"
                      style={{
                        padding: "4px 8px",
                        fontSize: "0.85rem",
                        width: "80px",
                      }}
                      value={profileForm.firstName || ""}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          firstName: e.target.value.replace(/[^a-zA-Z]/g, ""),
                        })
                      }
                      required
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Middle"
                      style={{
                        padding: "4px 8px",
                        fontSize: "0.85rem",
                        width: "60px",
                      }}
                      value={profileForm.midName || ""}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          midName: e.target.value.replace(/[^a-zA-Z]/g, ""),
                        })
                      }
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Last"
                      style={{
                        padding: "4px 8px",
                        fontSize: "0.85rem",
                        width: "80px",
                      }}
                      value={profileForm.lastName || ""}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          lastName: e.target.value.replace(/[^a-zA-Z]/g, ""),
                        })
                      }
                      required
                    />
                  </div>
                ) : (
                  `${profile.firstName} ${profile.midName || ""} ${profile.lastName}`
                )
              }
              isEditing={editingField === "name"}
              onEdit={() => setEditingField("name")}
              onSave={() => saveField("name")}
              onCancel={cancelEdit}
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
              value={
                editingField === "dob" ? (
                  <input
                    type="date"
                    className="form-input"
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.9rem",
                      width: "150px",
                      colorScheme: "dark",
                    }}
                    max={
                      new Date(
                        new Date().setFullYear(new Date().getFullYear() - 18),
                      )
                        .toISOString()
                        .split("T")[0]
                    }
                    value={profileForm.dateOfBirth || ""}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        dateOfBirth: e.target.value,
                      })
                    }
                    required
                  />
                ) : (
                  new Date(profile.dateOfBirth).toLocaleDateString()
                )
              }
              isEditing={editingField === "dob"}
              onEdit={() => setEditingField("dob")}
              onSave={() => saveField("dob")}
              onCancel={cancelEdit}
            />

            <InfoRow
              label="Nationality"
              value={
                editingField === "nationality" ? (
                  <select
                    className="form-input"
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.9rem",
                      width: "200px",
                      background: "#0f172a",
                      color: "#cbd5e1",
                    }}
                    value={profileForm.nationality || ""}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        nationality: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="" disabled>
                      Select Nationality
                    </option>
                    {[
                      "Pakistan",
                      "United Arab Emirates",
                      "Saudi Arabia",
                      "United Kingdom",
                      "USA",
                    ].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : (
                  profile.nationality
                )
              }
              isEditing={editingField === "nationality"}
              onEdit={() => setEditingField("nationality")}
              onSave={() => saveField("nationality")}
              onCancel={cancelEdit}
            />

            <InfoRow
              label="Transaction PIN"
              value="������"
              onEdit={handleOpenForgotPin}
            />
            
          </div>
        </div>
      </div>
    );
  };

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

  // Handle Setting up Transaction PIN
  const handleSetupPinSubmit = async (e) => {
    e.preventDefault();
    setSetupError("");

    if (!setupPin || !confirmPin) {
      setSetupError("Please fill in both fields.");
      return;
    }

    if (setupPin.length !== 6 || confirmPin.length !== 6) {
      setSetupError("PIN must be exactly 6 digits.");
      return;
    }

    if (!/^\d+$/.test(setupPin)) {
      setSetupError("PIN must contain only numbers.");
      return;
    }

    if (setupPin !== confirmPin) {
      setSetupError("PINs do not match. Please verify.");
      return;
    }

    setSetupLoading(true);
    try {
      const res = await fetch(
        "https://mern-auth1-qnmh.onrender.com/api/wallet/setup-pin",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ pin: setupPin }),
        },
      );

      const data = await res.json();
      if (res.ok) {
        setIsPinSet(true);
        setToast({
          title: "PIN Setup Successful ?",
          msg: "Your secure transaction PIN has been set up successfully.",
          type: "success",
        });
      } else {
        setSetupError(data.message || "Failed to set up PIN.");
      }
    } catch (err) {
      console.error("Setup PIN frontend error:", err);
      setSetupError("Network error. Please try again.");
    } finally {
      setSetupLoading(false);
    }
  };

  // Block dashboard access overlay if PIN is not set
  if (!isPinSet) {
    return (
      <div
        className="dashboard-shell"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#08090d",
          padding: "20px",
        }}
      >
        <div
          className="modal-card"
          style={{
            maxWidth: "400px",
            width: "100%",
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: "20px",
            padding: "30px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "25px" }}>
            <h2
              style={{
                fontSize: "28px",
                fontWeight: "700",
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "1px",
              }}
            >
              WALLEXA
            </h2>
            <p style={{ color: "#a1a1aa", fontSize: "14px", marginTop: "8px" }}>
              Create your 6-digit Transaction PIN
            </p>
          </div>

          <p
            style={{
              fontSize: "13px",
              color: "#e4e4e7",
              lineHeight: "1.6",
              marginBottom: "20px",
              textAlign: "center",
              background: "rgba(99, 102, 241, 0.1)",
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid rgba(99, 102, 241, 0.2)",
            }}
          >
            <strong>Security Alert:</strong> This PIN will be required to
            verify all transactions. Please choose a secure 6-digit code.
          </p>

          <form
            onSubmit={handleSetupPinSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {setupError && (
              <div
                style={{
                  color: "#ef4444",
                  background: "rgba(239, 68, 68, 0.1)",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  textAlign: "center",
                }}
              >
               {setupError}
              </div>
            )}

            <div>
              <label
                style={{
                  display: "block",
                  color: "#a1a1aa",
                  fontSize: "12px",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                CREATE PIN
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showSetupPinVal ? "text" : "password"}
                  className="form-input"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: "20px",
                    letterSpacing: "6px",
                    fontWeight: "600",
                    paddingRight: "50px",
                  }}
                  maxLength={6}
                  placeholder="••••••"
                  value={setupPin}
                  onFocus={() => setFocusedPinField("setup")}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, ""); // Sirf numbers accept karega
                    setSetupPin(val);
                  }}
                />
                {focusedPinField === "setup" && (
                  <button
                    type="button"
                    onMouseDown={() => setShowSetupPinVal(true)}
                    onMouseUp={() => setShowSetupPinVal(false)}
                    onMouseLeave={() => setShowSetupPinVal(false)}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setShowSetupPinVal(true);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setShowSetupPinVal(false);
                    }}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "#6366f1",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {showSetupPinVal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "#a1a1aa",
                  fontSize: "12px",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                CONFIRM PIN
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showConfirmPinVal ? "text" : "password"}
                  className="form-input"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: "20px",
                    letterSpacing: "6px",
                    fontWeight: "600",
                    paddingRight: "50px",
                  }}
                  maxLength={6}
                  placeholder="••••••"
                  value={confirmPin}
                  onFocus={() => setFocusedPinField("confirm")}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, ""); // Sirf numbers accept karega
                    setConfirmPin(val);
                  }}
                />
                {focusedPinField === "confirm" && (
                  <button
                    type="button"
                    onMouseDown={() => setShowConfirmPinVal(true)}
                    onMouseUp={() => setShowConfirmPinVal(false)}
                    onMouseLeave={() => setShowConfirmPinVal(false)}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      setShowConfirmPinVal(true);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setShowConfirmPinVal(false);
                    }}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "#6366f1",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {showConfirmPinVal ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={setupLoading}
              style={{ marginTop: "10px", width: "100%" }}
            >
              {setupLoading ? "Setting Up PIN..." : "Confirm & Set PIN"}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
            {activeTab === "home"
              ? "Overview"
              : activeTab === "social"
                ? "Social Feed"
                : activeTab}
          </div>

          <div className="header-actions">
            {/* ?? MY SOCIAL PROFILE ICON (Only visible on Social Feed tab) */}
            {/* ?? MESSAGES BUTTON (Social Feed header) */}
            {activeTab === "social" && (
              <button
                className="notif-btn"
                style={{ position: "relative" }}
                onClick={() => {
                  setSelectedPublicUser(null);
                  setChatView(null);
                  setSocialView("messages");
                  fetchConversations();
                }}
                title="Messages"
              >
                <MessageCircle size={24} />
                {totalUnreadMessages > 0 && (
                  <span
                    className="badge"
                    style={{
                      background: "#ef4444",
                      position: "absolute",
                      top: "-2px",
                      right: "-2px",
                      minWidth: "18px",
                      height: "18px",
                      fontSize: "0.7rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    
                  >
                    {totalUnreadMessages}
                  </span>
                  
                )}
              </button>
            )}

                        {/* ?? MY SOCIAL PROFILE ICON (Messages ke right side) */}
            {activeTab === "social" && (
              <button
                className="notif-btn"
                onClick={() => {
                  if (!profile) return;
                  const myUserId = profile._id || profile.id;
                  if (profile.username) {
                    setActiveTab("social");
                    setSocialView("feed");
                    setChatView(null);
                    setSelectedPublicUser({
                      id: myUserId,
                      firstName: profile.displayName,
                      lastName: "",
                      username: profile.username,
                      profilePicture: profile.profilePicture,
                      status: "SELF",
                    });
                    fetchPublicUserPosts(myUserId);
                  } else {
                    setActiveTab("profile");
                  }
                }}
                title="My Profile"
              >
                <User size={24} />
              </button>
            )}
            {/* ?? FRIEND REQUESTS DROPDOWN BUTTON (Only visible on Social Feed tab) */}
            {activeTab === "social" && (
              <div className="notif-menu-wrap" data-notif-trigger>
                <button
                  className="notif-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFriendsDropdown((prev) => {
                      const next = !prev;
                      if (next) markAsRead("social");
                      return next;
                    });
                    setShowNotifDropdown(false);
                  }}
                >
                  <Heart size={24} />{" "}
                  {/* ?? Users icon ko Heart icon se replace kiya */}
                  {friendRequests.length +
                    notifications.filter(
                      (n) =>
                        (n.type === "SOCIAL_COMMENT" ||
                          n.type === "SOCIAL_REACT") &&
                        !n.isRead,
                    ).length >
                    0 && (
                    <span className="badge" style={{ background: "#ef4444" }}>
                      {friendRequests.length +
                        notifications.filter(
                          (n) =>
                            (n.type === "SOCIAL_COMMENT" ||
                              n.type === "SOCIAL_REACT") &&
                            !n.isRead,
                        ).length}
                    </span>
                  )}
                </button>

                {/* FRIEND REQUESTS DROPDOWN */}
                {showFriendsDropdown && (
                  <div
                    className="notif-dropdown"
                    data-notif-panel
                    onClick={(e) => e.stopPropagation()}
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
                        Social Activity
                      </h3>
                      <button
                        type="button"
                        className="close-btn"
                        onClick={closeNotificationPanels}
                        aria-label="Close notifications"
                      >
                        {"\u00D7"}
                      </button>
                    </div>
                    <div style={{ maxHeight: "350px", overflowY: "auto" }}>
                      {/* Friend Requests � inline accept/reject */}
                      {friendRequests.length > 0 && (
                        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "8px", marginBottom: "4px" }}>
                          <div style={{ padding: "10px 15px 6px", color: "#818cf8", fontWeight: 700, fontSize: "0.82rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>Friend Requests</div>
                          {friendRequests.map((req) => (
                            <div key={req._id} style={{ padding: "10px 15px", display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>
                                {req.sender?.profilePicture ? <img src={req.sender.profilePicture} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : (req.sender?.firstName?.[0] || "?").toUpperCase()}
                              </div>
                              <div style={{ flex: 1, overflow: "hidden" }}>
                                <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.sender?.firstName} {req.sender?.lastName}</div>
                              </div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button onClick={() => { handleAcceptFriendRequest(req._id, req.sender?.firstName); setShowFriendsDropdown(false); }} style={{ background: "#10b981", color: "white", border: "none", borderRadius: "8px", padding: "5px 10px", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>Accept</button>
                                <button onClick={() => { handleRejectFriendRequest(req._id); }} style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "5px 10px", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>Reject</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ?? Social Notifications (Comments & Reactions) */}
                      {notifications.filter(
                        (n) =>
                          n.type === "SOCIAL_COMMENT" ||
                          n.type === "SOCIAL_REACT",
                      ).length === 0 && friendRequests.length === 0 ? (
                        <p
                          style={{
                            padding: "25px",
                            textAlign: "center",
                            color: "#94a3b8",
                            fontSize: "0.9rem",
                            margin: 0,
                          }}
                        >
                          No recent activity
                        </p>
                      ) : (
                        notifications
                          .filter(
                            (n) =>
                              n.type === "SOCIAL_COMMENT" ||
                              n.type === "SOCIAL_REACT",
                          )
                          .map((notif) => (
                            <div
                              key={notif._id}
                              onClick={() =>
                                handleSocialNotificationClick(notif)
                              }
                              style={{
                                padding: "12px 15px",
                                borderBottom:
                                  "1px solid rgba(255,255,255,0.05)",
                                background: notif.isRead
                                  ? "transparent"
                                  : "rgba(99, 102, 241, 0.08)",
                                cursor: "pointer",
                                transition: "background 0.2s",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: "#f8fafc",
                                  fontSize: "0.85rem",
                                  marginBottom: "2px",
                                }}
                              >
                                {notif.title}
                              </div>
                              <div
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "0.8rem",
                                  lineHeight: "1.3",
                                }}
                              >
                                {notif.message}
                              </div>
                              <div
                                style={{
                                  color: "#64748b",
                                  fontSize: "0.75rem",
                                  marginTop: "4px",
                                }}
                              >
                                {new Date(notif.createdAt).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true,
                                  },
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

            {/* ?? BELL NOTIFICATIONS BUTTON (Visible on all tabs EXCEPT Social Feed) */}
            {activeTab !== "social" && (
              <div className="notif-menu-wrap" data-notif-trigger>
                <button
                  className="notif-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotifDropdown((prev) => !prev);
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
                  <div
                    className="notif-dropdown"
                    data-notif-panel
                    onClick={(e) => e.stopPropagation()}
                  >
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
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                      <button
                        type="button"
                        className="close-btn"
                        onClick={closeNotificationPanels}
                        aria-label="Close notifications"
                      >
                        {"\u00D7"}
                      </button>
                      </div>
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
                        notifications
                          .filter(
                            (n) =>
                              n.type !== "SOCIAL_COMMENT" &&
                              n.type !== "SOCIAL_REACT",
                          )
                          .map((notif) => (
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

        {(showFriendsDropdown || showNotifDropdown) && (
          <div
            className="notif-backdrop"
            onClick={closeNotificationPanels}
            aria-hidden="true"
          />
        )}

        {activeTab === "home" && renderHome()}
        {activeTab === "send" && renderSend()}
        {activeTab === "add" && renderAdd()}
        {activeTab === "social" && renderSocial()}
        {activeTab === "history" && (isFrozen ? (
          <div className="view-container">
            <h2 className="page-title">Transaction History</h2>
            <div style={{textAlign:"center",padding:"50px 20px",color:"#94a3b8",background:"rgba(255,255,255,0.02)",borderRadius:"12px",border:"1px solid rgba(239,68,68,0.2)",marginTop:"20px"}}>
              <h3 style={{color:"#ef4444",marginBottom:"10px"}}>Account is Frozen</h3>
              <p>Please unfreeze your account to view transaction history.</p>
            </div>
          </div>
        ) : renderHistory())}
        {activeTab === "bills" && renderBills()}
        {activeTab === "split" && (isFrozen ? (
          <div className="view-container">
            <h2 className="page-title">Split Bill</h2>
            <div style={{textAlign:"center",padding:"50px 20px",color:"#94a3b8",background:"rgba(255,255,255,0.02)",borderRadius:"12px",border:"1px solid rgba(239,68,68,0.2)",marginTop:"20px"}}>
              <h3 style={{color:"#ef4444",marginBottom:"10px"}}>Account is Frozen</h3>
              <p>Please unfreeze your account to manage split bills.</p>
            </div>
          </div>
        ) : renderSplit())}
        {activeTab === "qr" && renderQR()}
        {activeTab === "profile" && (isFrozen ? (
          <div className="view-container">
            <h2 className="page-title">Profile Settings</h2>
            <div style={{textAlign:"center",padding:"50px 20px",color:"#94a3b8",background:"rgba(255,255,255,0.02)",borderRadius:"12px",border:"1px solid rgba(239,68,68,0.2)",marginTop:"20px"}}>
              <h3 style={{color:"#ef4444",marginBottom:"10px"}}>Account is Frozen</h3>
              <p>Profile is locked. PIN reset is also disabled. Please unfreeze your account first.</p>
            </div>
          </div>
        ) : renderProfile())}

        {/* TRANSACTION DETAIL MODAL */}
        {/* TRANSACTION DETAIL MODAL */}
        {showTxDetail && selectedTx && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 99999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClick={() => setShowTxDetail(false)}
          >
            {/* Print styles for transaction history receipt */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-history-receipt, #printable-history-receipt * {
                  visibility: visible !important;
                }
                #printable-history-receipt {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  box-shadow: none !important;
                  border: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
                }
                #printable-history-receipt * {
                  color: #000000 !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>

            <div
              id="printable-history-receipt"
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "90%",
                maxWidth: "420px",
                background: "#1e293b",
                borderRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "28px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                textAlign: "center",
                color: "#f8fafc",
                position: "relative",
              }}
            >
              {/* Close Cross Button */}
              <button
                className="close-btn no-print"
                onClick={() => setShowTxDetail(false)}
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {"\u00D7"}
              </button>
              {/* Success Badge / Icon */}
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    background: "rgba(16, 185, 129, 0.12)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    border: "2px solid #10b981",
                  }}
                >
                  <span style={{ fontSize: "2.2rem" }}>✓</span>
                </div>
                <h2
                  style={{
                    marginTop: "15px",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "#10b981",
                  }}
                >
                  Transaction Completed
                </h2>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    marginTop: "4px",
                  }}
                >
                  Your transaction has been processed successfully.
                </p>
              </div>

              {/* Amount Display */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "16px",
                  padding: "16px",
                  marginBottom: "24px",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {selectedTx.type === "ADD_MONEY"
                    ? "Amount Deposited"
                    : selectedTx.type === "RECEIVE"
                      ? "Amount Received"
                      : selectedTx.type === "BILL_PAYMENT" ||
                          selectedTx.type === "SPLIT_PAYMENT"
                        ? "Amount Paid"
                        : "Amount Sent"}
                </span>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: selectedTx.isSender ? "#ef4444" : "#10b981",
                    marginTop: "4px",
                  }}
                >
                  {selectedTx.isSender ? "-" : "+"} PKR{" "}
                  {Number(selectedTx.amount).toLocaleString()}
                </div>
              </div>

              {/* Detail Key-Value Grid */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  textAlign: "left",
                  fontSize: "0.88rem",
                  marginBottom: "28px",
                  borderBottom: "1px dashed rgba(255, 255, 255, 0.1)",
                  paddingBottom: "20px",
                }}
              >
                                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Transaction ID:</span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontFamily: "monospace",
                      color: "#e2e8f0",
                    }}
                  >
                    {selectedTx._id}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Date & Time:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {new Date(selectedTx.createdAt).toLocaleString("en-PK", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Transaction Type:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {selectedTx.description?.startsWith("QR Payment to")
                    ? "QR Payment"
                    : selectedTx.description?.startsWith("Checkout:")
                    ? "Chrome Extension"
                    : selectedTx.type === "SEND"
                      ? "Wallexa P2P Sent"
                      : selectedTx.type === "RECEIVE"
                        ? "Wallexa P2P Received"
                        : selectedTx.type === "BILL_PAYMENT"
                          ? "Utility Bill Payment"
                          : selectedTx.type === "EXTERNAL_TRANSFER"
                            ? "Local Bank Transfer"
                            : selectedTx.type === "SPLIT_PAYMENT"
                              ? "Split Bill Payment"
                              : "Wallet Deposit"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Status:</span>
                  <span style={{ fontWeight: 600, color: selectedTx.isSender ? "#ef4444" : "#10b981" }}>
                    {selectedTx.isSender ? "Sent" : "Received"}
                  </span>
                </div>
                {(selectedTx.description && selectedTx.type !== "ADD_MONEY") && (
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#94a3b8" }}>Description:</span>
                    <span style={{ fontWeight: 600, color: "#e2e8f0", textAlign: "right" }}>
                                             {selectedTx.type === "EXTERNAL_TRANSFER"
                        ? "Bank Transfer"
                        : selectedTx.description?.startsWith("Checkout:")
                        ? `Total Bill: PKR ${Number(selectedTx.amount).toLocaleString()}`
                        : (selectedTx.type === "SEND" || selectedTx.type === "RECEIVE") &&
                          (selectedTx.description?.startsWith("Transfer to") || selectedTx.description?.startsWith("QR Payment to"))
                          ? "Sent via Wallexa"
                          : selectedTx.type === "BILL_PAYMENT"
                            ? selectedTx.description?.split(" � ")[0]
                            : selectedTx.type === "SPLIT_PAYMENT" && selectedTx.description?.startsWith("Split Paid:")
                              ? selectedTx.description.replace("Split Paid:", "Split Paid -")
                              : selectedTx.description}
                    </span>
                  </div>
                )}

                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    margin: "8px 0",
                  }}
                />

                {/* Sender Details */}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Sender Name:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {selectedTx.type === "ADD_MONEY"
                      ? "Stripe Payment Gateway"
                      : !selectedTx.isSender
                        ? selectedTx.otherPartyName
                        : `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim()}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Sender Account:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {selectedTx.type === "ADD_MONEY"
                      ? "Visa / Mastercard"
                      : !selectedTx.isSender
                        ? maskInfo(selectedTx.otherPartyMobile) || "N/A"
                        : maskInfo(profile?.mobileNumber) || "N/A"}
                  </span>
                </div>

                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    margin: "8px 0",
                  }}
                />

               {/* Receiver Details */}
                {selectedTx.type === "EXTERNAL_TRANSFER" && selectedTx.bankName && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94a3b8" }}>Bank Name:</span>
                    <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{selectedTx.bankName}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>
                    {selectedTx.type === "BILL_PAYMENT"
                      ? "Utility Provider:"
                      : selectedTx.type === "SPLIT_PAYMENT"
                        ? "Requester Name:"
                        : "Receiver Name:"}
                  </span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {selectedTx.type === "BILL_PAYMENT"
                      ? selectedTx.description.split(" Bill")[0].replace("Paid ", "")
                      : selectedTx.isSender || selectedTx.type === "EXTERNAL_TRANSFER"
                        ? selectedTx.otherPartyName
                        : `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim()}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>
                    {selectedTx.type === "EXTERNAL_TRANSFER" 
                      ? "Account / IBAN:" 
                      : selectedTx.type === "BILL_PAYMENT"
                        ? "Consumer Number:"
                        : selectedTx.type === "SPLIT_PAYMENT"
                          ? "Requester Account:"
                          : "Receiver Account:"}
                  </span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {selectedTx.type === "BILL_PAYMENT"
                      ? selectedTx.otherPartyMobile || "N/A"
                      : selectedTx.isSender || selectedTx.type === "EXTERNAL_TRANSFER"
                        ? maskInfo(selectedTx.otherPartyMobile) || "N/A"
                        : maskInfo(profile?.mobileNumber) || "N/A"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                className="no-print"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginTop: "8px",
                }}
              >
                <button
                  className="primary-button"
                  style={{
                    gridColumn: "span 2",
                    background:
                      "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                    margin: 0,
                  }}
                  onClick={() => setShowTxDetail(false)}
                >
                  Close
                </button>
                <button
                  className="secondary-button"
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    margin: 0,
                  }}
                  onClick={() =>
                    handleDownloadPdf(
                      "printable-history-receipt",
                      `Receipt_${selectedTx._id}.pdf`,
                    )
                  }
                >
                  Download PDF
                </button>
                <button
                  className="secondary-button"
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    margin: 0,
                  }}
                  onClick={() =>
                    handleSharePdf(
                      "printable-history-receipt",
                      `Receipt_${selectedTx._id}.pdf`,
                    )
                  }
                >
                  Share Receipt
                </button>
                <button
                  className="secondary-button"
                  style={{
                    gridColumn: "span 2",
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                    border: "none",
                    margin: 0,
                    color: "white",
                  }}
                  onClick={() => {
                    const mapped = mapTxToReceiptData(selectedTx, profile);
                    setReceiptData(mapped);
                    setShareFeedCaption("");
                    setShareFeedVisibility("public");
                    setShowShareFeedModal(true);
                  }}
                >
                  Share to Wallexa Feed
                </button>
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
                  {isFrozen ? "Unfreeze Account" : "Freeze Account"}
                </h3>
                <button
                  className="close-btn"
                  onClick={() => setShowFreezeConfirm(false)}
                >
                  {"\u00D7"}
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

        {/* FORGOT TRANSACTION PIN RECOVERY MODAL */}
        {showForgotPinModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: "380px" }}>
              <div className="modal-header">
                <h3>
                  {pinWizardMode === "change"
                    ? "Change Transaction PIN"
                    : "Reset Transaction PIN"}
                </h3>
                <button
                  className="close-btn"
                  onClick={() => {
                    setShowForgotPinModal(false);
                    setForgotPinStep(1);
                    setForgotPinPassword("");
                    setForgotPinIdentifier("");
                    setForgotPinOtp("");
                    setForgotPinNewPin("");
                    setForgotPinConfirmPin("");
                    setForgotPinError("");
                    setChangePinCurrent("");
                    setPinWizardMode("change");
                  }}
                >
                  {"\u00D7"}
                </button>
              </div>

              {forgotPinError && (
                <div
                  style={{
                    color: "#ef4444",
                    background: "rgba(239, 68, 68, 0.1)",
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    textAlign: "center",
                    marginBottom: "15px",
                  }}
                >
                  {forgotPinError}
                </div>
              )}

              {/* STAGE 1: VERIFY CURRENT PIN OR PASSWORD */}
              {forgotPinStep === 1 && (
                <>
                  {pinWizardMode === "change" ? (
                    // WIZARD A: CHANGE PIN FORM
                    <form
                      onSubmit={handleChangePinCurrentSubmit}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "15px",
                      }}
                    >
                      <p
                        style={{
                          color: "#cbd5e1",
                          fontSize: "13px",
                          textAlign: "center",
                          marginBottom: "5px",
                        }}
                      >
                        Enter your current 6-digit Transaction PIN to receive a
                        verification code on your email.
                      </p>

                      {/* Agar user 3 baar galat current PIN enter kar deta hai toh professional alert message */}
                      {failedPinAttempts >= 3 && (
                        <div
                          style={{
                            color: "#ef4444",
                            fontSize: "12.5px",
                            textAlign: "center",
                            fontWeight: "500",
                            background: "rgba(239, 68, 68, 0.1)",
                            padding: "10px",
                            borderRadius: "8px",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                            marginBottom: "5px",
                          }}
                        >
                          Too many incorrect attempts. Please recover your
                          Transaction PIN using the 'Forgot PIN?' option below.
                        </div>
                      )}

                      <div>
                        <label
                          style={{
                            display: "block",
                            color: "#a1a1aa",
                            fontSize: "12px",
                            marginBottom: "6px",
                          }}
                        >
                          CURRENT TRANSACTION PIN
                        </label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showChangePinVal ? "text" : "password"}
                            className="form-input"
                            style={{
                              width: "100%",
                              textAlign: "center",
                              fontSize: "20px",
                              letterSpacing: "6px",
                              fontWeight: "600",
                              paddingRight: "50px",
                            }}
                            maxLength={6}
                           placeholder="••••••"
                            value={changePinCurrent}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setChangePinCurrent(val);
                            }}
                            disabled={failedPinAttempts >= 3} // Input fields block ho jayengi
                            required
                          />
                          <button
                            type="button"
                            onMouseDown={() =>
                              failedPinAttempts < 3 && setShowChangePinVal(true)
                            }
                            onMouseUp={() => setShowChangePinVal(false)}
                            onMouseLeave={() => setShowChangePinVal(false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              failedPinAttempts < 3 &&
                                setShowChangePinVal(true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              setShowChangePinVal(false);
                            }}
                            disabled={failedPinAttempts >= 3} // Native disable attribute
                            style={{
                              position: "absolute",
                              right: "12px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              color:
                                failedPinAttempts >= 3 ? "#64748b" : "#a855f7", // Disabled hone par icon color gray ho jayega
                              cursor:
                                failedPinAttempts >= 3 ? "default" : "pointer", // Disabled hone par pointer hand cursor hat jayega
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            {showChangePinVal ? (
                              <EyeOff size={18} />
                            ) : (
                              <Eye size={18} />
                            )}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="primary-button"
                        disabled={forgotPinLoading || failedPinAttempts >= 3} // Button block ho jayegi
                        style={{ marginTop: "10px", width: "100%" }}
                      >
                        {forgotPinLoading
                          ? "Verifying..."
                          : "Verify & Send OTP"}
                      </button>

                      {/* Forgot PIN Navigation */}
                      <div style={{ textAlign: "center", marginTop: "10px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPinWizardMode("forgot");
                            setForgotPinStep(1);
                            setForgotPinError("");
                            setChangePinCurrent("");
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#a855f7",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: "13px",
                          }}
                        >
                          Forgot PIN?
                        </button>
                      </div>
                    </form>
                  ) : (
                    // WIZARD B: FORGOT PIN FORM
                    <form
                      onSubmit={handleForgotPinPasswordSubmit}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "15px",
                      }}
                    >
                      <p
                        style={{
                          color: "#cbd5e1",
                          fontSize: "13px",
                          textAlign: "center",
                          marginBottom: "5px",
                        }}
                      >
                        To verify your identity, please enter your registered
                        Email/Mobile and login password. We will send a
                        verification code to your email.
                      </p>
                      <div>
                        <label
                          style={{
                            display: "block",
                            color: "#a1a1aa",
                            fontSize: "12px",
                            marginBottom: "6px",
                          }}
                        >
                          REGISTERED EMAIL OR MOBILE
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ width: "100%" }}
                          placeholder="Enter registered email or mobile number"
                          value={forgotPinIdentifier}
                          onChange={(e) =>
                            setForgotPinIdentifier(e.target.value)
                          }
                          required
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            color: "#a1a1aa",
                            fontSize: "12px",
                            marginBottom: "6px",
                          }}
                        >
                          PASSWORD
                        </label>
                        <input
                          type="password"
                          className="form-input"
                          style={{ width: "100%" }}
                          placeholder="Enter your login password"
                          value={forgotPinPassword}
                          onChange={(e) => setForgotPinPassword(e.target.value)}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        className="primary-button"
                        disabled={forgotPinLoading}
                        style={{ marginTop: "10px", width: "100%" }}
                      >
                        {forgotPinLoading
                          ? "Verifying..."
                          : "Verify & Send OTP"}
                      </button>

                      {/* Back to Change PIN option */}
                      <div style={{ textAlign: "center", marginTop: "10px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPinWizardMode("change");
                            setForgotPinStep(1);
                            setForgotPinError("");
                            setForgotPinPassword("");
                            setForgotPinIdentifier("");
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#a855f7",
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: "13px",
                          }}
                        >
                          Back to Change PIN
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {/* STAGE 2: ENTER OTP */}
              {forgotPinStep === 2 && (
                <form
                  onSubmit={handleForgotPinOtpSubmit}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "15px",
                  }}
                >
                  <p
                    style={{
                      color: "#cbd5e1",
                      fontSize: "13px",
                      textAlign: "center",
                      marginBottom: "5px",
                    }}
                  >
                    Enter the 6-digit verification code sent to your registered
                    email address.
                  </p>
                  <div>
                    <label
                      style={{
                        display: "block",
                        color: "#a1a1aa",
                        fontSize: "12px",
                        marginBottom: "6px",
                      }}
                    >
                      ENTER OTP CODE
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      style={{
                        width: "100%",
                        textAlign: "center",
                        letterSpacing: "5px",
                        fontSize: "1.5rem",
                      }}
                      maxLength={6}
                      placeholder="••••••"
                      value={forgotPinOtp}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setForgotPinOtp(val);
                      }}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="primary-button"
                    style={{ marginTop: "10px", width: "100%" }}
                  >
                    Next Step
                  </button>
                </form>
              )}

              {/* STAGE 3: ENTER NEW PIN */}
              {forgotPinStep === 3 && (
                <form
                  onSubmit={handleForgotPinResetSubmit}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "15px",
                  }}
                >
                  <p
                    style={{
                      color: "#cbd5e1",
                      fontSize: "13px",
                      textAlign: "center",
                      marginBottom: "5px",
                    }}
                  >
                    Choose a new 6-digit transaction PIN.
                  </p>
                  <div>
                    <label
                      style={{
                        display: "block",
                        color: "#a1a1aa",
                        fontSize: "12px",
                        marginBottom: "6px",
                      }}
                    >
                      NEW PIN
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showForgotPinVal ? "text" : "password"}
                        className="form-input"
                        style={{
                          width: "100%",
                          textAlign: "center",
                          fontSize: "20px",
                          letterSpacing: "6px",
                          fontWeight: "600",
                          paddingRight: "50px",
                        }}
                        maxLength={6}
                        placeholder="••••••"
                        value={forgotPinNewPin}
                        onFocus={() => setFocusedForgotPinField("new")}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setForgotPinNewPin(val);
                        }}
                        required
                      />
                      {focusedForgotPinField === "new" && (
                        <button
                          type="button"
                          onMouseDown={() => setShowForgotPinVal(true)}
                          onMouseUp={() => setShowForgotPinVal(false)}
                          onMouseLeave={() => setShowForgotPinVal(false)}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            setShowForgotPinVal(true);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            setShowForgotPinVal(false);
                          }}
                          style={{
                            position: "absolute",
                            right: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            color: "#a855f7",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {showForgotPinVal ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        color: "#a1a1aa",
                        fontSize: "12px",
                        marginBottom: "6px",
                      }}
                    >
                      CONFIRM NEW PIN
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showForgotConfirmPinVal ? "text" : "password"}
                        className="form-input"
                        style={{
                          width: "100%",
                          textAlign: "center",
                          fontSize: "20px",
                          letterSpacing: "6px",
                          fontWeight: "600",
                          paddingRight: "50px",
                        }}
                        maxLength={6}
                        placeholder="••••••"
                        value={forgotPinConfirmPin}
                        onFocus={() => setFocusedForgotPinField("confirm")}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setForgotPinConfirmPin(val);
                        }}
                        required
                      />
                      {focusedForgotPinField === "confirm" && (
                        <button
                          type="button"
                          onMouseDown={() => setShowForgotConfirmPinVal(true)}
                          onMouseUp={() => setShowForgotConfirmPinVal(false)}
                          onMouseLeave={() => setShowForgotConfirmPinVal(false)}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            setShowForgotConfirmPinVal(true);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            setShowForgotConfirmPinVal(false);
                          }}
                          style={{
                            position: "absolute",
                            right: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            background: "none",
                            border: "none",
                            color: "#a855f7",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {showForgotConfirmPinVal ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={forgotPinLoading}
                    style={{ marginTop: "10px", width: "100%" }}
                  >
                    {forgotPinLoading
                      ? "Resetting PIN..."
                      : "Reset Transaction PIN"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* SECURE TRANSACTION PIN MODAL */}
        {showPinModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: "380px" }}>
              <div className="modal-header">
                <h3>Enter Transaction PIN</h3>
                <button
                  className="close-btn"
                  onClick={() => {
                    setShowPinModal(false);
                    setTransactionPinCode("");
                    setPinError("");
                    setPendingTx(null);
                  }}
                >
                  {"\u00D7"}
                </button>
              </div>
              <p
                style={{
                  marginBottom: "20px",
                  color: "#cbd5e1",
                  fontSize: "14px",
                  textAlign: "center",
                }}
              >
                Please enter your 6-digit secure transaction PIN to authorize
                this transfer.
              </p>

              <form
                onSubmit={handlePinSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "15px",
                }}
              >
                {/* Agar mustResetPin active hai toh foran Security alert warning show karein, warna aam pinError dikhayein */}
                {(pinError || mustResetPin) && (
                  <div
                    style={{
                      color: "#ef4444",
                      background: "rgba(239, 68, 68, 0.1)",
                      padding: "10px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      textAlign: "center",
                    }}
                  >
                    {" "}
                    {mustResetPin
                      ? "Security Alert: You must reset your Transaction PIN from your Profile tab before you can authorize any transactions."
                      : pinError}
                  </div>
                )}

                <input
                  type="password"
                  className="form-input"
                  style={{
                    textAlign: "center",
                    letterSpacing: "6px",
                    fontSize: "1.8rem",
                    fontWeight: "700",
                  }}
                  maxLength={6}
                  placeholder="••••••"
                  value={transactionPinCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, ""); // Only numbers
                    setTransactionPinCode(val);
                  }}
                  disabled={mustResetPin} // mustResetPin active hone par input disable ho jayega
                  autoFocus={!mustResetPin} // mustResetPin active hone par autofous band rahega
                />

                <button
                  type="submit"
                  className="primary-button"
                  disabled={pinLoading || mustResetPin} // mustResetPin active hone par button disable ho jayega
                  style={{ marginTop: "10px", width: "100%" }}
                >
                  {pinLoading ? "Authorizing..." : "Verify & Pay"}
                </button>

                <div style={{ textAlign: "center", marginTop: "10px" }}>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#a855f7",
                      fontSize: "13px",
                      cursor: "pointer",
                      fontWeight: "600",
                      textDecoration: "underline",
                    }}
                    onClick={() => {
                      setShowPinModal(false);
                      setTransactionPinCode("");
                      setPinError("");
                      // Forgot PIN flow trigger
                      handleOpenForgotPin();
                    }}
                  >
                    Forgot Transaction PIN?
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* OTP VERIFICATION MODAL */}
        {showOtpModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: "380px" }}>
              <div className="modal-header">
                <h3>
                  {otpPurpose === "freeze"
                    ? "Freeze Wallet Authorization"
                    : "Transaction Authorization"}
                </h3>
                <button
                  className="close-btn"
                  onClick={() => {
                    setShowOtpModal(false);
                    setOtp("");
                  }}
                >
                  {"\u00D7"}
                </button>
              </div>
              <p
                style={{
                  color: "#cbd5e1",
                  fontSize: "13px",
                  textAlign: "center",
                  marginBottom: "20px",
                  lineHeight: "1.5",
                }}
              >
                Enter the 6-digit verification code sent to your registered
                email address to confirm this action.
              </p>
              <div>
                <label
                  style={{
                    display: "block",
                    color: "#a1a1aa",
                    fontSize: "12px",
                    marginBottom: "6px",
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  ENTER OTP CODE
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    letterSpacing: "5px",
                    fontSize: "1.5rem",
                  }}
                  maxLength={6}
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <button
                className="primary-button"
                style={{ marginTop: "20px", width: "100%" }}
                onClick={handleOtpSubmit}
              >
                Verify & Confirm
              </button>
            </div>
          </div>
        )}

        {/* PEER TO PEER SEND CONFIRMATION MODAL */}
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
                  {"\u00D7"}
                </button>
              </div>

              <p
                style={{
                  color: "#94a3b8",
                  marginBottom: "15px",
                  fontSize: "0.9rem",
                  textAlign: "center",
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
                  <span style={{ color: "#94a3b8" }}>Recipient:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    {sendForm.recipientName}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Mobile Number:</span>
                  <strong style={{ color: "#f8fafc" }}>
                    {sendForm.recipient}
                  </strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Transfer Fee:</span>
                  <strong style={{ color: "#10b981" }}>Free</strong>
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
                    PKR {Number(sendForm.amount).toLocaleString()}
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
                This transfer is instant and cannot be reversed once
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
                  onClick={handleSend}
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Confirm & Send"}
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
                  {"\u00D7"}
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
                This transfer is instant and cannot be reversed once
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
                  {loading ? "Sending..." : "Confirm & Send"}
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
                  {"\u00D7"}
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
                    {externalForm.accountNumber}
                  </strong>
                </div>

                {/* ?? Dynamically Fetched Account Title Display */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>Account Title:</span>
                  <strong style={{ color: "#f59e0b" }}>
                    {externalForm.bankName === "Stripe Sandbox Bank" 
                      ? "Stripe Sandbox" 
                      : validatedAccountHolder}
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
                This transaction will be validated via Stripe API and cannot
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
                  {loading ? "Sending..." : "Confirm Transfer"}
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
                  Deactivate Social Profile
                </h3>
                <button
                  className="close-btn"
                  onClick={() => setShowDeactivateConfirm(false)}
                >
                  {"\u00D7"}
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
                Are you sure you want to deactivate your social profile?
                Your profile, posts, and friends will be hidden from everyone.
                Your data will be saved and you can reactivate anytime.
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
                  {loading ? "Deactivating..." : "Yes, Deactivate"}
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

        {/* ?? COMMENTS SLIDING BOTTOM SHEET */}
        {activeCommentPost && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.6)",
              zIndex: 9999,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
            }}
            onClick={() => setActiveCommentPost(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "600px",
                background: "var(--bg-card)",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderBottom: "none",
                padding: "24px",
                maxHeight: "85vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.5)",
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  paddingBottom: "12px",
                  flexShrink: 0,
                }}
              >
                <h3 style={{ color: "#f8fafc", fontSize: "1.2rem", margin: 0 }}>
                  Comments (
                  {activeCommentPost.comments
                    ? activeCommentPost.comments.length
                    : 0}
                  )
                </h3>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Close comments"
                  onClick={() => setActiveCommentPost(null)}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    cursor: "pointer",
                  }}
                >
                  {"\u00D7"}
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  paddingRight: "4px",
                  marginBottom: "12px",
                }}
              >
              {/* Original Post Preview */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  borderRadius: "16px",
                  padding: "15px",
                  marginBottom: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      color: "white",
                      fontSize: "0.9rem",
                    }}
                  >
                    {activeCommentPost.author &&
                    activeCommentPost.author.profilePicture ? (
                      <img
                        src={activeCommentPost.author.profilePicture}
                        alt="Avatar"
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    ) : activeCommentPost.author ? (
                      activeCommentPost.author.firstName.charAt(0).toUpperCase()
                    ) : (
                      "?"
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        color: "#f8fafc",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                      }}
                    >
                      {activeCommentPost.author
                        ? `${activeCommentPost.author.firstName} ${activeCommentPost.author.lastName || ""}`
                        : "User"}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    color: "#e2e8f0",
                    fontSize: "0.95rem",
                    margin: 0,
                    lineHeight: "1.4",
                  }}
                >
                  {renderPostContent(activeCommentPost.content, "#e2e8f0", {
                    compact: true,
                  })}
                </div>
              </div>

              {/* Comments List */}
              <div style={{ paddingBottom: "8px" }}>
                {!activeCommentPost.comments ||
                activeCommentPost.comments.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "45px 20px",
                      color: "#94a3b8",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "2.8rem",
                        marginBottom: "15px",
                        opacity: 0.3,
                      }}
                    >
                      x
                    </div>
                    <h4
                      style={{
                        color: "#cbd5e1",
                        margin: "0 0 5px 0",
                        fontSize: "1.05rem",
                      }}
                    >
                      No comments yet
                    </h4>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.85rem",
                        color: "#64748b",
                      }}
                    >
                      Be the first to comment on this status!
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "15px",
                    }}
                  >
                    {activeCommentPost.comments.map((comment) => {
                      const { canEdit, canDelete } = getCommentPermissions(
                        comment,
                        activeCommentPost,
                      );
                      const showMenu = canEdit || canDelete;

                      return (
                      <div
                        key={comment._id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                        }}
                      >
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background: "#6366f1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            color: "white",
                            flexShrink: 0,
                          }}
                        >
                          {comment.author.profilePicture ? (
                            <img
                              src={comment.author.profilePicture}
                              alt="Avatar"
                              style={{
                                width: "100%",
                                height: "100%",
                                borderRadius: "50%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            comment.author.firstName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              background: "rgba(255, 255, 255, 0.03)",
                              padding: "10px 14px",
                              borderRadius: "16px",
                              border: "1px solid rgba(255, 255, 255, 0.03)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "4px",
                                gap: "8px",
                              }}
                            >
                              <span
                                style={{
                                  color: "#f8fafc",
                                  fontWeight: 600,
                                  fontSize: "0.9rem",
                                }}
                              >
                                {comment.author.firstName} {comment.author.lastName}
                              </span>
                              {showMenu && (
                                <div
                                  data-comment-menu
                                  style={{ position: "relative", flexShrink: 0 }}
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenCommentMenuId((prev) =>
                                        prev === comment._id ? null : comment._id,
                                      )
                                    }
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: "#94a3b8",
                                      cursor: "pointer",
                                      padding: "2px",
                                      display: "flex",
                                      alignItems: "center",
                                    }}
                                    aria-label="Comment options"
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                  {openCommentMenuId === comment._id && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "100%",
                                        right: 0,
                                        marginTop: "4px",
                                        background: "#1e293b",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        borderRadius: "10px",
                                        minWidth: "120px",
                                        zIndex: 30,
                                        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                                        overflow: "hidden",
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {canEdit && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            openConfirmDialog({
                                              title: "Edit comment?",
                                              message:
                                                "Do you want to edit this comment?",
                                              confirmLabel: "Edit",
                                              cancelLabel: "Cancel",
                                              onConfirm: () => {
                                                setOpenCommentMenuId(null);
                                                setEditingCommentId(comment._id);
                                                setEditingCommentText(
                                                  comment.content,
                                                );
                                              },
                                            });
                                          }}
                                          style={{
                                            width: "100%",
                                            background: "none",
                                            border: "none",
                                            color: "#e2e8f0",
                                            padding: "10px 14px",
                                            textAlign: "left",
                                            cursor: "pointer",
                                            fontSize: "0.85rem",
                                          }}
                                        >
                                          Edit
                                        </button>
                                      )}
                                      {canDelete && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            confirmDeleteComment(
                                              activeCommentPost._id,
                                              comment._id,
                                            )
                                          }
                                          style={{
                                            width: "100%",
                                            background: "none",
                                            border: "none",
                                            color: "#f87171",
                                            padding: "10px 14px",
                                            textAlign: "left",
                                            cursor: "pointer",
                                            fontSize: "0.85rem",
                                          }}
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {editingCommentId === comment._id ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                }}
                              >
                                <input
                                  className="form-input"
                                  value={editingCommentText}
                                  onChange={(e) =>
                                    setEditingCommentText(e.target.value)
                                  }
                                  maxLength={300}
                                  style={{
                                    width: "100%",
                                    background: "rgba(0,0,0,0.2)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "10px",
                                    padding: "8px 12px",
                                    color: "#f8fafc",
                                    fontSize: "0.9rem",
                                  }}
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "8px",
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCommentId(null);
                                      setEditingCommentText("");
                                    }}
                                    style={{
                                      background: "none",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      color: "#94a3b8",
                                      borderRadius: "8px",
                                      padding: "6px 12px",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSaveCommentEdit(
                                        activeCommentPost._id,
                                        comment._id,
                                      )
                                    }
                                    style={{
                                      background: "#6366f1",
                                      border: "none",
                                      color: "white",
                                      borderRadius: "8px",
                                      padding: "6px 12px",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "0.9rem",
                                  margin: 0,
                                  lineHeight: "1.4",
                                }}
                              >
                                {comment.content}
                              </p>
                            )}
                          </div>
                          <div
                            style={{
                              color: "#64748b",
                              fontSize: "0.75rem",
                              marginTop: "4px",
                              marginLeft: "12px",
                            }}
                          >
                            {new Date(comment.createdAt).toLocaleDateString()}{" "}
                            at{" "}
                            {new Date(comment.createdAt).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
              </div>

              {/* Input Submission Footer */}
              <form
                onSubmit={handleCommentSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingTop: "15px",
                  flexShrink: 0,
                  background: "var(--bg-card)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <input
                    className="form-input"
                    placeholder="Write a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    maxLength={300} //   Frontend native limit: 300 characters se upar browser likhne hi nahi dega!
                    style={{
                      flex: 1,
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "12px",
                      padding: "10px 15px",
                      color: "#f8fafc",
                    }}
                  />
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!commentText.trim() || commentSubmitting}
                    style={{
                      width: "auto",
                      padding: "10px 20px",
                      borderRadius: "12px",
                      background: "#6366f1",
                    }}
                  >
                    {commentSubmitting ? "Sending..." : "Send"}
                  </button>
                </div>

                {/* ?? Live Character Counter */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    fontSize: "0.8rem",
                    color: commentText.length >= 300 ? "#ef4444" : "#64748b",
                    transition: "color 0.2s",
                  }}
                >
                  {commentText.length}/300 characters
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ?? FRIEND REQUESTS POPUP MODAL (Instagram Style Center Modal) */}
        {showRequestsModal && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.6)",
              zIndex: 9999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClick={() => setShowRequestsModal(false)}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "90%",
                maxWidth: "450px",
                background: "#1e293b",
                borderRadius: "20px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "20px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "15px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  paddingBottom: "10px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc" }}>
                  Friend Requests ({friendRequests.length})
                </h3>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Close friend requests"
                  onClick={() => setShowRequestsModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  {"\u00D7"}
                </button>
              </div>

              <div
                style={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {friendRequests.length === 0 ? (
                  <p
                    style={{
                      padding: "20px",
                      textAlign: "center",
                      color: "#94a3b8",
                      fontSize: "0.95rem",
                      margin: 0,
                    }}
                  >
                    No pending requests
                  </p>
                ) : (
                  friendRequests.map((req) => (
                    <div
                      key={req._id}
                      style={{
                        padding: "12px",
                        background: "rgba(255, 255, 255, 0.02)",
                        borderRadius: "12px",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
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
                          fetchPublicUserPosts(senderId);
                          setShowRequestsModal(false);
                        }}
                      >
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background:
                              "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            color: "white",
                            fontSize: "0.9rem",
                            flexShrink: 0,
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
                              fontSize: "0.9rem",
                            }}
                          >
                            {req.sender.firstName} {req.sender.lastName}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="primary-button"
                          style={{
                            background: "#10b981",
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "8px",
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "5px",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptFriendRequest(
                              req._id,
                              req.sender.firstName,
                            );
                          }}
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          className="primary-button"
                          style={{
                            background: "#ef4444",
                            color: "white",
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: "8px",
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "5px",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectFriendRequest(req._id);
                          }}
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ?? POST REACTIONS LIST POPUP MODAL (Facebook Style Tabbed Modal) */}
        {activeReactionsPost && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.6)",
              zIndex: 9999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClick={() => setActiveReactionsPost(null)}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "90%",
                maxWidth: "450px",
                background: "#1e293b",
                borderRadius: "20px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "20px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
                display: "flex",
                flexDirection: "column",
                maxHeight: "80vh",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "15px",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                  paddingBottom: "10px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc" }}>
                  Post Reactions
                </h3>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Close reactions"
                  onClick={() => setActiveReactionsPost(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  {"\u00D7"}
                </button>
              </div>

              {/* Dynamic Horizontal Tabs */}
              {(() => {
                const reactions = activeReactionsPost.reactions || [];
                const uniqueTypes = Array.from(
                  new Set(reactions.map((r) => r.type)),
                );
                const emojiMap = {
                  like: "👍",
                  love: "❤️",
                  haha: "😂",
                  sad: "😢",
                  angry: "😠",
                };

                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        overflowX: "auto",
                        paddingBottom: "10px",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        marginBottom: "15px",
                      }}
                    >
                      {/* 'All' Tab */}
                      <button
                        onClick={() => setReactionsFilterTab("all")}
                        style={{
                          background:
                            reactionsFilterTab === "all"
                              ? "rgba(99, 102, 241, 0.2)"
                              : "rgba(255, 255, 255, 0.03)",
                          border:
                            reactionsFilterTab === "all"
                              ? "1px solid #6366f1"
                              : "1px solid rgba(255, 255, 255, 0.05)",
                          color: "#f8fafc",
                          padding: "6px 12px",
                          borderRadius: "12px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        All ({reactions.length})
                      </button>

                      {/* Unique Emojis Tabs */}
                      {uniqueTypes.map((type) => {
                        const count = reactions.filter(
                          (r) => r.type === type,
                        ).length;
                        return (
                          <button
                            key={type}
                            onClick={() => setReactionsFilterTab(type)}
                            style={{
                              background:
                                reactionsFilterTab === type
                                  ? "rgba(99, 102, 241, 0.2)"
                                  : "rgba(255, 255, 255, 0.03)",
                              border:
                                reactionsFilterTab === type
                                  ? "1px solid #6366f1"
                                  : "1px solid rgba(255, 255, 255, 0.05)",
                              color: "#f8fafc",
                              padding: "6px 12px",
                              borderRadius: "12px",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {emojiMap[type]} {count}
                          </button>
                        );
                      })}
                    </div>

                    {/* Reactions User List */}
                    <div
                      style={{
                        flex: 1,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {(() => {
                        const filteredReactions =
                          reactionsFilterTab === "all"
                            ? reactions
                            : reactions.filter(
                                (r) => r.type === reactionsFilterTab,
                              );

                        if (filteredReactions.length === 0) {
                          return (
                            <p
                              style={{
                                textAlign: "center",
                                color: "#94a3b8",
                                fontSize: "0.9rem",
                                margin: "20px 0",
                              }}
                            >
                              No reactions on this tab.
                            </p>
                          );
                        }

                        return filteredReactions.map((r) => {
                          const reactorId = r.user._id || r.user;
                          const isMe = reactorId === userId;
                          return (
                            <div
                              key={reactorId}
                              onClick={() => {
                                setSelectedPublicUser({
                                  id: reactorId,
                                  firstName: r.displayName,
                                  lastName: "",
                                  username: r.username,
                                  profilePicture: r.profilePicture,
                                  status: isMe
                                    ? "SELF"
                                    : friendsList.some(
                                          (f) => f._id === reactorId,
                                        )
                                      ? "FRIENDS"
                                      : "NONE",
                                });
                                fetchPublicUserPosts(reactorId);
                                setActiveReactionsPost(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px",
                                background: "rgba(255, 255, 255, 0.02)",
                                borderRadius: "12px",
                                border: "1px solid rgba(255, 255, 255, 0.04)",
                                cursor: "pointer",
                                transition: "background 0.2s",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(255, 255, 255, 0.05)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(255, 255, 255, 0.02)")
                              }
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <div
                                  style={{
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "50%",
                                    background:
                                      "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 600,
                                    color: "white",
                                    fontSize: "0.9rem",
                                    flexShrink: 0,
                                  }}
                                >
                                  {r.profilePicture ? (
                                    <img
                                      src={r.profilePicture}
                                      alt="Avatar"
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: "50%",
                                        objectFit: "cover",
                                      }}
                                    />
                                  ) : (
                                    r.displayName.charAt(0).toUpperCase()
                                  )}
                                </div>
                                <div>
                                  <div
                                    style={{
                                      color: "#f8fafc",
                                      fontWeight: 600,
                                      fontSize: "0.9rem",
                                    }}
                                  >
                                    {r.displayName} {isMe ? "(You)" : ""}
                                  </div>
                                </div>
                              </div>
                              <span style={{ fontSize: "1.4rem" }}>
                                {emojiMap[r.type]}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* ?? PREMIUM TRANSACTION RECEIPT MODAL */}
        {showReceiptModal && receiptData && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 99999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Print styles to print only the receipt */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-receipt, #printable-receipt * {
                  visibility: visible !important;
                }
                #printable-receipt {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  box-shadow: none !important;
                  border: none !important;
                  padding: 0 !important;
                }
                #printable-receipt * {
                  color: #000000 !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>

            <div
              id="printable-receipt"
              className="modal-card"
              style={{
                width: "90%",
                maxWidth: "420px",
                background: "#1e293b",
                borderRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "28px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                textAlign: "center",
                color: "#f8fafc",
                position: "relative",
              }}
            >
              {/* Close Cross Button */}
              <button
                className="close-btn no-print"
                onClick={() => {
                  setShowReceiptModal(false);
                  setReceiptData(null);
                }}
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {"\u00D7"}
              </button>
              {/* Green Success Tick */}
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    background: "rgba(16, 185, 129, 0.12)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    border: "2px solid #10b981",
                  }}
                >
                  <span style={{ fontSize: "2.2rem" }}>✓</span>
                </div>
                <h2
                  style={{
                    marginTop: "15px",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "#10b981",
                  }}
                >
                  Transaction Completed
                </h2>
                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    marginTop: "4px",
                  }}
                >
                  Your transaction has been processed successfully.
                </p>
              </div>

              {/* Sent Amount Card */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "16px",
                  padding: "16px",
                  marginBottom: "24px",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                <span
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.85rem",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {receiptData.type === "ADD_MONEY"
                    ? "Amount Deposited"
                    : receiptData.type === "BILL_PAYMENT" ||
                        receiptData.type === "SPLIT_PAYMENT"
                      ? "Amount Paid"
                      : "Amount Sent"}
                </span>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#10b981",
                    marginTop: "4px",
                  }}
                >
                  PKR {Number(receiptData.amount).toLocaleString()}
                </div>
              </div>

              {/* Invoice Details Table/Grid */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  textAlign: "left",
                  fontSize: "0.88rem",
                  marginBottom: "28px",
                  borderBottom: "1px dashed rgba(255, 255, 255, 0.1)",
                  paddingBottom: "20px",
                }}
              >
                                                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Transaction ID:</span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontFamily: "monospace",
                      color: "#e2e8f0",
                    }}
                  >
                    {receiptData.transactionId}
                  </span>
                </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Date & Time:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {new Date(receiptData.date).toLocaleString("en-PK", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </div>
                                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Transaction Type:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                                         {receiptData.type === "EXTERNAL_TRANSFER" 
                      ? "Local Bank Transfer" 
                      : receiptData.type === "ADD_MONEY" 
                        ? "Wallet Deposit" 
                        : receiptData.type === "BILL_PAYMENT"
                          ? "Utility Bill Payment"
                          : receiptData.type === "SPLIT_PAYMENT"
                            ? "Split Bill Payment"
                            : receiptData.type === "QR_PAYMENT"
                              ? "QR Payment"
                              : "Wallexa P2P Sent"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Status:</span>
                  <span style={{ fontWeight: 600, color: receiptData.type === "ADD_MONEY" ? "#10b981" : "#ef4444" }}>
                    {receiptData.type === "ADD_MONEY" ? "Received" : "Sent"}
                  </span>
                </div>
                {receiptData.description && (
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ color: "#94a3b8" }}>Description:</span>
                    <span style={{ fontWeight: 600, color: "#e2e8f0", textAlign: "right" }}>
                      {receiptData.type === "EXTERNAL_TRANSFER" ? "Bank Transfer" : receiptData.description}
                    </span>
                  </div>
                )}

                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    margin: "8px 0",
                  }}
                />

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Sender Name:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {receiptData.senderName}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94a3b8" }}>Sender Account:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {receiptData.type === "ADD_MONEY"
                      ? receiptData.senderMobile
                      : maskInfo(receiptData.senderMobile)}
                  </span>
                </div>

                <hr
                  style={{
                    border: "none",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    margin: "8px 0",
                  }}
                />

                               {receiptData.type === "EXTERNAL_TRANSFER" && receiptData.bankName && (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#94a3b8" }}>Bank Name:</span>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                    {receiptData.bankName}
                  </span>
                </div>
              )}
              <div
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span style={{ color: "#94a3b8" }}>
                  {receiptData.type === "BILL_PAYMENT"
                    ? "Utility Provider:"
                    : receiptData.type === "SPLIT_PAYMENT"
                      ? "Requester Name:"
                      : "Receiver Name:"}
                </span>
                <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                  {receiptData.receiverName}
                </span>
              </div>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                                  <span style={{ color: "#94a3b8" }}>
                  {receiptData.type === "EXTERNAL_TRANSFER" 
                    ? "Account / IBAN:" 
                    : receiptData.type === "BILL_PAYMENT"
                      ? "Consumer Number:"
                      : receiptData.type === "SPLIT_PAYMENT"
                        ? "Requester Account:"
                        : "Receiver Account:"}
                </span>
                <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
                  {maskInfo(receiptData.receiverMobile)}
                </span>
                </div>
              </div>

              {/* Done & Print Buttons */}
              <div
                className="no-print"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginTop: "8px",
                }}
              >
                <button
                  className="primary-button"
                  style={{
                    gridColumn: "span 2",
                    background:
                      "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                    margin: 0,
                  }}
                  onClick={() => {
                    setShowReceiptModal(false);
                    setReceiptData(null);
                  }}
                >
                  Done
                </button>
                <button
                  className="secondary-button"
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    margin: 0,
                  }}
                  onClick={() =>
                    handleDownloadPdf(
                      "printable-receipt",
                      `Receipt_${receiptData.transactionId}.pdf`,
                    )
                  }
                >
                  Download PDF
                </button>
                <button
                  className="secondary-button"
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    margin: 0,
                  }}
                  onClick={() =>
                    handleSharePdf(
                      "printable-receipt",
                      `Receipt_${receiptData.transactionId}.pdf`,
                    )
                  }
                >
                  Share Receipt
                </button>
                <button
                  className="secondary-button"
                  style={{
                    gridColumn: "span 2",
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                    border: "none",
                    margin: 0,
                    color: "white",
                  }}
                  onClick={() => {
                    setShareFeedCaption("");
                    setShareFeedVisibility("public");
                    setShowShareFeedModal(true);
                  }}
                >
                  Share to Wallexa Feed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SHARE RECEIPT TO WALLEXA FEED MODAL */}
        {showShareFeedModal && receiptData && (
          <div
            className="modal-overlay"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              zIndex: 999999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              className="modal-card"
              style={{
                width: "90%",
                maxWidth: "440px",
                background: "#1e293b",
                borderRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "24px",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                color: "#f8fafc",
                position: "relative",
              }}
            >
              <button
                className="close-btn"
                onClick={() => setShowShareFeedModal(false)}
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                }}
              >
                {"\u00D7"}
              </button>

              <h3
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  marginBottom: "16px",
                  color: "#6366f1",
                  textAlign: "center",
                }}
              >
                Share to Wallexa Feed
              </h3>

              {/* Text Input Caption */}
              <div style={{ marginBottom: "16px", textAlign: "left" }}>
                <label
                  style={{
                    fontSize: "0.85rem",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Write a caption (Optional):
                </label>
                <textarea
                  placeholder="What's on your mind about this transaction?"
                  value={shareFeedCaption}
                  onChange={(e) => setShareFeedCaption(e.target.value)}
                  style={{
                    width: "100%",
                    height: "80px",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    color: "white",
                    padding: "10px",
                    fontSize: "0.9rem",
                    resize: "none",
                    outline: "none",
                  }}
                />
              </div>

              {/* Visibility Select Dropdown */}
              <div style={{ marginBottom: "20px", textAlign: "left" }}>
                <label
                  style={{
                    fontSize: "0.85rem",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Choose Visibility:
                </label>
                <select
                  value={shareFeedVisibility}
                  onChange={(e) => setShareFeedVisibility(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    color: "white",
                    padding: "10px",
                    fontSize: "0.9rem",
                    outline: "none",
                  }}
                >
                  <option value="public" style={{ background: "#1e293b" }}>
                    Public (Everyone)
                  </option>
                  <option value="friends" style={{ background: "#1e293b" }}>
                   Friends Only
                  </option>
                  <option value="private" style={{ background: "#1e293b" }}>
                    Private (Only Me)
                  </option>
                </select>
              </div>

              {/* Mini Preview Card */}
              <div style={{ marginBottom: "24px", textAlign: "left" }}>
                <label
                  style={{
                    fontSize: "0.85rem",
                    color: "#94a3b8",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Receipt Preview:
                </label>
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: "16px",
                    border: "1px dashed rgba(255, 255, 255, 0.1)",
                    padding: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                      Type:
                    </span>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#e2e8f0",
                        fontWeight: 600,
                      }}
                    >
                      {receiptData.type === "EXTERNAL_TRANSFER"
                        ? "Local Bank Transfer"
                        : receiptData.type === "ADD_MONEY"
                          ? "Wallet Deposit"
                          : "Wallexa P2P Transfer"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                      Amount:
                    </span>
                    <span
                      style={{
                        fontSize: "0.9rem",
                        color: "#10b981",
                        fontWeight: 700,
                      }}
                    >
                      PKR {Number(receiptData.amount).toLocaleString()}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                      Recipient:
                    </span>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#e2e8f0",
                        fontWeight: 500,
                      }}
                    >
                      {receiptData.receiverName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  className="secondary-button"
                  style={{
                    flex: 1,
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    margin: 0,
                  }}
                  onClick={() => setShowShareFeedModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  style={{
                    flex: 1,
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                    border: "none",
                    margin: 0,
                    color: "white",
                    opacity: loading ? 0.6 : 1, // Sharing ke dauran button dim ho jaye
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                  onClick={handleShareToFeed}
                  disabled={loading} // Double-click block karega
                >
                  {loading ? "Sharing..." : "Post to Feed"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* CUSTOM CONFIRM MODAL */}
        {confirmDialog && (
          <div
            className="modal-overlay"
            style={{ zIndex: 10050 }}
            onClick={closeConfirmDialog}
          >
            <div
              className="modal-card"
              style={{ maxWidth: "380px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 style={{ color: "#f8fafc", margin: 0 }}>
                  {confirmDialog.title}
                </h3>
                <button
                  type="button"
                  className="close-btn"
                  onClick={closeConfirmDialog}
                  aria-label="Close"
                >
                  {"\u00D7"}
                </button>
              </div>
              <p
                style={{
                  color: "#cbd5e1",
                  fontSize: "14px",
                  textAlign: "center",
                  lineHeight: 1.5,
                  margin: "0 0 24px",
                }}
              >
                {confirmDialog.message}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeConfirmDialog}
                  style={{ width: "100%" }}
                >
                  {confirmDialog.cancelLabel}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConfirmDialogAction}
                  style={{
                    width: "100%",
                    background: confirmDialog.danger ? "#ef4444" : undefined,
                    boxShadow: confirmDialog.danger
                      ? "0 4px 15px rgba(239, 68, 68, 0.3)"
                      : undefined,
                  }}
                >
                  {confirmDialog.confirmLabel}
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

// Helper Components
const InfoRow = ({
  label,
  value,
  locked,
  onEdit,
  isEditing,
  onSave,
  onCancel,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid #e2e8f0",
    }}
  >
    <span style={{ color: "#64748b", fontSize: "0.9rem" }}>{label}</span>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <span
        style={{
          color: "#1e293b",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
        }}
      >
        {value}
      </span>
      {locked ? (
        <div
          title="Verified & Locked"
          style={{ display: "flex", alignItems: "center" }}
        >
          <Lock size={14} color="#94a3b8" />
        </div>
      ) : isEditing ? (
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={onSave}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              padding: "2px",
            }}
            title="Save"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              padding: "2px",
            }}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        onEdit && (
          <button
            type="button"
            onClick={onEdit}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              display: "flex",
              alignItems: "center",
              color: "#6366f1",
              transition: "transform 0.1s ease",
            }}
            title="Edit"
            onMouseEnter={(e) =>
              (e.currentTarget.style.transform = "scale(1.15)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <Edit2 size={14} />
          </button>
        )
      )}
    </div>
  </div>
);
