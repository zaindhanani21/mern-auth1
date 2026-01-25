import React, { useState } from "react";
import "./Css/Wallexa.css";
import "./Css/Verify.css";

// MODIFIED PROPS: Added isSignupFlow
export default function VerifyOtp({
  pendingData,
  onVerificationSuccess,
  onCancel,
  isSignupFlow,
}) {
  const [otpCode, setOtpCode] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false); // To disable controls during timeout

  // DYNAMIC UI TEXT based on flow
  const headerText = isSignupFlow
    ? "Email Verification Required"
    : "Two-Factor Authentication";
  const instructionText = isSignupFlow
    ? "A verification code has been sent to your email. Enter it to complete registration."
    : "A 6-digit code has been sent to your email. Enter it to complete sign-in.";
  const buttonText = isSignupFlow ? "Verify & Register" : "Verify & Sign In";

  if (!pendingData || !pendingData.userId) {
    return (
      <div className="verify-container">
        <div className="verify-card error-card">
          <p>Error: Authentication data missing. Please sign in again.</p>
          <button className="primary-button" onClick={onCancel}>
            Return to Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsLoading(true);

    const base = "http://localhost:5000/api/auth";
    const endpoint = isSignupFlow
      ? `${base}/verify-signup`
      : `${base}/verify-otp`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: pendingData.userId,
          otpCode: otpCode.trim().toUpperCase(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // 🟢 Save token for BOTH signup and login flows
        if (data.token) {
          localStorage.setItem("userToken", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));
          console.log("Token Saved Successfully ✅");
        }

        // Continue with success handler
        onVerificationSuccess(data);
      } else if (isSignupFlow) {
        if (res.status === 401 && data.message.includes("expired")) {
          setMessage(
            <span className="error-text">
              OTP expired. Redirecting to sign up...
            </span>,
          );
          setIsRedirecting(true);
          setTimeout(() => {
            onCancel();
          }, 3000);
        } else if (res.status === 401 && data.message.includes("Incorrect")) {
          setMessage(
            <span className="error-text">
              Invalid verification code. Please try again.
            </span>,
          );
        } else if (res.status === 404) {
          setMessage(
            <span className="error-text">
              User data not found. Please sign up again.
            </span>,
          );
          setIsRedirecting(true);
          setTimeout(onCancel, 3000);
        } else {
          setMessage(
            <span className="error-text">
              {data.message || "Verification failed."}
            </span>,
          );
        }
      } else {
        setMessage(data.message || "Invalid or expired code.");
      }
    } catch (error) {
      console.error("Verification Network Error:", error);
      setMessage("Network error! Could not connect to the backend.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="verify-container">
      <div className="verify-card">
        {/* Header and Subtitle pulled from your existing state */}
        <h2 className="title">{headerText}</h2>
        <p className="subtitle">{instructionText}</p>

        {/* Email info box for better UX */}
        <p className="email-info">Code sent to: {pendingData.email}</p>

        <form onSubmit={handleSubmit}>
          <input
            /* 🟢 Updated className to use normal otp-input style */
            className={`input-field otp-single-input ${isRedirecting ? "disabled" : ""}`}
            type="text"
            placeholder="Enter OTP Code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            maxLength="6"
            required
            disabled={isLoading || isRedirecting}
          />
          <button
            type="submit"
            className={`primary-button ${isLoading || isRedirecting ? "loading" : ""}`}
            disabled={isLoading || isRedirecting}
          >
            {isLoading ? "Verifying..." : buttonText}
          </button>

          {message && (
            /* 🟢 Status message styling matches your Global.css */
            <p className={`status-message ${message.toLowerCase().includes("success") ? "success" : "error"}`}>
              {message}
            </p>
          )}
        </form>

        {/* 🟢 Updated from <p> to <button> to match Sign In "Sign Up" button style */}
        <button
          type="button"
          className={`secondary-button ${isRedirecting ? "disabled-link" : ""}`}
          onClick={onCancel}
          style={{ marginTop: '20px', width: '100%' }}
        >
          Cancel and Return to Sign In
        </button>
      </div>
    </div>
  );
}