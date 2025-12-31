import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  bio: { type: String, default: "" }, // ✅ add this
  type: { type: String, default: "group" }, // optional
  members: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Group", groupSchema);