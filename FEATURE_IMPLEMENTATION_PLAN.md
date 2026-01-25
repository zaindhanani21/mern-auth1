# 🚀 Feature Implementation Plan - Real-time Notifications & Profile Management

## 📋 Requirements Summary

### 1. **Real-time Notifications Dropdown**
- ✅ Click on bell icon → dropdown opens
- ✅ Show real-time notifications
- ✅ Notifications for money received/sent
- ✅ Show sender/receiver name and amount

### 2. **Email Notifications**
- ✅ Email when money is received
- ✅ Email when money is sent
- ✅ Include amount and user details

### 3. **Enhanced Transaction History**
- ✅ Show exact time (hours, minutes)
- ✅ Click on user name → show account details
- ✅ Show transaction time prominently

### 4. **User Profile Section**
- ✅ New tab in dashboard for Profile
- ✅ Display all signup information:
  - First Name, Last Name
  - Email (required, cannot change)
  - Phone Number (required, cannot change)
  - CNIC (required, masked display)
  - Date of Birth
  - Nationality
- ✅ Profile Picture upload
- ✅ Real-time profile picture update
- ✅ Edit capability for non-critical fields

---

## 🏗️ Implementation Steps

### **Phase 1: Backend - Notifications API** ✅
**Files to modify:**
- `backend/routes/wallet.js` - Add get notifications endpoint
- `backend/routes/auth.js` - Add email sending for transactions
- `backend/mailHelper.js` - Create reusable email templates

**New Endpoints:**
```javascript
GET /api/wallet/notifications - Get user notifications
POST /api/wallet/mark-notification-read - Mark as read
```

---

### **Phase 2: Backend - Profile Management** ✅
**Files to create/modify:**
- `backend/routes/profile.js` - NEW file for profile operations
- `backend/models/User.js` - Add profilePicture field

**New Endpoints:**
```javascript
GET /api/profile - Get user profile
PUT /api/profile/update - Update profile (name, DOB, nationality)
POST /api/profile/upload-picture - Upload profile picture
GET /api/profile/:userId - Get other user's public profile
```

---

### **Phase 3: Frontend - Notification Dropdown** ✅
**Files to modify:**
- `frontend/src/components/Dashboard.jsx` - Add dropdown UI
- `frontend/src/components/Css/ModernDashboard.css` - Styling

**Features:**
- Dropdown component with notification list
- Real-time updates via Socket.IO
- Mark as read functionality
- Show unread count badge

---

### **Phase 4: Frontend - Enhanced History** ✅
**Files to modify:**
- `frontend/src/components/Dashboard.jsx` - Update history view
- Create `frontend/src/components/TransactionDetail.jsx` - Modal for details

**Features:**
- Show time in "HH:MM AM/PM" format
- Clickable user names
- Modal showing full transaction details

---

### **Phase 5: Frontend - Profile Section** ✅
**Files to create:**
- `frontend/src/components/Profile.jsx` - NEW profile component
- `frontend/src/components/Css/Profile.css` - NEW styling

**Features:**
- Profile view with all user info
- Edit mode for allowed fields
- Profile picture upload with preview
- Real-time updates

---

## 📦 File Structure

```
backend/
├── routes/
│   ├── wallet.js (MODIFY - add notifications endpoint)
│   ├── profile.js (NEW - profile management)
│   └── auth.js (MODIFY - email notifications)
├── models/
│   └── User.js (MODIFY - add profilePicture field)
└── mailHelper.js (NEW - email templates)

frontend/
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx (MODIFY - add notifications dropdown)
│   │   ├── Profile.jsx (NEW - profile component)
│   │   ├── TransactionDetail.jsx (NEW - transaction modal)
│   │   └── Css/
│   │       ├── ModernDashboard.css (MODIFY)
│   │       └── Profile.css (NEW)
```

---

## 🎯 Priority Order

1. **HIGH**: Notification Dropdown (Phase 1 + 3)
2. **HIGH**: Enhanced History with Time (Phase 4)
3. **MEDIUM**: Email Notifications (Phase 2)
4. **MEDIUM**: Profile Section (Phase 2 + 5)
5. **LOW**: Profile Picture Upload (Phase 5)

---

## ⏱️ Estimated Time
- Phase 1 + 3: 30 minutes
- Phase 4: 20 minutes
- Phase 2 (Email): 15 minutes
- Phase 5 (Profile): 25 minutes

**Total**: ~90 minutes

---

**Status**: Ready to implement
**Start Time**: Now
