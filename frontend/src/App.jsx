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
    const [currentPage, setCurrentPage] = useState(PAGES.LANDING);
    const [userData, setUserData] = useState(null);
    const [pendingVerification, setPendingVerification] = useState(null);
    const [pendingSignupVerification, setPendingSignupVerification] = useState(null);
    const [globalMessage, setGlobalMessage] = useState(null);

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
        setCurrentPage(PAGES.SIGNIN);
    };

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
                        // User is now verified and has a token - go to dashboard
                        setUserData(data);
                        setPendingSignupVerification(null);
                        setCurrentPage(PAGES.DASHBOARD);
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
                // 🟢 Removed Admin Navigation handler
                />
            )}
        </div>
    );
}

export default App;