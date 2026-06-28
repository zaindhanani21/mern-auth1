import React from 'react';
import './Css/LandingPage.css';

export default function LandingPage({ onNavigate }) {
    return (
        <div className="landing-container">
            {/* 1. Navigation */}
            <nav className="landing-nav">
                <div className="nav-logo">WALLEXA</div>
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
                <div className="features-heading">
                    <h2 className="features-title">Everything You Need</h2>
                    <p className="features-subtitle">One app. All your financial & social needs covered.</p>
                </div>
                <div className="features-grid">
                    <div className="feature-card">
                        <span className="feature-icon">🚀</span>
                        <h3 className="feature-title">Instant Transfers</h3>
                        <p className="feature-desc">Send money to anyone, anywhere, in seconds. No delays, no hidden fees.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🛡️</span>
                        <h3 className="feature-title">Secure & 2FA</h3>
                        <p className="feature-desc">Advanced encryption and OTP verification protects every login and transaction.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">❄️</span>
                        <h3 className="feature-title">Freeze Control</h3>
                        <p className="feature-desc">Lost your details? Freeze your account instantly with a single click.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🧾</span>
                        <h3 className="feature-title">Utility Bill Payments</h3>
                        <p className="feature-desc">Pay electricity, gas, and water bills directly from your wallet — K-Electric, SSGC & more.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🤝</span>
                        <h3 className="feature-title">Bill Splitting</h3>
                        <p className="feature-desc">Split expenses with friends effortlessly. Request, track, and settle shared bills in one tap.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🏦</span>
                        <h3 className="feature-title">Bank Transfers</h3>
                        <p className="feature-desc">Send money directly to any Pakistani bank account. Fast, secure, and reliable.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">📱</span>
                        <h3 className="feature-title">Social Feed</h3>
                        <p className="feature-desc">Share payment receipts, post updates, like & comment — connect with your financial circle.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">💬</span>
                        <h3 className="feature-title">Real-time Chat</h3>
                        <p className="feature-desc">Message friends directly inside the app. Instant delivery, read receipts, fully real-time.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">🔔</span>
                        <h3 className="feature-title">Live Notifications</h3>
                        <p className="feature-desc">Get instant alerts for every transaction, friend request, and social activity as it happens.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">💳</span>
                        <h3 className="feature-title">Card Top-up</h3>
                        <p className="feature-desc">Add funds to your wallet securely via Stripe — fast, reliable, and hassle-free.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">👤</span>
                        <h3 className="feature-title">Smart Profile</h3>
                        <p className="feature-desc">Manage your identity, upload a profile picture, and control your social presence.</p>
                    </div>
                    <div className="feature-card">
                        <span className="feature-icon">📊</span>
                        <h3 className="feature-title">Transaction History</h3>
                        <p className="feature-desc">Full history of every payment with timestamps, amounts, and sender/receiver details.</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
