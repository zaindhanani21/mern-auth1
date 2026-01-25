import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 💸 Standard P2P Transfer Email
export const sendTransferEmail = async (recipientEmail, subject, details) => {
  const mailOptions = {
    from: '"Waxella Security" <alerts@waxella.com>',
    to: recipientEmail,
    subject: subject,
    html: `
      <div>
        <h2>Transaction Alert</h2>
        <p>A transaction has been processed on your Waxella account.</p>
        <table>
          <tr><td><strong>Amount:</strong></td><td>PKR ${details.amount}</td></tr>
          <tr><td><strong>Related Party:</strong></td><td>${details.senderName}</td></tr>
          <tr><td><strong>Mobile:</strong></td><td>${details.senderMobile}</td></tr>
          <tr><td><strong>Transaction ID:</strong></td><td>${details.txId}</td></tr>
        </table>
      </div>
    `,
  };
  return transporter.sendMail(mailOptions);
};

// 💳 Dedicated "Add Money" Email (Fixes 'Mobile' label)
export const sendAddMoneyEmail = async (recipientEmail, subject, details) => {
  const mailOptions = {
    from: '"Waxella Security" <alerts@waxella.com>',
    to: recipientEmail,
    subject: subject,
    html: `
      <div>
        <h2>Funds Added Successfully</h2>
        <p>Your Waxella wallet has been credited from an external source.</p>
        <table>
          <tr><td><strong>Amount:</strong></td><td>PKR ${details.amount}</td></tr>
          <tr><td><strong>Bank Name:</strong></td><td>${details.senderName}</td></tr>
          <tr><td><strong>Card Number:</strong></td><td>${details.cardNumber}</td></tr> 
          <tr><td><strong>Transaction ID:</strong></td><td>${details.txId}</td></tr>
        </table>
        
      </div>
    `,
  };
  return transporter.sendMail(mailOptions);
};

// 🔒 Security Email (Freeze/Unfreeze)
export const sendSecurityEmail = async (recipientEmail, subject, status) => {
  const mailOptions = {
    from: '"Waxella Security" <alerts@waxella.com>',
    to: recipientEmail,
    subject: subject,
    html: `
      <div>
        <h2>Security Alert: Account Status Changed</h2>
        <p>Your account has been successfully: <strong>${status}</strong></p>
        <p>If you did not perform this action, contact support@waxella.com immediately.</p>
      </div>
    `,
  };
  return transporter.sendMail(mailOptions);
};