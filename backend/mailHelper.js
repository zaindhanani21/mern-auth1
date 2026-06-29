import dotenv from "dotenv";
import { sendEmail } from "./emailService.js";

dotenv.config();

/**
 * Send Money Received Email
 */
export const sendMoneyReceivedEmail = async (
  recipientEmail,
  senderName,
  amount,
) => {
  try {
    await sendEmail({
      
      to: recipientEmail,
      subject: "💰 Money Received - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0;">Digital Wallet</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #10b981; margin-top: 0;">✅ Money Received!</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Great news! You've received money in your Wallexa account.
            </p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">From:</td>
                  <td style="padding: 10px 0; color: #1e293b; font-weight: 600; text-align: right;">${senderName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Amount:</td>
                  <td style="padding: 10px 0; color: #10b981; font-weight: 700; font-size: 24px; text-align: right;">PKR ${amount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Time:</td>
                  <td style="padding: 10px 0; color: #1e293b; text-align: right;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
              Log in to your Wallexa account to view your updated balance.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://mern-auth1-flame.vercel.app" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated message from Wallexa. Please do not reply to this email.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ Money received email sent to ${recipientEmail}`);
  } catch (error) {
    console.error("❌ Error sending money received email:", error);
  }
};

/**
 * Send Money Sent Email
 */
export const sendMoneySentEmail = async (
  senderEmail,
  recipientName,
  amount,
) => {
  try {
    await sendEmail({
      
      to: senderEmail,
      subject: "📤 Money Sent - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0;">Digital Wallet</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #3b82f6; margin-top: 0;">✅ Money Sent Successfully!</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Your money transfer has been completed successfully.
            </p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">To:</td>
                  <td style="padding: 10px 0; color: #1e293b; font-weight: 600; text-align: right;">${recipientName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Amount:</td>
                  <td style="padding: 10px 0; color: #ef4444; font-weight: 700; font-size: 24px; text-align: right;">- PKR ${amount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Time:</td>
                  <td style="padding: 10px 0; color: #1e293b; text-align: right;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
              Log in to your Wallexa account to view your updated balance and transaction history.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://mern-auth1-flame.vercel.app" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated message from Wallexa. Please do not reply to this email.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ Money sent email sent to ${senderEmail}`);
  } catch (error) {
    console.error("❌ Error sending money sent email:", error);
  }
};

/**
 * Send Funds Added Email
 */
export const sendFundsAddedEmail = async (userEmail, amount) => {
  try {
    await sendEmail({
      
      to: userEmail,
      subject: "💳 Funds Added - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0;">Digital Wallet</p>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #10b981; margin-top: 0;">✅ Funds Added Successfully!</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Your wallet has been topped up successfully.
            </p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Amount Added:</td>
                  <td style="padding: 10px 0; color: #10b981; font-weight: 700; font-size: 24px; text-align: right;">+ PKR ${amount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Time:</td>
                  <td style="padding: 10px 0; color: #1e293b; text-align: right;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
              Your funds are now available in your Wallexa account.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://mern-auth1-flame.vercel.app" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated message from Wallexa. Please do not reply to this email.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ Funds added email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Error sending funds added email:", error);
  }
};

/**
 * Send Security Alert Email (Velocity Check)
 */
export const sendSecurityAlertEmail = async (userEmail, reason) => {
  try {
    await sendEmail({
      
      to: userEmail,
      subject: "🚨 Security Alert: Wallet Frozen - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa Security</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #ef4444; margin-top: 0;">🚨 Wallet Frozen Due to Suspicious Activity</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Our system detected abnormal activity on your account: <strong>${reason}</strong>.
            </p>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              For your safety, your wallet has been temporarily frozen. All outgoing transfers, bill payments, and card loads have been suspended.
            </p>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
              To unfreeze your wallet, log in to your dashboard and verify your identity using the Unfreeze button.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated security message from Wallexa. Please do not reply.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ Security alert email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Error sending security alert email:", error);
  }
};

/**
 * Send Security OTP Email for Large Transaction Verification
 */
export const sendSecurityOtpEmail = async (userEmail, amount, otp) => {
  try {
    await sendEmail({
      
      to: userEmail,
      subject: "🔒 Transaction Verification OTP - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa Security</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #1e293b; margin-top: 0;">Confirm Your Transaction</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              A high-value transaction of <strong>PKR ${amount.toLocaleString()}</strong> is being initiated from your account. 
            </p>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Please use the following verification code to authorize this transaction:
            </p>
            
            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: 700; color: #4f46e5; letter-spacing: 5px;">${otp}</span>
            </div>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
              This code is valid for 10 minutes. If you did not initiate this transaction, please freeze your wallet immediately.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated security message from Wallexa. Please do not reply.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ Transaction verification OTP email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Error sending transaction OTP email:", error);
  }
};

/**
 * Send Inactivity Logout Email
 */
export const sendInactivityLogoutEmail = async (userEmail, userName) => {
  try {
    await sendEmail({
      
      to: userEmail,
      subject: "🔒 Security Alert: Session Expired - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa Security</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #1e293b; margin-top: 0;">Session Auto-Logout Alert</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Hello <strong>${userName}</strong>,
            </p>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              For your account security, your Wallexa wallet session has been automatically logged out due to 5 minutes of inactivity.
            </p>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              If you wish to access your wallet again, please log in from your browser.
            </p>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://mern-auth1-flame.vercel.app" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                Log In Again
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated security message from Wallexa. Please do not reply.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ Inactivity logout email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Error sending inactivity logout email:", error);
  }
};

/**
 * Send PIN Changed Notification Email
 */
export const sendPinChangedEmail = async (userEmail, userName) => {
  try {
    await sendEmail({
      
      to: userEmail,
      subject: "🔒 Security Confirmation: Transaction PIN Changed - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Wallexa Security</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h2 style="color: #10b981; margin-top: 0;">Transaction PIN Changed Successfully</h2>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              Hello <strong>${userName}</strong>,
            </p>
            
            <p style="font-size: 16px; color: #334155; line-height: 1.6;">
              This is a security confirmation that your 6-digit transaction PIN has been successfully changed/reset.
            </p>
            
            <p style="font-size: 16px; color: #ef4444; line-height: 1.6; font-weight: bold;">
              If you did not make this change, please contact Wallexa support immediately or lock your account to secure your funds.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated security message from Wallexa. Please do not reply.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `,
    });
    console.log(`✅ PIN change notification email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Error sending PIN change email:", error);
  }
};


/**
 * Send Split Bill Request Email
 */
export const sendSplitRequestEmail = async (
  recipientEmail,
  requesterName,
  amount,
  description
) => {
  try {
    await sendEmail({
      
      to: recipientEmail,
      subject: "🧾 Split Bill Request - Wallexa",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #667eea;">🧾 Split Bill Request</h2>
          <p>Hi there,</p>
          <p><strong>${requesterName}</strong> has requested you to pay your share of a split bill.</p>
          <div style="background: #f1f5f9; padding: 20px; border-radius: 8px;">
            <p><strong>Description:</strong> ${description}</p>
            <p><strong>Your Share:</strong> PKR ${amount.toLocaleString()}</p>
          </div>
          <p>Please log in to your Wallexa account to accept and pay this request.</p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Error sending split request email:", error);
  }
};