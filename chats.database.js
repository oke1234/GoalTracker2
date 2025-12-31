import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  pageName: { type: String, required: true, unique: true },
  messages: [
    {
      _id: String,
      senderName: String,
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  allowedUsers: [{ type: String }],
  addedBy: { type: String },      // who created/added the chat
  addedUserId: { type: String },  // store the person that got added
});

export default mongoose.model("Chat", chatSchema);
