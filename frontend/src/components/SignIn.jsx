import React, { useState } from "react";
import "./Css/Wallexa.css"; // The background & theme
import "./Css/Signin.css"; // The specific card layout

export default function Signin({ onSwitchToSignup, onSigninSuccess }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  
  const [resetIdentifier, setResetIdentifier] = useState(""); 
  const [isVerifyingReset, setIsVerifyingReset] = useState(false);
  const [resetUserId, setResetUserId] = useState(null); 
  const [newPassword, setNewPassword] = useState(""); 
  const [otpCode, setOtpCode] = useState(""); 
  // Add these to your existing state declarations
const [isVerifyingLogin, setIsVerifyingLogin] = useState(false);
const [loginUserId, setLoginUserId] = useState(null);
  
  const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    const res = await fetch("http://localhost:5000/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }), 
    });

    const data = await res.json();
    
    if (res.ok) {
      if (data.requiresOTP) {
        // 🟢 Pass the userId to the next step so VerifyOtp knows who is logging in
        // You can use a prop, navigate with state, or an on-success callback
        onSigninSuccess({ ...data, step: 'OTP_REQUIRED' }); 
        setMessage("OTP sent! Please verify your identity.");
      } else {
        onSigninSuccess(data); 
      }
    } else {
      setMessage(data.message || "Invalid credentials");
    }
  } catch {
    setMessage("Network error! Could not connect to backend.");
  }
};

const handleVerifyLoginOtp = async (e) => {
  e.preventDefault();
  try {
    const res = await fetch("http://localhost:5000/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        userId: loginUserId, 
        otpCode: otpCode.trim() 
      }),
    });

    const data = await res.json();
    if (res.ok) {
      // 🟢 CRITICAL: Save the token for your Dashboard to use later
      localStorage.setItem("userToken", data.token); 
      
      setMessage("Success! Redirecting...");
      onSigninSuccess(data); // This typically redirects to Dashboard
    } else {
      setMessage(data.message || "Invalid OTP.");
    }
  } catch {
    setMessage("Network error during verification.");
  }
};

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:5000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 🟢 FIXED: Changed 'mobileNumber' to 'identifier' to match backend logic
        body: JSON.stringify({ identifier: resetIdentifier }), 
      });

      const data = await res.json();
      
      if (res.ok && data.resetInitiated) {
        setMessage("OTP sent. Enter code and new password below.");
        setResetUserId(data.userId); 
        setIsVerifyingReset(true); 
        setOtpCode(""); 
      } else {
        setMessage(data.message || "Account not found.");
      }
    } catch {
      setMessage("Network error! Could not connect to backend.");
    }
  };
  
  const handleResetPassword = async (e) => {
      e.preventDefault();
      if (newPassword.length < 6) return setMessage("Password too short.");
      
      try {
          const res = await fetch("http://localhost:5000/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                  userId: resetUserId, 
                  otpCode: otpCode.trim().toUpperCase(), 
                  newPassword 
              }),
          });

          const data = await res.json();
          if (res.ok) {
              setMessage("Password successfully reset! Please sign in.");
              setIsVerifyingReset(false);
              setShowForgotPassword(false);
              setResetIdentifier("");
              setOtpCode("");
              setNewPassword(""); // 🟢 Cleared state for safety
          } else {
              setMessage(data.message || "Reset failed.");
          }
      } catch {
          setMessage("Network error!");
      }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <h1 className="title">Welcome to Wallexa</h1>
        <p className="subtitle">Secure • Fast • Smart Payments</p>

        {!showForgotPassword ? (
          <>
            <h2 className="form-title">Sign In</h2>
            <form onSubmit={handleSubmit}>
              <input
                className="input-field"
                type="text"
                placeholder="Email or Mobile Number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
              <input
                className="input-field"
                type="password"
                placeholder="Enter your Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" className="primary-button">Sign In</button>
            </form>
            <p className="link-text" onClick={() => setShowForgotPassword(true)}>
                Forgot Password?
            </p>
          </>
        ) : (
            isVerifyingReset ? (
                <>
                    <h2 className="form-title">Verify & Reset</h2>
                    <form onSubmit={handleResetPassword}>
                        <input className="input-field" type="text" placeholder="6-digit OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength="6" required />
                        <input className="input-field" type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength="6" required />
                        <button type="submit" className="primary-button">Reset Password</button>
                    </form>
                    <p className="link-text" onClick={() => { setIsVerifyingReset(false); setShowForgotPassword(false); }}>
                        Cancel
                    </p>
                </>
            ) : (
                <>
                    <h2 className="form-title">Reset Password</h2>
                    <form onSubmit={handleForgotPassword}>
                        <input
                            className="input-field"
                            type="text" // 🟢 Ensured text type to allow email characters
                            placeholder="Email or Mobile Number"
                            value={resetIdentifier}
                            onChange={(e) => setResetIdentifier(e.target.value)}
                            required
                        />
                        <button type="submit" className="primary-button">Send Code</button>
                    </form>
                    <p className="link-text" onClick={() => setShowForgotPassword(false)}>
                        Back to Sign In
                    </p>
                </>
            )
        )}

        {message && (
            <p className={`status-message ${message.toLowerCase().includes("sent") || message.toLowerCase().includes("success") || message.toLowerCase().includes("redirecting") ? "success" : "error"}`}>
                {message}
            </p>
        )}

        {!showForgotPassword && (
          <div className="signup-prompt">
            <p>Don’t have an account?</p>
            <button type="button" onClick={onSwitchToSignup} className="secondary-button">
                Sign Up
            </button>
          </div>
        )}
      </div>
    </div>
  );
}