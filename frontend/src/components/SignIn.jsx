import React, { useState } from 'react';
import './Css/Signin.css';

export default function Signin({ onSwitchToSignup, onSigninSuccess }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetStep, setResetStep] = useState(1);
  const [resetUserId, setResetUserId] = useState(null);
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleSignin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("http://127.0.0.1:5000/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (res.ok) {
        onSigninSuccess(data);
      } else {
        setMessage(data.message || "Login failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: resetIdentifier })
      });
      const data = await res.json();
      if (res.ok) {
        setResetUserId(data.userId);
        setResetStep(2);
        setMessage("OTP sent to your email.");
      } else {
        setMessage(data.message || "Error sending reset link.");
      }
    } catch { setMessage("Error sending reset link"); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ userId: resetUserId, otpCode: resetOtp, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Password updated successfully. Please sign in.");
        setShowForgotPassword(false);
        setResetStep(1);
        setResetIdentifier("");
        setResetOtp("");
        setNewPassword("");
      } else {
        setMessage(data.message || "Failed to reset password.");
      }
    } catch { setMessage("Network error."); }
    finally { setLoading(false); }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <h1 className="title">Welcome Back</h1>
        <p className="subtitle">Secure • Fast • Smart</p>

        {!showForgotPassword ? (
          <form onSubmit={handleSignin}>
            <div className="input-group">
              <input className="input-field" placeholder="Email or Mobile" value={identifier} onChange={e => setIdentifier(e.target.value)} required />
            </div>
            <div className="input-group" style={{ position: 'relative' }}>
              <input className="input-field" type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '15px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
              <span className="link-text" onClick={() => setShowForgotPassword(true)} style={{ fontSize: '0.85rem' }}>Forgot Password?</span>
            </div>

            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Verifying..." : "Sign In"}
            </button>
          </form>
        ) : resetStep === 1 ? (
          <form onSubmit={handleForgot}>
            <h3 className="section-title">Reset Password</h3>
            <div className="input-group">
              <input className="input-field" placeholder="Enter Email or Mobile" value={resetIdentifier} onChange={e => setResetIdentifier(e.target.value)} required disabled={loading} />
            </div>
            <button type="submit" className="primary-button" style={{ marginTop: '15px' }} disabled={loading}>{loading ? "Sending..." : "Send Reset Link"}</button>
            <button type="button" className="secondary-button" onClick={() => { setShowForgotPassword(false); setResetStep(1); setMessage(""); }} disabled={loading}>Back to Login</button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <h3 className="section-title">Set New Password</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '15px' }}>Enter the 6-digit OTP sent to your email.</p>
            <div className="input-group">
              <input className="input-field" placeholder="Enter OTP" value={resetOtp} onChange={e => setResetOtp(e.target.value)} required disabled={loading} maxLength={6} style={{ letterSpacing: '2px', textAlign: 'center' }} />
            </div>
            <div className="input-group">
              <input className="input-field" type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required disabled={loading} minLength={6} />
            </div>
            <button type="submit" className="primary-button" style={{ marginTop: '15px' }} disabled={loading}>{loading ? "Resetting..." : "Reset Password"}</button>
            <button type="button" className="secondary-button" onClick={() => { setShowForgotPassword(false); setResetStep(1); setMessage(""); }} disabled={loading}>Cancel</button>
          </form>
        )}

        {message && <p className="status-message">{message}</p>}

        {!showForgotPassword && (
          <div className="signup-prompt">
            <p>New to Wallexa?</p>
            <button className="secondary-button" onClick={onSwitchToSignup}>Create Free Account</button>
          </div>
        )}
      </div>
    </div>
  );
}