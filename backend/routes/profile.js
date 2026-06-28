import express from "express";
import { protect } from "../auth.js";
import FriendRequest from "../models/FriendRequest.js";
import User from "../models/User.js";
import crypto from "crypto";
import Post from "../models/Post.js";
import SocialProfile from "../models/SocialProfile.js";
import Notification from "../models/Notification.js";
import Message from "../models/Message.js";

const router = express.Router();

// Helper to decrypt CNIC for display
function decrypt(text) {
  if (!text || !text.includes(":")) return text;

  const ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
  const key =
    Buffer.from(ENCRYPTION_KEY, "hex").length === 32
      ? Buffer.from(ENCRYPTION_KEY, "hex")
      : crypto.createHash("sha256").update(String(ENCRYPTION_KEY)).digest();

  try {
    const parts = text.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return "XXXXX-XXXXXXX-X"; // Return masked if decryption fails
  }
}

// GET /api/profile - Get current user's profile
router.get("/", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -otp -otpExpires",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // SocialProfile check karna ke bana hai ya nahi
    const socialProfile = await SocialProfile.findOne({ userId: req.user._id });

    // Decrypt CNIC for display (masked)
    const cnicDecrypted = decrypt(user.cnicEncrypted);
     let cnicMasked = cnicDecrypted;
 // Agar valid CNIC hai (length > 5 aur decrypt fail nahi hua)
 if (cnicDecrypted !== "XXXXX-XXXXXXX-X" && cnicDecrypted.length > 5) {
     // Last 4 characters (e.g. 67-1) chorh kar sab numbers ko X kardo
     cnicMasked = cnicDecrypted.slice(0, -4).replace(/[0-9]/g, 'X') + cnicDecrypted.slice(-4);
 }

    res.json({
      id: user._id,
      firstName: user.firstName,
      midName: user.midName,
      lastName: user.lastName,
      email: user.email,
      mobileNumber: user.mobileNumber,
      dateOfBirth: user.dateOfBirth,
      nationality: user.nationality,
      cnicMasked,
      cnicFull: cnicDecrypted,
      profilePicture: user.profilePicture,
      isEmailVerified: user.isEmailVerified,
      username: socialProfile ? socialProfile.username : null, // 🟢 SocialProfile se lena
      displayName: socialProfile ? socialProfile.displayName : null, // 🟢 Custom name
      isMobileVerified: user.isMobileVerified,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/profile/update - Update profile (allowed fields only)
router.put("/update", protect, async (req, res) => {
  try {
    const { firstName, midName, lastName, dateOfBirth, nationality } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update allowed fields
    if (firstName) user.firstName = firstName;
    if (midName !== undefined) user.midName = midName; // Allow empty string
    if (lastName) user.lastName = lastName;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;
    if (nationality) user.nationality = nationality;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        firstName: user.firstName,
        midName: user.midName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
        nationality: user.nationality,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/profile/upload-picture - Upload profile picture (base64)
router.post("/upload-picture", protect, async (req, res) => {
  try {
    const { profilePicture } = req.body;

    if (!profilePicture) {
      return res.status(400).json({ message: "No image data provided" });
    }

    // Validate base64 image (basic check)
    if (!profilePicture.startsWith("data:image/")) {
      return res.status(400).json({ message: "Invalid image format" });
    }

    // Check size (limit to 2MB base64)
    if (profilePicture.length > 2 * 1024 * 1024) {
      return res.status(400).json({ message: "Image too large (max 2MB)" });
    }

    const user = await User.findById(req.user._id);
    user.profilePicture = profilePicture;
    await user.save();

    res.json({
      message: "Profile picture updated successfully",
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/profile/mobile/:mobileNumber - Get public profile by mobile number
router.get("/mobile/:mobileNumber", protect, async (req, res) => {
  try {
    const user = await User.findOne({
      mobileNumber: req.params.mobileNumber,
    }).select("firstName lastName mobileNumber");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      mobileNumber: user.mobileNumber,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/profile/:userId - Get public profile of another user

// 🟢 ROUTE A: GET /api/profile/check-username/:username - Availability & Safety check
router.get("/check-username/:username", protect, async (req, res) => {
  try {
    const username = req.params.username.trim().toLowerCase();

    // 1. Regular Expression (Regex) Validation - Minimum 4, Maximum 15 characters
    const usernameRegex = /^[a-z0-9_.]{4,15}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        message:
          "Invalid username. Must be 4-15 characters long and contain only lowercase letters, numbers, underscores (_), and dots (.). No spaces or special characters allowed!",
      });
    }

    // 2. Database check to see if someone already owns this username in SocialProfile
    const existingProfile = await SocialProfile.findOne({ username });
    if (existingProfile) {
      return res
        .status(400)
        .json({ message: "Username is already taken by another user!" });
    }

    res.json({ available: true, message: "Username is available!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE B: POST /api/profile/set-username - Save username & displayName permanently
router.post("/set-username", protect, async (req, res) => {
  try {
    const { username, displayName } = req.body;

    if (!username) {
      return res.status(400).json({ message: "Username is required!" });
    }
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ message: "Display Name is required!" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    // 1. Re-validate on the server side
    const usernameRegex = /^[a-z0-9_.]{4,15}$/;
    if (!usernameRegex.test(cleanUsername)) {
      return res.status(400).json({
        message:
          "Invalid username format. Must be 4-15 characters long and contain only lowercase letters, numbers, underscores (_), and dots (.).",
      });
    }

    // 2. Check if user already has a social profile
    const existingProfile = await SocialProfile.findOne({
      userId: req.user._id,
    });
    if (existingProfile) {
      return res
        .status(400)
        .json({ message: "You have already activated your social profile!" });
    }

    // 3. Double check uniqueness one more time in the database
    const usernameTaken = await SocialProfile.findOne({
      username: cleanUsername,
    });
    if (usernameTaken) {
      return res
        .status(400)
        .json({ message: "Username is already taken by another user!" });
    }

    // 4. Create new SocialProfile document
    const newProfile = new SocialProfile({
      userId: req.user._id,
      username: cleanUsername,
      displayName: cleanDisplayName,
    });
    await newProfile.save();

    res.json({
      message: "Social profile activated successfully!",
      username: cleanUsername,
      displayName: cleanDisplayName,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE C: POST /api/profile/deactivate-social - Reset username to null & delete all social data (posts, friends, requests)
router.post("/deactivate-social", protect, async (req, res) => {
  try {
    // 1. Delete all posts created by this user
    await Post.deleteMany({ author: req.user._id });

    // 2. Remove this user from all their friends' lists in SocialProfile
    await SocialProfile.updateMany(
      { friends: req.user._id },
      { $pull: { friends: req.user._id } },
    );

    // 3. Delete all pending friend requests (sent or received)
    await FriendRequest.deleteMany({
      $or: [{ sender: req.user._id }, { recipient: req.user._id }],
    });

    // 4. Delete the SocialProfile document completely
    await SocialProfile.findOneAndDelete({ userId: req.user._id });

    // 🌟 Socket.io real-time update broadcast karna taake baqi users ka feed clear ho jaye (Naya Code)
    if (req.io) {
      req.io.emit("social_deactivated", {
        userId: req.user._id.toString(),
      });
    }

    res.json({
      message: "Social profile deactivated and all data deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE D: GET /api/profile/search - Search for users by username & get friendship status (Allows self-search)
router.get("/search", protect, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res
        .status(400)
        .json({ message: "Username parameter is required!" });
    }

    const cleanUsername = username.trim().toLowerCase();

    // SocialProfile mein user ko dhoondna
    const foundProfile = await SocialProfile.findOne({
      username: cleanUsername,
    }).select("userId username displayName profilePicture friends");
    if (!foundProfile) {
      return res.status(404).json({ message: "User not found!" });
    }

    // Current logged in user ka SocialProfile fetch karna taake friends list check ho sake
    const myProfile = await SocialProfile.findOne({ userId: req.user._id });

    // Relationship status check karna
    let status = "NONE";
    let requestId = null;

    if (req.user._id.toString() === foundProfile.userId.toString()) {
      status = "SELF";
    } else {
      const isAlreadyFriends =
        myProfile &&
        myProfile.friends.some((friendId) =>
          friendId.equals(foundProfile.userId),
        );
      if (isAlreadyFriends) {
        status = "FRIENDS";
        // Agr dono users ke dosti records missing hain to verify check
      } else {
        // Check if current user sent request
        const sentRequest = await FriendRequest.findOne({
          sender: req.user._id,
          recipient: foundProfile.userId,
          status: "PENDING",
        });

        if (sentRequest) {
          status = "SENT";
          requestId = sentRequest._id;
        } else {
          // Check if current user received request from them
          const receivedRequest = await FriendRequest.findOne({
            sender: foundProfile.userId,
            recipient: req.user._id,
            status: "PENDING",
          });

          if (receivedRequest) {
            status = "RECEIVED";
            requestId = receivedRequest._id;
          }
        }
      }
    }

    res.json({
      id: foundProfile.userId, // frontend ki compatibiltiy ke liye
      firstName: foundProfile.displayName, // frontend ko user ka display name bejhna firstName ki jagah
      lastName: "", // lastName khali rakhna privacy ke liye
      username: foundProfile.username,
      profilePicture: foundProfile.profilePicture,
      status,
      requestId,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE E: POST /api/profile/friend-request/send - Send a friend request
router.post("/friend-request/send", protect, async (req, res) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ message: "Recipient ID is required!" });
    }

    if (req.user._id.toString() === recipientId) {
      return res
        .status(400)
        .json({ message: "You cannot send a friend request to yourself!" });
    }

    const recipientProfile = await SocialProfile.findOne({
      userId: recipientId,
    });
    if (!recipientProfile) {
      return res
        .status(404)
        .json({ message: "Recipient social profile not found!" });
    }

    const myProfile = await SocialProfile.findOne({ userId: req.user._id });
    if (!myProfile) {
      return res
        .status(400)
        .json({ message: "Activate your social profile first!" });
    }

    if (myProfile.friends.some((friendId) => friendId.equals(recipientId))) {
      return res
        .status(400)
        .json({ message: "You are already friends with this user!" });
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: req.user._id, recipient: recipientId },
        { sender: recipientId, recipient: req.user._id },
      ],
      status: "PENDING",
    });

    if (existingRequest) {
      return res
        .status(400)
        .json({
          message: "A pending friend request already exists between you!",
        });
    }

    const newRequest = new FriendRequest({
      sender: req.user._id,
      recipient: recipientId,
    });

    await newRequest.save();

    // 🌟 Socket.io real-time updates push karna recipient ko
    if (req.io) {
      req.io.to(recipientId).emit("friend_request_received", {
        requestId: newRequest._id,
        sender: {
          id: req.user._id,
          firstName: myProfile.displayName, // Display name return karna
          lastName: "",
          username: myProfile.username,
          profilePicture: myProfile.profilePicture,
        },
      });
    }

    res.json({
      message: "Friend request sent successfully!",
      requestId: newRequest._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE F: POST /api/profile/friend-request/accept - Accept a friend request
router.post("/friend-request/accept", protect, async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ message: "Request ID is required!" });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request || request.status !== "PENDING") {
      return res
        .status(404)
        .json({ message: "Request not found or already processed!" });
    }

    if (request.recipient.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You are not authorized to accept this request!" });
    }

    const senderProfile = await SocialProfile.findOne({
      userId: request.sender,
    });
    const recipientProfile = await SocialProfile.findOne({
      userId: request.recipient,
    });

    if (!senderProfile || !recipientProfile) {
      return res.status(404).json({ message: "Social profile not found!" });
    }

    // Dono users ko ek doosre ke friends lists mein add karna (SocialProfile collection mein)
    if (
      !senderProfile.friends.some((friendId) =>
        friendId.equals(recipientProfile.userId),
      )
    ) {
      senderProfile.friends.push(recipientProfile.userId);
      await senderProfile.save();
    }
    if (
      !recipientProfile.friends.some((friendId) =>
        friendId.equals(senderProfile.userId),
      )
    ) {
      recipientProfile.friends.push(senderProfile.userId);
      await recipientProfile.save();
    }

    // Request delete kar dena kyunki ab dosti ho gayi hai!
    await FriendRequest.findByIdAndDelete(requestId);

    // 🌟 Socket.io notification real-time update push karna sender ko
    if (req.io) {
      req.io.to(request.sender.toString()).emit("friend_request_accepted", {
        friend: {
          id: recipientProfile.userId,
          firstName: recipientProfile.displayName, // Display name return karna
          lastName: "",
          username: recipientProfile.username,
          profilePicture: recipientProfile.profilePicture,
        },
      });
    }

    res.json({ message: "Friend request accepted successfully!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE G: POST /api/profile/friend-request/reject - Reject or cancel a friend request
router.post("/friend-request/reject", protect, async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ message: "Request ID is required!" });
    }

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found!" });
    }

    const isRecipient =
      request.recipient.toString() === req.user._id.toString();
    const isSender = request.sender.toString() === req.user._id.toString();

    if (!isRecipient && !isSender) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this request!" });
    }

    const otherPartyId = isRecipient
      ? request.sender.toString()
      : request.recipient.toString();

    // Request ko database se completely delete karna (reset state)
    await FriendRequest.findByIdAndDelete(requestId);

    // 🌟 Socket.io real-time update push karna other party ko
    if (req.io) {
      req.io.to(otherPartyId).emit("friend_request_rejected", {
        requestId,
        senderId: req.user._id.toString(),
      });
    }

    res.json({ message: "Friend request deleted successfully!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE H: GET /api/profile/friend-requests - Fetch all pending incoming requests
router.get("/friend-requests", protect, async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      recipient: req.user._id,
      status: "PENDING",
    });

    // Naye SocialProfile schema ke mutabiq senders ki details manually fetch karna
    const populatedRequests = [];
    for (const request of requests) {
      const senderProfile = await SocialProfile.findOne({
        userId: request.sender,
      }).select("username displayName profilePicture");
      if (senderProfile) {
        populatedRequests.push({
          _id: request._id,
          sender: {
            id: request.sender,
            firstName: senderProfile.displayName, // displayName return karna taake real name hide ho
            lastName: "",
            username: senderProfile.username,
            profilePicture: senderProfile.profilePicture,
          },
          recipient: request.recipient,
          status: request.status,
          createdAt: request.createdAt,
        });
      }
    }

    res.json(populatedRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE I: GET /api/profile/friends - Fetch all friends of current user
router.get("/friends", protect, async (req, res) => {
  try {
    const myProfile = await SocialProfile.findOne({ userId: req.user._id });
    if (!myProfile) {
      return res.json([]);
    }

    // Friends ki social profile details fetch karna
    const populatedFriends = [];
    for (const friendId of myProfile.friends) {
      const friendProfile = await SocialProfile.findOne({
        userId: friendId,
      }).select("username displayName profilePicture");
      if (friendProfile) {
        populatedFriends.push({
          _id: friendId,
          id: friendId,
          firstName: friendProfile.displayName, // Display name
          lastName: "",
          username: friendProfile.username,
          profilePicture: friendProfile.profilePicture,
        });
      }
    }
    res.json(populatedFriends);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE J: POST /api/profile/friend/remove - Unfriend / Remove a friend
router.post("/friend/remove", protect, async (req, res) => {
  try {
    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).json({ message: "Friend ID is required!" });
    }

    const myProfile = await SocialProfile.findOne({ userId: req.user._id });
    const friendProfile = await SocialProfile.findOne({ userId: friendId });

    if (!myProfile || !friendProfile) {
      return res.status(404).json({ message: "Social profile not found!" });
    }

    // Dono users ke SocialProfile friends list se ek doosre ki ID delete karna
    myProfile.friends = myProfile.friends.filter(
      (fId) => fId.toString() !== friendId.toString(),
    );
    await myProfile.save();

    friendProfile.friends = friendProfile.friends.filter(
      (fId) => fId.toString() !== req.user._id.toString(),
    );
    await friendProfile.save();

    // 🌟 Socket.io real-time update push karna friend ko ke dosti khatam ho gayi hai!
    if (req.io) {
      req.io.to(friendId).emit("friend_removed", {
        friendId: req.user._id.toString(),
      });
    }

    res.json({ message: "Friend removed successfully!" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE K: POST /api/profile/posts - Create a new post with visibility setting
router.post("/posts", protect, async (req, res) => {
  try {
    const { content, visibility } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Post content cannot be empty!" });
    }

    const cleanContent = content.replace(/[<>;$]/g, "").trim();
    // Allow longer content for receipt posts
    const maxLen = content.startsWith('[RECEIPT_POST]') ? 1000 : 300;
    if (cleanContent.length > maxLen) {
      return res.status(400).json({ message: `Post content cannot exceed ${maxLen} characters!` });
    }

    // Validate visibility option
    const cleanVisibility = ["public", "friends", "private"].includes(
      visibility,
    )
      ? visibility
      : "public";

    const newPost = new Post({
      author: req.user._id,
      content: cleanContent,
      visibility: cleanVisibility,
    });

    await newPost.save();

    // Friends list fetch karna Socket broadcast ke liye
    const myProfile = await SocialProfile.findOne({ userId: req.user._id });
    const friendsList = myProfile
      ? myProfile.friends.map((fId) => fId.toString())
      : [];

    // 🌟 Socket.io real-time updates broadcast to other users
    if (req.io) {
      req.io.emit("post_created", {
        authorId: req.user._id.toString(),
        visibility: cleanVisibility,
        friends: friendsList,
      });
    }

    res
      .status(201)
      .json({ message: "Post shared successfully!", post: newPost });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE L: GET /api/profile/posts/feed - Fetch home social feed (My posts + Friends' posts, checking visibility rules)
router.get("/posts/feed", protect, async (req, res) => {
  try {
    const myProfile = await SocialProfile.findOne({ userId: req.user._id });
    const myFriends = myProfile ? myProfile.friends : [];

    // Find:
    // 1. My posts (any visibility)
    // 2. Friends' posts with visibility 'public' or 'friends'
    const posts = await Post.find({
      author: { $ne: req.user._id }, // 🟢 Apni posts timeline feed se exclude kar dein
      $or: [
        // 1. Wallexa ke kisi bhi user ki PUBLIC posts
        { visibility: "public" },
        // 2. Mere dosto ke FRIENDS-ONLY posts
        {
          author: { $in: myFriends },
          visibility: "friends",
        },
      ],
    }).sort({ createdAt: -1 });

    // Collect all unique author IDs from posts, comments, and reactions
    const authorIdsSet = new Set();
    posts.forEach((post) => {
      authorIdsSet.add(post.author.toString());
      if (post.comments) {
        post.comments.forEach((comment) => {
          authorIdsSet.add(comment.author.toString());
        });
      }
      if (post.reactions) {
        post.reactions.forEach((reaction) => {
          authorIdsSet.add(reaction.user.toString());
        });
      }
    });
    const authorIds = [...authorIdsSet];

    // 2. Sirf 1 query mein saare profiles fetch karna
    const authorProfiles = await SocialProfile.find({
      userId: { $in: authorIds },
    }).select("userId username displayName profilePicture");

    // 3. Map banana
    const profileMap = {};
    authorProfiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    // 4. Memory se fast populate karna (Bilkul pehle ki tarah)
    const populatedPosts = [];
    for (const post of posts) {
      const authorProfile = profileMap[post.author.toString()];
      if (authorProfile) {
        // Populate comments
        const populatedComments = (post.comments || []).map((comment) => {
          const commenterProfile = profileMap[comment.author.toString()];
          return {
            _id: comment._id,
            content: comment.content,
            createdAt: comment.createdAt,
            author: {
              _id: comment.author,
              id: comment.author,
              firstName: commenterProfile
                ? commenterProfile.displayName
                : "User",
              lastName: "",
              username: commenterProfile ? commenterProfile.username : "user",
              profilePicture: commenterProfile
                ? commenterProfile.profilePicture
                : null,
            },
          };
        });

        populatedPosts.push({
          _id: post._id,
          content: post.content,
          visibility: post.visibility,
          createdAt: post.createdAt,
          author: {
            _id: post.author,
            id: post.author,
            firstName: authorProfile.displayName,
            lastName: "",
            username: authorProfile.username,
            profilePicture: authorProfile.profilePicture,
          },
          comments: populatedComments, // 🟢 Populate comments
          reactions: (post.reactions || []).map((reaction) => {
            const reactorProfile = profileMap[reaction.user.toString()];
            return {
              user: reaction.user,
              type: reaction.type,
              username: reactorProfile ? reactorProfile.username : "user",
              displayName: reactorProfile ? reactorProfile.displayName : "User",
              profilePicture: reactorProfile
                ? reactorProfile.profilePicture
                : null,
            };
          }),
        });
      }
    }

    res.json(populatedPosts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE M: GET /api/profile/posts/user/:userId - Fetch posts of a specific user for public profile (checking relationship visibility)
router.get("/posts/user/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check relation
    const isSelf = req.user._id.toString() === userId.toString();

    let visibilityFilter = [];
    let targetProfile; // 🟢 Is variable ko block se bahar declare karein

    if (isSelf) {
      // View own profile -> show everything
      visibilityFilter = ["public", "friends", "private"];
      // 🟢 Apni profile fetch karein taake profile posts correctly display ho sakein
      targetProfile = await SocialProfile.findOne({ userId: req.user._id });
    } else {
      targetProfile = await SocialProfile.findOne({ userId: userId });
      if (!targetProfile) {
        return res
          .status(404)
          .json({ message: "User social profile not found!" });
      }

      const isFriend = targetProfile.friends.some((friendId) =>
        friendId.equals(req.user._id),
      );
      if (isFriend) {
        // Friend -> show public & friends-only posts
        visibilityFilter = ["public", "friends"];
      } else {
        // Non-friend -> show only public posts
        visibilityFilter = ["public"];
      }
    }

    const posts = await Post.find({
      author: userId,
      visibility: { $in: visibilityFilter },
    }).sort({ createdAt: -1 });

    // Collect all unique author IDs from posts, comments, and reactions
    const authorIdsSet = new Set();
    authorIdsSet.add(userId.toString());
    posts.forEach((post) => {
      if (post.comments) {
        post.comments.forEach((comment) => {
          authorIdsSet.add(comment.author.toString());
        });
      }
      if (post.reactions) {
        post.reactions.forEach((reaction) => {
          authorIdsSet.add(reaction.user.toString());
        });
      }
    });
    const authorIds = [...authorIdsSet];

    const authorProfiles = await SocialProfile.find({
      userId: { $in: authorIds },
    }).select("userId username displayName profilePicture");

    const profileMap = {};
    authorProfiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const targetProfileFromMap = profileMap[userId.toString()];
    if (!targetProfileFromMap) {
      return res
        .status(404)
        .json({ message: "User social profile not found!" });
    }

    const populatedPosts = posts.map((post) => {
      const populatedComments = (post.comments || []).map((comment) => {
        const commenterProfile = profileMap[comment.author.toString()];
        return {
          _id: comment._id,
          content: comment.content,
          createdAt: comment.createdAt,
          author: {
            _id: comment.author,
            id: comment.author,
            firstName: commenterProfile ? commenterProfile.displayName : "User",
            lastName: "",
            username: commenterProfile ? commenterProfile.username : "user",
            profilePicture: commenterProfile
              ? commenterProfile.profilePicture
              : null,
          },
        };
      });

      return {
        _id: post._id,
        content: post.content,
        visibility: post.visibility,
        createdAt: post.createdAt,
        author: {
          _id: post.author,
          id: post.author,
          firstName: targetProfileFromMap.displayName,
          lastName: "",
          username: targetProfileFromMap.username,
          profilePicture: targetProfileFromMap.profilePicture,
        },
        comments: populatedComments, // 🟢 Populate comments
        reactions: (post.reactions || []).map((reaction) => {
          const reactorProfile = profileMap[reaction.user.toString()];
          return {
            user: reaction.user,
            type: reaction.type,
            username: reactorProfile ? reactorProfile.username : "user",
            displayName: reactorProfile ? reactorProfile.displayName : "User",
            profilePicture: reactorProfile
              ? reactorProfile.profilePicture
              : null,
          };
        }),
      };
    });

    res.json(populatedPosts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PASTE IT HERE (Right before export default router) ──

// GET /api/profile/:userId - Get public profile of another user
router.get("/:userId", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "firstName lastName mobileNumber profilePicture",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      mobileNumber: user.mobileNumber,
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE N: POST /api/profile/posts/:postId/comment - Add a comment to a post
router.post("/posts/:postId/comment", protect, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res
        .status(400)
        .json({ message: "Comment content cannot be empty!" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found!" });
    }

    // Check relationship visibility before allowing comment
    const isSelf = post.author.toString() === req.user._id.toString();
    let allowed = false;

    if (isSelf) {
      allowed = true;
    } else {
      const authorProfile = await SocialProfile.findOne({
        userId: post.author,
      });
      if (authorProfile) {
        const isFriend = authorProfile.friends.some((friendId) =>
          friendId.equals(req.user._id),
        );
        if (
          post.visibility === "public" ||
          (post.visibility === "friends" && isFriend)
        ) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      return res
        .status(403)
        .json({ message: "You are not authorized to comment on this post!" });
    }

    // Add comment
    post.comments = post.comments || [];
    const newComment = {
      author: req.user._id,
      content: content.trim(),
      createdAt: new Date(),
    };
    post.comments.push(newComment);
    await post.save();

    const savedComment = post.comments[post.comments.length - 1];

    // 🟢 Generate real-time notification if someone else comments on your post
    if (post.author.toString() !== req.user._id.toString()) {
      const commenterProfile = await SocialProfile.findOne({
        userId: req.user._id,
      });
      const commenterName = commenterProfile
        ? commenterProfile.displayName
        : req.user.firstName;

      const notificationObj = await Notification.create({
        userId: post.author,
        title: "New Comment 💬",
        message: `${commenterName} commented on your post: "${content.substring(0, 30)}${content.length > 30 ? "..." : ""}"`,
        type: "SOCIAL_COMMENT",
        metadata: {
          postId: post._id,
          commentId: savedComment ? savedComment._id : null,
        },
      });

      // Emit via socket in real-time to the post author
      if (req.io) {
        req.io.to(post.author.toString()).emit("notification", notificationObj);
      }
    }

    // Fetch commenter profile to return populated author details
    const commenterProfile = await SocialProfile.findOne({
      userId: req.user._id,
    });

    const populatedComment = {
      _id: savedComment._id,
      content: savedComment.content,
      createdAt: savedComment.createdAt,
      author: {
        _id: req.user._id,
        id: req.user._id,
        firstName: commenterProfile
          ? commenterProfile.displayName
          : req.user.firstName,
        lastName: "",
        username: commenterProfile ? commenterProfile.username : "user",
        profilePicture: commenterProfile
          ? commenterProfile.profilePicture
          : req.user.profilePicture,
      },
    };

    // 🌟 Socket.io real-time update push comment
    if (req.io) {
      req.io.emit("comment_added", {
        postId,
        comment: populatedComment,
      });
    }

    res.json({
      message: "Comment added successfully!",
      comment: populatedComment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 GET /api/profile/posts/:postId - Fetch details of a single post with populated comments
router.get("/posts/:postId", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found!" });
    }

    // Check relationship visibility before allowing viewing
    const isSelf = post.author.toString() === req.user._id.toString();
    let allowed = false;

    if (isSelf) {
      allowed = true;
    } else {
      const authorProfile = await SocialProfile.findOne({
        userId: post.author,
      });
      if (authorProfile) {
        const isFriend = authorProfile.friends.some((friendId) =>
          friendId.equals(req.user._id),
        );
        if (
          post.visibility === "public" ||
          (post.visibility === "friends" && isFriend)
        ) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      return res
        .status(403)
        .json({ message: "You are not authorized to view this post!" });
    }

    // Collect all unique authors
    const authorIdsSet = new Set();
    authorIdsSet.add(post.author.toString());
    if (post.comments) {
      post.comments.forEach((comment) => {
        authorIdsSet.add(comment.author.toString());
      });
    }
    if (post.reactions) {
      post.reactions.forEach((reaction) => {
        authorIdsSet.add(reaction.user.toString());
      });
    }
    const authorIds = [...authorIdsSet];

    const authorProfiles = await SocialProfile.find({
      userId: { $in: authorIds },
    }).select("userId username displayName profilePicture");
    const profileMap = {};
    authorProfiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const authorProfile = profileMap[post.author.toString()];
    if (!authorProfile) {
      return res
        .status(404)
        .json({ message: "Post author profile not found!" });
    }

    const populatedComments = (post.comments || []).map((comment) => {
      const commenterProfile = profileMap[comment.author.toString()];
      return {
        _id: comment._id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: {
          _id: comment.author,
          id: comment.author,
          firstName: commenterProfile ? commenterProfile.displayName : "User",
          lastName: "",
          username: commenterProfile ? commenterProfile.username : "user",
          profilePicture: commenterProfile
            ? commenterProfile.profilePicture
            : null,
        },
      };
    });

    const populatedPost = {
      _id: post._id,
      content: post.content,
      visibility: post.visibility,
      createdAt: post.createdAt,
      author: {
        _id: post.author,
        id: post.author,
        firstName: authorProfile.displayName,
        lastName: "",
        username: authorProfile.username,
        profilePicture: authorProfile.profilePicture,
      },
      comments: populatedComments,
      reactions: (post.reactions || []).map((reaction) => {
        const reactorProfile = profileMap[reaction.user.toString()];
        return {
          user: reaction.user,
          type: reaction.type,
          username: reactorProfile ? reactorProfile.username : "user",
          displayName: reactorProfile ? reactorProfile.displayName : "User",
          profilePicture: reactorProfile ? reactorProfile.profilePicture : null,
        };
      }),
    };

    res.json(populatedPost);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🟢 ROUTE O: POST /api/profile/posts/:postId/react - React to a post (or change/toggle reaction)
router.post("/posts/:postId/react", protect, async (req, res) => {
  try {
    const { postId } = req.params;
    const { type } = req.body; // 'like' | 'love' | 'haha' | 'sad' | 'angry'

    const validTypes = ["like", "love", "haha", "sad", "angry"];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type!" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found!" });
    }

    // Check relationship visibility before allowing reaction
    const isSelf = post.author.toString() === req.user._id.toString();
    let allowed = false;

    if (isSelf) {
      allowed = true;
    } else {
      const authorProfile = await SocialProfile.findOne({
        userId: post.author,
      });
      if (authorProfile) {
        const isFriend = authorProfile.friends.some((friendId) =>
          friendId.equals(req.user._id),
        );
        if (
          post.visibility === "public" ||
          (post.visibility === "friends" && isFriend)
        ) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      return res
        .status(403)
        .json({ message: "You are not authorized to react to this post!" });
    }

    post.reactions = post.reactions || [];

    // 🟢 Get all existing reactions of the current user (if multiple exist due to glitch)
    const userReactions = post.reactions.filter(
      (r) => r.user.toString() === req.user._id.toString(),
    );

    let action = "";

    // 🟢 Remove all reactions of this user first (cleans any duplicate glitch data instantly)
    post.reactions = post.reactions.filter(
      (r) => r.user.toString() !== req.user._id.toString(),
    );

    if (userReactions.length > 0 && (!type || userReactions[0].type === type)) {
      // Toggle off (remove)
      action = "removed";
    } else if (type) {
      // Add or update reaction (save only ONE clean reaction)
      post.reactions.push({
        user: req.user._id,
        type: type,
      });
      action = userReactions.length > 0 ? "updated" : "added";
    }

    await post.save();

    // 🟢 Generate real-time notification if reaction was added/updated and it's not the author's own post
    if (
      action !== "removed" &&
      post.author.toString() !== req.user._id.toString()
    ) {
      const reactorProfile = await SocialProfile.findOne({
        userId: req.user._id,
      });
      const reactorName = reactorProfile
        ? reactorProfile.displayName
        : req.user.firstName;

      const emojiMap = {
        like: "👍",
        love: "❤️",
        haha: "😆",
        sad: "😢",
        angry: "😡",
      };
      const emojiStr = emojiMap[type] || "👍";

      const notificationObj = await Notification.create({
        userId: post.author,
        title: `New Reaction ${emojiStr}`,
        message: `${reactorName} reacted ${emojiStr} to your post: "${post.content.substring(0, 30)}${post.content.length > 30 ? "..." : ""}"`,
        type: "SOCIAL_REACT",
        metadata: {
          postId: post._id,
          reactorId: req.user._id,
        },
      });

      // Emit notification via socket to the post author
      if (req.io) {
        req.io.to(post.author.toString()).emit("notification", notificationObj);
      }
    }

    // Fetch reactor profile details to return updated populated reactions list
    const reactorIds = post.reactions.map((r) => r.user.toString());
    const reactorProfiles = await SocialProfile.find({
      userId: { $in: reactorIds },
    });
    const profileMap = {};
    reactorProfiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    const populatedReactions = post.reactions.map((r) => {
      const prof = profileMap[r.user.toString()];
      return {
        user: r.user,
        type: r.type,
        username: prof ? prof.username : "user",
        displayName: prof ? prof.displayName : "User",
        profilePicture: prof ? prof.profilePicture : null,
      };
    });

    // 🌟 Socket.io real-time update broadcast
    if (req.io) {
      req.io.emit("post_reacted", {
        postId,
        reactions: populatedReactions,
      });
    }

    res.json({
      message: `Reaction ${action} successfully!`,
      reactions: populatedReactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/profile/change-password - Profile se password change karna
router.post("/change-password", protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await require("../models/User").findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: "Incorrect current password" });

    if (await user.matchPassword(newPassword)) {
        return res.status(400).json({ message: "New password cannot be same as old password" });
    }

    user.password = newPassword;
    await user.save();

    try {
      const sendEmail = require("../utils/sendEmail");
      await sendEmail({
        email: user.email,
        subject: "Password Changed Successfully - Wallexa",
        text: `Hi ${user.firstName},\n\nYour Wallexa account password has been successfully changed from your profile.\n\nIf you did not make this change, please contact support immediately.\n\nWallexa Security Team`,
      });
    } catch (err) {
      console.log("Email error:", err);
    }

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ============================================================
// CHAT ROUTES
// ============================================================

// GET /api/profile/chat/conversations — list of friends I've chatted with + last msg + unread count
router.get("/chat/conversations", protect, async (req, res) => {
  try {
    const me = req.user._id;

    // Get all messages involving me
    const messages = await Message.find({
      $or: [{ sender: me }, { receiver: me }],
    })
      .sort({ createdAt: -1 })
      .populate("sender", "firstName lastName")
      .populate("receiver", "firstName lastName");

    // Build a map: friendId -> { lastMessage, unread }
    const convMap = new Map();
    for (const msg of messages) {
      const friendId =
        msg.sender._id.toString() === me.toString()
          ? msg.receiver._id.toString()
          : msg.sender._id.toString();

      if (!convMap.has(friendId)) {
        const unread = await Message.countDocuments({
          sender: friendId,
          receiver: me,
          read: false,
        });
        // Fetch social profile for username/picture
        const sp = await SocialProfile.findOne({ userId: friendId }).select(
          "username profilePicture displayName"
        );
        const friendUser =
          msg.sender._id.toString() === me.toString()
            ? msg.receiver
            : msg.sender;
        convMap.set(friendId, {
          friendId,
          firstName: friendUser.firstName,
          lastName: friendUser.lastName,
          username: sp?.username || null,
          profilePicture: sp?.profilePicture || null,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unread,
        });
      }
    }

    res.json(Array.from(convMap.values()));
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// GET /api/profile/chat/:friendId — get last 60 messages with a friend
router.get("/chat/:friendId", protect, async (req, res) => {
  try {
    const me = req.user._id;
    const { friendId } = req.params;

    // Verify they are friends
    const sp = await SocialProfile.findOne({ userId: me });
    if (!sp || !sp.friends.map((f) => f.toString()).includes(friendId)) {
      return res.status(403).json({ message: "Not friends" });
    }

    const messages = await Message.find({
      $or: [
        { sender: me, receiver: friendId },
        { sender: friendId, receiver: me },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(60);

    // Mark incoming messages as read
    await Message.updateMany(
      { sender: friendId, receiver: me, read: false },
      { read: true }
    );

    // Emit read receipt to sender
    req.io.to(friendId).emit("messages_read", { by: me.toString() });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// POST /api/profile/chat/:friendId — send a message
router.post("/chat/:friendId", protect, async (req, res) => {
  try {
    const me = req.user._id;
    const { friendId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }
    if (content.trim().length > 1000) {
      return res.status(400).json({ message: "Message too long" });
    }

    // Verify they are friends
    const sp = await SocialProfile.findOne({ userId: me });
    if (!sp || !sp.friends.map((f) => f.toString()).includes(friendId)) {
      return res.status(403).json({ message: "Not friends" });
    }

    const msg = await Message.create({
      sender: me,
      receiver: friendId,
      content: content.trim(),
    });

    // Emit to both sender and receiver rooms for real-time delivery
    req.io.to(friendId).emit("new_message", msg);
    req.io.to(me.toString()).emit("new_message", msg);

    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

export default router;
