import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send Money Received Email
 */
export const sendMoneyReceivedEmail = async (recipientEmail, senderName, amount) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: '💰 Money Received - Wallexa',
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
              <a href="http://localhost:5173" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated message from Wallexa. Please do not reply to this email.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log(`✅ Money received email sent to ${recipientEmail}`);
  } catch (error) {
    console.error('❌ Error sending money received email:', error);
  }
};

/**
 * Send Money Sent Email
 */
export const sendMoneySentEmail = async (senderEmail, recipientName, amount) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: senderEmail,
      subject: '📤 Money Sent - Wallexa',
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
              <a href="http://localhost:5173" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated message from Wallexa. Please do not reply to this email.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log(`✅ Money sent email sent to ${senderEmail}`);
  } catch (error) {
    console.error('❌ Error sending money sent email:', error);
  }
};

/**
 * Send Funds Added Email
 */
export const sendFundsAddedEmail = async (userEmail, amount) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: '💳 Funds Added - Wallexa',
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
              <a href="http://localhost:5173" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>This is an automated message from Wallexa. Please do not reply to this email.</p>
            <p>© 2026 Wallexa. All rights reserved.</p>
          </div>
        </div>
      `
    });
    console.log(`✅ Funds added email sent to ${userEmail}`);
  } catch (error) {
    console.error('❌ Error sending funds added email:', error);
  }
};