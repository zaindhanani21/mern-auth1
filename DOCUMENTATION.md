# Wallexa E-Wallet: Feature-wise Technical Workflow

This document provides a complete map of how the frontend and backend interact for each feature.

---

## 1. Project Stack
*   **Frontend**: React (Vite), CSS (Vanilla).
*   **Backend**: Node.js, Express.
*   **Database**: MongoDB (Mongoose).
*   **Real-time**: Socket.io.
*   **Email**: SMTP (Mailtrap/Gmail) via `mailHelper.js`.

---

## 2. Feature Workflow Breakdown

### A. Authentication & Sign Up
1.  **Frontend**: `SignUp.jsx` sends Data to `/api/auth/signup`.
2.  **Backend**: `auth.js` checks if user exists, validates age (18+), hashes password, and saves user.
3.  **OTP**: Backend generates OTP, sends it via `sendOTP` (mailHelper.js).
4.  **Verification**: `VerifyOtp.jsx` calls `/api/auth/verify-otp`.
5.  **Session**: `App.jsx` handles `localStorage` to keep you logged in after refresh.

### B. Wallet Dashboard (The "Heart")
1.  **Frontend**: Page load triggers `fetchData()` in `Dashboard.jsx`.
2.  **Backend**: `/api/wallet/dashboard` returns:
    *   Wallet Balance.
    *   Frozen status.
    *   Full Transaction History (Enriched with names/mobiles).
3.  **Real-time**: The `socket.on('notification')` listener waits for alerts.

### C. Transfer Money (Send Money)
1.  **Frontend**: User fills `recipientMobile` and `amount`.
2.  **Backend**: `/api/wallet/send-money` runs a **Database Transaction**:
    *   Step 1: Check Sender balance & status.
    *   Step 2: Find Recipient Wallet.
    *   Step 3: Deduct Sender / Add to Receiver.
    *   Step 4: Create History Record.
    *   Step 5: Notify both via Socket.io + Email.

### D. Bill Splitting (The "Professional" Feature)
1.  **Name Fetching**: As you type a number, `fetchFriendName()` calls `/api/profile/mobile/:number`.
2.  **Requesting**: `POST /api/wallet/request-split` saves the bill to `SplitRequest` model.
3.  **Tracking**: The progress bar calculates `(paid_count / total_participants)`.
4.  **Settling**: When a friend clicks "Accept", `/api/wallet/accept-split` transfers money from their wallet to yours and marks them as "ACCEPTED".

### E. Security (Freeze/Unfreeze)
*   **Frontend**: Triggers `handleSendOtpForFreeze()`.
*   **Backend**: Sends OTP to email.
*   **Verification**: `/api/wallet/verify-freeze-otp` toggles the `status` of the Wallet model Between `ACTIVE` and `FROZEN`.
*   **Blocking**: All payment routes check `wallet.status`. If `FROZEN`, they return an error immediately.

---

## 3. Frontend-Backend API Mapping

| Feature | Frontend Action | Backend Route (wallet.js) |
| :--- | :--- | :--- |
| **Balance/History** | `fetchData()` | `GET /dashboard` |
| **Add Money** | `handleAddMoney()` | `POST /add-money` |
| **Send Money** | `handleSend()` | `POST /send-money` |
| **Pay Utility Bills** | `confirmBillPayment()` | `POST /pay-bill` |
| **Create Split** | `handleRequestSplit()`| `POST /request-split` |
| **Fetch Splits** | `fetchSplits()` | `GET /get-splits` |
| **Accept Split** | `handleAcceptSplit()` | `POST /accept-split` |
| **Reject Split** | `handleRejectSplit()` | `POST /reject-split` |

---

## 4. Key Models (Database Structure)
*   **User**: Personal info, email, mobile, hashed password.
*   **Wallet**: Linked to User, stores `balance` and `status` (Active/Frozen).
*   **Transaction**: Stores amount, sender, receiver, and type (SEND, ADD, BILL, SPLIT).
*   **SplitRequest**: Stores the "Bill" details and a list of participants with their specific amounts and statuses.
*   **Notification**: Stores alerts sent to users.

---
*Created for: Zain Dhanani - Wallexa E-Wallet FYP Project*
