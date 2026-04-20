import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Css/Signup.css';

// 🟢 Multi-Step Signup Component
export default function SignUp({ onSwitchToSignin, onSignupSuccess }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '', midName: '', lastName: '',
    mobileNumber: '', email: '',
    dateOfBirth: '', nationality: '', cnicNum: '',
    password: '', confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Constants
  const nationalities = ["Pakistan", "United Arab Emirates", "Saudi Arabia", "United Kingdom", "USA"];

  // Logic
  const updateField = (e) => {
    let val = e.target.value;
    const name = e.target.name;

    if (name === "firstName" || name === "lastName" || name === "midName") {
       val = val.replace(/[^a-zA-Z\s]/g, '');
    } else if (name === "cnicNum") {
       val = val.replace(/[^0-9]/g, '');
       if (val.length > 5) val = val.substring(0, 5) + '-' + val.substring(5);
       if (val.length > 13) val = val.substring(0, 13) + '-' + val.substring(13);
       val = val.substring(0, 15);
    }

    setFormData({ ...formData, [name]: val });
    setError('');
  };

  const getPasswordStrength = () => {
    const p = formData.password;
    if (!p) return 0;
    let s = 0;
    if (p.length > 7) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s; // 0 to 4
  };

  const isUnder18 = (dobString) => {
    if (!dobString) return false;
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age < 18;
  };

  const nextStep = () => {
    // Basic validations per step
    if (step === 1) {
      if (!formData.firstName || !formData.lastName) return setError("Name fields are required.");
    }
    if (step === 2) {
      if (!formData.dateOfBirth || !formData.nationality || !formData.cnicNum) return setError("Personal details required.");
      if (isUnder18(formData.dateOfBirth)) return setError("You must be at least 18 years old to sign up.");
      // Masking check for CNIC
      if (!/^\d{5}-\d{7}-\d{1}$/.test(formData.cnicNum)) return setError("CNIC format: 12345-1234567-1");
    }
    if (step === 3) {
      if (!formData.email || !formData.mobileNumber) return setError("Contact info required.");
    }
    setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) return setError("Passwords do not match.");
    if (getPasswordStrength() < 3) return setError("Password is too weak.");

    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        onSignupSuccess(data);
      } else {
        setError(data.message || "Signup failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  // UI Renderers
  return (
    <div className="signup-container">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="signup-card"
      >
        <div className="progress-bar">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`progress-step ${step >= s ? 'active' : ''}`}></div>
          ))}
        </div>

        <h1 className="title">Create Account</h1>
        <p className="subtitle">Step {step} of 4</p>

        <form onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
              >
                <h3 className="section-title">Who are you?</h3>
                <div className="flex-row">
                  <input className="input-field" name="firstName" placeholder="First Name" value={formData.firstName} onChange={updateField} />
                  <input className="input-field" name="lastName" placeholder="Last Name" value={formData.lastName} onChange={updateField} />
                </div>
                <input className="input-field" name="midName" placeholder="Middle Name (Optional)" value={formData.midName} onChange={updateField} />

                <button type="button" className="primary-button" onClick={nextStep}>Next: Personal Details →</button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
              >
                <h3 className="section-title">Personal Details</h3>
                <input className="input-field" style={{ marginBottom: isUnder18(formData.dateOfBirth) ? '5px' : '15px' }} type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={updateField} />
                {isUnder18(formData.dateOfBirth) && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'left', marginBottom: '15px', fontWeight: '500' }}>
                    You must be at least 18 years old.
                  </div>
                )}

                <select className="input-field select-field" name="nationality" value={formData.nationality} onChange={updateField}>
                  <option value="">Select Nationality</option>
                  {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
                </select>

                <input className="input-field" name="cnicNum" placeholder="CNIC (xxxxx-xxxxxxx-x)" value={formData.cnicNum} onChange={updateField} maxLength={15} />

                <div className="flex-row">
                  <button type="button" className="secondary-button" onClick={prevStep}>Back</button>
                  <button type="button" className="primary-button" onClick={nextStep}>Next: Contact →</button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
              >
                <h3 className="section-title">Contact Info</h3>
                <input className="input-field" name="email" type="email" placeholder="Email Address" value={formData.email} onChange={updateField} />
                <input className="input-field" name="mobileNumber" placeholder="Mobile (e.g., 03001234567)" value={formData.mobileNumber} onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 11) })} />

                <div className="flex-row">
                  <button type="button" className="secondary-button" onClick={prevStep}>Back</button>
                  <button type="button" className="primary-button" onClick={nextStep}>Next: Security →</button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
              >
                <h3 className="section-title">Secure Your Account</h3>
                <input className="input-field" name="password" type="password" placeholder="Password" value={formData.password} onChange={updateField} />

                {/* Strength Indicator */}
                <div className="strength-bar">
                  {[1, 2, 3, 4].map(i => <div key={i} className={`seg ${getPasswordStrength() >= i ? 'filled' : ''}`}></div>)}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'left', marginBottom: '15px' }}>Must contain uppercase, number, and special char.</p>

                <input className="input-field" name="confirmPassword" type="password" placeholder="Confirm Password" value={formData.confirmPassword} onChange={updateField} />

                <div className="flex-row">
                  <button type="button" className="secondary-button" onClick={prevStep}>Back</button>
                  <button type="submit" className="primary-button" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className="status-message error">{error}</p>}

          <p className="footer-text" style={{ marginTop: '20px', cursor: 'pointer', color: '#6366f1' }} onClick={onSwitchToSignin}>
            Already have an account? Sign In
          </p>
        </form>
      </motion.div>
    </div>
  );
}
