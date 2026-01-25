import React, { useState } from "react";
import "./Css/Wallexa.css"; // The Global Theme
import "./Css/Signup.css"; // The Specific Signup Layout

export default function Signup({ onSwitchToSignin, onSignupSuccess }) {
  const [firstName, setFirstName] = useState("");
  const [midName, setMidName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [cnicNum, setCnicNum] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [ageError, setAgeError] = useState("");

  const nationalities = ["Pakistan"];

  const getEighteenYearsAgoDate = () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return date.toISOString().split("T")[0]; // Returns YYYY-MM-DD
  };

  // --- 🟢 NAME VALIDATION HELPER ---
  // This removes any characters that are NOT letters or spaces
  const handleNameInput = (value, setter) => {
    const cleanedName = value.replace(/[^a-zA-Z\s]/g, "");
    setter(cleanedName);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setAgeError("");

    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    if (age < 18) {
      // 🟢 This sets the state, but we must make sure it's visible in the UI below
      return setMessage(
        "Registration failed: You must be at least 18 years old to join Wallexa.",
      );
    }

    // --- 🟢 EMAIL VALIDATION CHECK ---
    // Ensures the "@" character is present before attempting the fetch
    if (!email.includes("@")) {
      return setMessage("Please enter a valid email address containing '@'.");
    }

    const userData = {
      firstName,
      midName,
      lastName,
      email,
      mobileNumber,
      dateOfBirth,
      nationality,
      cnicNum,
      password,
    };

    try {
      const res = await fetch("http://localhost:5000/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      const data = await res.json();

      if (res.ok) {
        onSignupSuccess(data);
        setMessage("Verification initiated. Please check your email inbox.");
      } else {
        setMessage(data.message || "Signup failed. Please try again.");
      }
    } catch (err) {
      setMessage("Network error! Could not connect to backend.");
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <h1 className="main-heading">Wallexa Sign Up</h1>
        <p className="sub-heading">Secure • Fast • Smart Payments</p>

        <h2 className="section-title">Create Your Account</h2>

        <form onSubmit={handleSubmit}>
          {/* 1. Name Fields - Restricted to letters only */}
          <div className="flex-row">
            <input
              className="input-field"
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => handleNameInput(e.target.value, setFirstName)}
              required
            />
            <input
              className="input-field"
              type="text"
              placeholder="Middle Name (Optional)"
              value={midName}
              onChange={(e) => handleNameInput(e.target.value, setMidName)}
            />
            <input
              className="input-field"
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => handleNameInput(e.target.value, setLastName)}
              required
            />
          </div>

          {/* 2. Email & Mobile Number */}
          <div className="flex-row">
            <input
              className="input-field"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input-field"
              type="tel"
              placeholder="Mobile (11 digits)"
              value={mobileNumber}
              onChange={(e) => {
                const value = e.target.value;
                const cleanedValue = value.replace(/[^0-9]/g, "").slice(0, 11);
                setMobileNumber(cleanedValue);
              }}
              required
            />
          </div>

          {/* 3. Date of Birth & Nationality */}
          <div className="flex-row">
            <div className="input-wrapper">
              <label className="input-label">Date of Birth:</label>
              <input
                className="input-field"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
              />
            
            </div>

            <div className="input-wrapper">
              <label className="input-label">Nationality:</label>
              <select
                className="input-field select-field"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select your Nationality
                </option>
                {nationalities.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. CNIC Number & Password */}
          <div className="flex-row">
            <input
              className="input-field"
              type="text"
              placeholder="CNIC (e.g., XXXXX-XXXXXXX-X)"
              value={cnicNum}
              onChange={(e) => {
                const value = e.target.value;
                let cleanedValue = value.replace(/[^0-9]/g, "");

                if (cleanedValue.length > 5) {
                  cleanedValue =
                    cleanedValue.slice(0, 5) + "-" + cleanedValue.slice(5);
                }
                if (cleanedValue.length > 13) {
                  cleanedValue =
                    cleanedValue.slice(0, 13) + "-" + cleanedValue.slice(13);
                }

                if (cleanedValue.length <= 15) {
                  setCnicNum(cleanedValue);
                }
              }}
              required
            />
            <input
              className="input-field"
              type="password"
              placeholder="Create Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value); // 🟢 This allows rewriting
                if (message.includes("password")) setMessage(""); // 🟢 Clears error while typing
              }}
              required
            />
          </div>

          <button type="submit" className="primary-button">
            Register
          </button>
        </form>

        {message && (
          <p
            className={`status-message ${message.includes("Verification initiated") ? "success" : "error"}`}
          >
            {message}
          </p>
        )}

        <div className="footer-section">
          <p className="footer-text">Already have an account?</p>
          <button
            type="button"
            onClick={onSwitchToSignin}
            className="secondary-button"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
