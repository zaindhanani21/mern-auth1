import React from 'react';
import './Css/LandingPage.css';

export default function LandingPage({ onNavigate }) {
    return (
        <div className="landing-container">
            {/* 1. Navigation */}
            <nav className="landing-nav">
                <div className="nav-logo">Wallexa.</div>
                <div className="nav-links">
                    <button className="nav-btn" onClick={() => onNavigate('signin')}>Sign In</button>
                    <button className="nav-btn nav-btn-primary" onClick={() => onNavigate('signup')}>Get Started</button>
                </div>
            </nav>

            {/* 2. Hero Section */}
            <section className="hero-section">
                <div className="bg-blob blob-1"></div>
                <div className="bg-blob blob-2"></div>

                <div className="hero-content">
                    <h1 className="hero-title">
                        The Future of <br /> Digital Payments
                    </h1>
                    <p className="hero-subtitle">
                        Experience lightning-fast transactions, military-grade security,
                        and total control over your finances with Wallexa.
                    </p>

                    <div className="hero-buttons">
                        <button className="btn-hero-primary" onClick={() => onNavigate('signup')}>
                            Create Free Account
                        </button>
                        <button className="btn-hero-secondary" onClick={() => onNavigate('signin')}>
                            Log In to Dashboard
                        </button>
                    </div>
                </div>
            </section>

            {/* 3. Features Section */}
            <section className="features-container">
                <div className="features-grid">
                    <div className="feature-card">
                        <span className="feature-icon">🚀</span>
                        <h3 className="feature-title">Instant Transfers</h3>
                        <p className="feature-desc">Send money to anyone, anywhere, in seconds. No delays, no hidden fees.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🛡️</span>
                        <h3 className="feature-title">Secure & 2FA</h3>
                        <p className="feature-desc">Your account is protected with advanced encryption and OTP verification for every login.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">❄️</span>
                        <h3 className="feature-title">Freeze Control</h3>
                        <p className="feature-desc">Lost your details? Freeze your account instantly with a single click from your dashboard.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
