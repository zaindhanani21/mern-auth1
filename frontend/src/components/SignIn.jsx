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
  const [resetCnic, setResetCnic] = useState("");
  const [resetStep, setResetStep] = useState(1);
  const [resetUserId, setResetUserId] = useState(null);
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password strength check (same as signup)
  const getPasswordStrength = (p) => {
    if (!p) return 0;
    let s = 0;
    if (p.length > 7) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };

  // CNIC auto-format: XXXXX-XXXXXXX-X
  const handleCnicChange = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 5) val = val.substring(0, 5) + '-' + val.substring(5);
    if (val.length > 13) val = val.substring(0, 13) + '-' + val.substring(13);
    val = val.substring(0, 15);
    setResetCnic(val);
  };

  const handleSignin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/auth/signin", {
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
    setMessage("");
    try {
      // CNIC format check before sending
      if (!/^\d{5}-\d{7}-\d{1}$/.test(resetCnic)) {
        setMessage("Please enter CNIC in correct format: 12345-1234567-1");
        setLoading(false);
        return;
      }
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: resetIdentifier, cnic: resetCnic })
      });
      const data = await res.json();
      if (res.ok && data.resetInitiated) {
        setResetUserId(data.userId || null);
        setResetStep(2);
        setMessage(data.message);
      } else {
        setMessage(data.message || "Invalid credentials. Please try again.");
      }
    } catch {
      setMessage("Error sending reset link");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setMessage("");

    // OTP must be 6 digits
    if (!/^\d{6}$/.test(resetOtp)) {
      setMessage("OTP must be exactly 6 digits.");
      return;
    }
    // Password strength check
    if (getPasswordStrength(newPassword) < 4) {
      setMessage("Password is too weak. Must contain uppercase, number, and special char.");
      return;
    }
    // Confirm password match
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("https://mern-auth1-qnmh.onrender.com/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetUserId, otpCode: resetOtp, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setIsSuccess(true);
        setMessage("Password updated successfully! Redirecting to login...");
        setTimeout(() => {
          setShowForgotPassword(false);
          setResetStep(1);
          setResetIdentifier("");
          setResetCnic("");
          setResetOtp("");
          setNewPassword("");
          setConfirmPassword("");
          setIsSuccess(false);
          setMessage("");
        }, 2500);
      } else {
        setMessage(data.message || "Failed to reset password.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const resetForgotFlow = () => {
    setShowForgotPassword(false);
    setResetStep(1);
    setResetIdentifier("");
    setResetCnic("");
    setResetOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    setIsSuccess(false);
  };

  const strength = getPasswordStrength(newPassword);
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="signin-container">
      <div className="signin-card">
        <h1 className="title">Welcome Back</h1>
        <p className="subtitle">Secure â€¢ Fast â€¢ Smart</p>

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
            <p style={{ fontSize: '0.82rem', color: '#8b6474', marginBottom: '15px' }}>Step 1 of 2 â€” Verify your identity</p>
            <p style={{ fontSize: '0.8rem', color: '#942127', marginBottom: '10px', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px' }}>
              ðŸ”’ If your credentials match our records, an OTP will be sent to your email.
            </p>

            <div className="input-group">
              <input
                className="input-field"
                placeholder="Email or Mobile Number"
                value={resetIdentifier}
                onChange={e => setResetIdentifier(e.target.value.slice(0, 30))}
                required
                disabled={loading}
                maxLength={30}
              />
            </div>

            <div className="input-group">
              <input
                className="input-field"
                placeholder="CNIC (e.g. 12345-1234567-1)"
                value={resetCnic}
                onChange={handleCnicChange}
                required
                disabled={loading}
                maxLength={15}
              />
            </div>

            <button type="submit" className="primary-button" style={{ marginTop: '15px' }} disabled={loading}>
              {loading ? "Verifying..." : "Send OTP"}
            </button>
            <button type="button" className="secondary-button" onClick={resetForgotFlow} disabled={loading}>Back to Login</button>
          </form>

        ) : (
          <form onSubmit={handleResetPassword}>
            <h3 className="section-title">Set New Password</h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '15px' }}>Step 2 of 2 â€” Enter OTP and new password</p>

            {/* OTP Field */}
            <div className="input-group">
              <input
                className="input-field"
                placeholder="Enter 6-digit OTP"
                value={resetOtp}
                onChange={e => setResetOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                required
                disabled={loading}
                maxLength={6}
                style={{ letterSpacing: '4px', textAlign: 'center' }}
              />
            </div>

            {/* New Password Field */}
            <div className="input-group" style={{ position: 'relative' }}>
              <input
                className="input-field"
                type={showNewPassword ? "text" : "password"}
                placeholder="New Password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value.slice(0, 30))}
                required
                disabled={loading}
                maxLength={30}
              />
              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: '10px', top: '15px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>

            {/* Password Strength Bar */}
            {newPassword.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: strength >= i ? strengthColors[strength - 1] : '#334155', transition: 'background 0.3s' }} />
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: strength >= 3 ? '#22c55e' : '#f59e0b', margin: 0 }}>
                  {strength >= 3 ? `${strengthLabels[strength - 1]} password` : "Must contain uppercase, number, and special char."}
                </p>
              </div>
            )}

            {/* Confirm Password Field */}
            <div className="input-group" style={{ position: 'relative' }}>
              <input
                className="input-field"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value.slice(0, 30))}
                required
                disabled={loading}
                maxLength={30}
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '10px', top: '15px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>

            <button type="submit" className="primary-button" style={{ marginTop: '15px' }} disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button type="button" className="secondary-button" onClick={resetForgotFlow} disabled={loading}>Cancel</button>
          </form>
        )}

        {message && (
          <p className="status-message" style={{ color: isSuccess ? '#22c55e' : '#ef4444' }}>
            {message}
          </p>
        )}

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

