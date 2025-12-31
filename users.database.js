import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: String,
  Country: String,
  time_zone: String,
  bio: String,
  groupsEntered: { type: [String], default: [] },
  status: String,
  pic: String,
  type: { type: String, default: "person" }, // ✅ add this
  tasks: { type: Array, default: [] },
  goals: { type: Array, default: [] },
  streak_days: Number,
  days_active_per_week: Number,
  date: { type: Date, default: Date.now },

  activeConnections: {
    type: [
      {
        id: { type: String },
        type: { type: String },
        page: { type: String } // ✅ added in here
      }
    ],
    default: []
  },

});

export default mongoose.model("User", userSchema);
