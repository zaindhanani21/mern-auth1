import React, { useState } from "react";
import Signup from "./components/SignUp";
import Signin from "./components/SignIn";
import Dashboard from "./components/Dashboard";
import VerifyOtp from "./components/VerifyOtp";
import LandingPage from "./components/LandingPage";

// 🟢 Simplified page states (ADMIN removed)
const PAGES = {
    LANDING: "landing",
    SIGNIN: "signin",
    SIGNUP: "signup",
    DASHBOARD: "dashboard",
    VERIFY_OTP: "verifyOtp",
    VERIFY_SIGNUP: "verifySignup"
};

function App() {
    const [userData, setUserData] = useState(() => {
        const saved = localStorage.getItem("userData");
        return saved ? JSON.parse(saved) : null;
    });
    const [currentPage, setCurrentPage] = useState(() => {
        const saved = localStorage.getItem("userData");
        return saved ? PAGES.DASHBOARD : PAGES.LANDING;
    });
    const [pendingVerification, setPendingVerification] = useState(null);
    const [pendingSignupVerification, setPendingSignupVerification] = useState(null);
    const [globalMessage, setGlobalMessage] = useState(null);
    const [showInactivityWarning, setShowInactivityWarning] = useState(false);
    const [warningCountdown, setWarningCountdown] = useState(60);

    const inactivityTimeoutRef = React.useRef(null);
    const countdownIntervalRef = React.useRef(null);
    const lastResetTime = React.useRef(Date.now());

    // Persist session
    React.useEffect(() => {
        if (userData) {
            localStorage.setItem("userData", JSON.stringify(userData));
        } else {
            localStorage.removeItem("userData");
        }
    }, [userData]);

    // 🟢 Simplified Sign-in Handler
    const handleSigninResponse = (data) => {
        setGlobalMessage(null);

        if (data.requiresOTP) {
            setPendingVerification({
                userId: data.userId,
                email: data.email
            });
            setCurrentPage(PAGES.VERIFY_OTP);
        } else {
            // 🟢 Everyone goes directly to the User Dashboard now
            setUserData(data);
            setPendingVerification(null);
            setCurrentPage(PAGES.DASHBOARD);
        }
    };

    const handleSignupResponse = (data) => {
        setGlobalMessage(null);
        if (data.signupVerificationRequired) {
            setPendingSignupVerification({
                userId: data.userId,
                email: data.email,
                isSignup: true
            });
            setCurrentPage(PAGES.VERIFY_SIGNUP);
        }
    };

    const handleLogout = () => {
        setUserData(null);
        setPendingVerification(null);
        setPendingSignupVerification(null);
        setGlobalMessage(null);
        localStorage.removeItem("userData");
        setCurrentPage(PAGES.SIGNIN);
    };

        // 🔒 Trigger Auto Logout and Email
    const triggerAutoLogout = async () => {
        setShowInactivityWarning(false);
        const savedUser = JSON.parse(localStorage.getItem("userData"));

        // Call backend to send inactivity logout email
        try {
            if (savedUser && savedUser.token) {
                 fetch("http://localhost:5000/api/auth/inactivity-logout", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${savedUser.token}`
                    }
                });
            }
        } catch (error) {
            console.error("Error sending inactivity email:", error);
        }

        // Perform logout state updates
        setUserData(null);
        setPendingVerification(null);
        setPendingSignupVerification(null);
        setGlobalMessage(null);
        localStorage.removeItem("userData");
        setCurrentPage(PAGES.LANDING); // Redirect directly to Landing Page
    };

    // 🔒 Reset Inactivity timer on activity (with 15s throttle)
    const resetInactivityTimer = () => {
        if (showInactivityWarning) return; // Warning screen par normal events ignore honge (Option 2)

        const now = Date.now();
        // 15 seconds throttle to prevent speed/CPU lag
        if (now - lastResetTime.current < 15 * 1000) return;
        lastResetTime.current = now;

        if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);

        // 4 mins check (5 mins total minus 1 min warning)
        inactivityTimeoutRef.current = setTimeout(() => {
            setShowInactivityWarning(true);
            setWarningCountdown(60);
        }, 15 * 60 * 1000); 
    };

    // 🔒 Click button to keep logged in
    const handleKeepMeLoggedIn = () => {
        setShowInactivityWarning(false);
        lastResetTime.current = Date.now();
        if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = setTimeout(() => {
            setShowInactivityWarning(true);
            setWarningCountdown(60);
        }, 60 * 60 * 1000);
    };

    // 🔒 Effect to monitor user activity on window
    React.useEffect(() => {
        if (!userData || currentPage !== PAGES.DASHBOARD) {
            if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
            setShowInactivityWarning(false);
            return;
        }

        // Initial setup
        lastResetTime.current = Date.now();
        inactivityTimeoutRef.current = setTimeout(() => {
            setShowInactivityWarning(true);
            setWarningCountdown(60);
        }, 60 * 60 * 1000);

        const events = ["mousemove", "click", "scroll", "keydown", "touchstart"];
        events.forEach((event) => {
            window.addEventListener(event, resetInactivityTimer);
        });

        return () => {
            if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
            events.forEach((event) => {
                window.removeEventListener(event, resetInactivityTimer);
            });
        };
    }, [userData, currentPage, showInactivityWarning]);

    // 🔒 Effect to handle the warning countdown (60s tick down)
    React.useEffect(() => {
        if (!showInactivityWarning) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            return;
        }

        countdownIntervalRef.current = setInterval(() => {
            setWarningCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(countdownIntervalRef.current);
                    triggerAutoLogout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [showInactivityWarning]);

    return (
        <div>
            {/* DISPLAY GLOBAL MESSAGE ABOVE SIGNIN FORM */}
            {currentPage === PAGES.SIGNIN && globalMessage && (
                <div style={{ color: 'green', textAlign: 'center', padding: '10px', fontWeight: 'bold', fontSize: '16px' }}>
                    {globalMessage.text}
                </div>
            )}

            {currentPage === PAGES.LANDING && (
                <LandingPage
                    onNavigate={(page) => {
                        setGlobalMessage(null);
                        setCurrentPage(page);
                    }}
                />
            )}

            {currentPage === PAGES.SIGNIN && (
                <Signin
                    onSwitchToSignup={() => {
                        setGlobalMessage(null);
                        setCurrentPage(PAGES.SIGNUP);
                    }}
                    onSigninSuccess={handleSigninResponse}
                />
            )}

            {currentPage === PAGES.SIGNUP && (
                <Signup
                    onSwitchToSignin={() => {
                        setGlobalMessage(null);
                        setCurrentPage(PAGES.SIGNIN);
                    }}
                    onSignupSuccess={handleSignupResponse}
                />
            )}

            {/* Existing Login 2FA Route */}
            {currentPage === PAGES.VERIFY_OTP && (
                <VerifyOtp
                    pendingData={pendingVerification}
                    onVerificationSuccess={handleSigninResponse}
                    onCancel={() => {
                        setGlobalMessage(null);
                        setCurrentPage(PAGES.SIGNIN);
                    }}
                />
            )}

            {/* SIGNUP VERIFICATION ROUTE */}
            {currentPage === PAGES.VERIFY_SIGNUP && (
                <VerifyOtp
                    pendingData={pendingSignupVerification}
                    isSignupFlow={true}
                                        onVerificationSuccess={(data) => {
                        // Registration complete, clear pending and set success message
                        setPendingSignupVerification(null);
                        setGlobalMessage({ text: "Registration successful! Please sign in to your account." });
                        setCurrentPage(PAGES.SIGNIN); // Go to Sign In page
                    }}
                    onCancel={() => {
                        setGlobalMessage(null);
                        setCurrentPage(PAGES.SIGNIN);
                    }}
                />
            )}

            {/* USER DASHBOARD ROUTE */}
            {currentPage === PAGES.DASHBOARD && (
                <Dashboard
                    userData={userData}
                    onLogout={handleLogout}
                />
            )}

            {/* ⏳ Premium Inactivity Warning Modal */}
            {showInactivityWarning && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backgroundColor: "rgba(15, 23, 42, 0.65)",
                    backdropFilter: "blur(8px)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 99999,
                }}>
                    <div style={{
                        background: "white",
                        padding: "40px 30px",
                        borderRadius: "20px",
                        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
                        textAlign: "center",
                        maxWidth: "400px",
                        width: "90%",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                    }}>
                        <div style={{ fontSize: "50px", marginBottom: "20px" }}>⏳</div>
                        <h3 style={{
                            color: "#0f172a",
                            fontSize: "1.45rem",
                            fontWeight: 700,
                            marginBottom: "10px"
                        }}>
                            Inactivity Warning
                        </h3>
                        <p style={{
                            color: "#475569",
                            fontSize: "0.95rem",
                            lineHeight: "1.5",
                            marginBottom: "25px"
                        }}>
                            For your account security, you will be logged out automatically in:
                        </p>
                        <div style={{
                            fontSize: "2.8rem",
                            fontWeight: 800,
                            color: warningCountdown <= 10 ? "#ef4444" : "#6366f1",
                            marginBottom: "30px",
                            fontFamily: "monospace"
                        }}>
                            {warningCountdown}s
                        </div>
                        <button
                            onClick={handleKeepMeLoggedIn}
                            style={{
                                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                                color: "white",
                                border: "none",
                                padding: "14px 28px",
                                borderRadius: "12px",
                                fontSize: "1rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                                width: "100%"
                            }}
                        >
                            Keep Me Logged In
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;