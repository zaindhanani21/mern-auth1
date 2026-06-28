import mongoose from "mongoose";

const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ sender: 1, receiver: 1 });
MessageSchema.index({ createdAt: -1 });

export default mongoose.model("Message", MessageSchema);
