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

  const handleSignin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("http://localhost:5000/api/auth/signin", {
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
    try {
      const res = await fetch("http://localhost:5000/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: resetIdentifier })
      });
      const data = await res.json();
      setMessage(data.message);
    } catch { setMessage("Error sending reset link"); }
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
        ) : (
          <form onSubmit={handleForgot}>
            <h3 className="section-title">Reset Password</h3>
            <input className="input-field" placeholder="Enter Email" value={resetIdentifier} onChange={e => setResetIdentifier(e.target.value)} required />
            <button type="submit" className="primary-button" style={{ marginTop: '15px' }}>Send Reset Link</button>
            <button type="button" className="secondary-button" onClick={() => setShowForgotPassword(false)}>Back to Login</button>
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