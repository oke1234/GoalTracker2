import express from "express";
import mongoose from "mongoose";
import { spawn, spawnSync } from "child_process";
import User from "./users.database.js";
import Group from "./group.database.js"; // ← add this line
import fs from "fs";
import { v4 as uuidv4 } from 'uuid';
import Chat from "./chats.database.js"; // make sure you have a Chat model


const app = express();
app.use(express.json());

mongoose.connect("mongodb://localhost:27017/ml_users");

// Preload groups from JSON file on server start
async function preloadGroups() {
  try {
    const data = fs.readFileSync("groups.json", "utf8");
    const groups = JSON.parse(data);

    console.log("📄 Groups read from JSON:", groups);

    // 🧹 Clear old data first
    await Group.deleteMany({});

    for (const g of groups) {
      await new Group(g).save();
    }

    console.log("✅ Groups preloaded from JSON");
  } catch (err) {
    console.error("❌ Error preloading groups:", err);
  }
}

preloadGroups();


// Preload users from JSON file on server start
async function preloadUsers() {
  try {
    const data = fs.readFileSync("users.json", "utf8");
    const users = JSON.parse(data);

    for (const u of users) {
      const exists = await User.findOne({ id: u.id });
      if (!exists) {
        await new User(u).save();
      }
    }

    console.log("✅ Users preloaded from JSON");
  } catch (err) {
    console.error("❌ Error preloading users:", err);
  }
}

preloadUsers();

// running algorithm
app.post("/algorithm", async (req, res) => {
  try {
    const { question } = req.body;
    const users = await User.find().lean();
    const groups = await Group.find().lean();

    console.log("🟢 Running user and group algorithms...");

    // helper to run a python script with payload and return parsed JSON
    function runPython(script, payload) {
      return new Promise((resolve, reject) => {
        const py = spawn("python", [script]);
        let out = "";
        let err = "";

        py.stdin.write(JSON.stringify(payload));
        py.stdin.end();

        py.stdout.on("data", d => { out += d.toString(); process.stdout.write(d.toString()); });
        py.stderr.on("data", d => { err += d.toString(); console.error("Python stderr:", d.toString()); });

        py.on("close", code => {
          if (err && !out) {
            return reject(new Error(err));
          }

          try {
            // 🧹 Clean the Python output to extract only the JSON part
            const jsonStart = out.indexOf("{");
            const jsonText = jsonStart !== -1 ? out.slice(jsonStart).trim() : out.trim();

            const parsed = JSON.parse(jsonText || "{}");
            resolve(parsed);
          } catch (e) {
            reject(new Error("Error parsing Python output: " + e.message + " -- raw: " + out));
          }
        });

      });
    }

    // Run both scripts in sequence (or parallel if you want)
    const usersPayload = users; // main_ml expects list of users in your earlier code
    const groupsPayload = { users, groups }; // group.py expects both

    const [userRes, groupRes] = await Promise.all([
      runPython("main_ml.py", usersPayload),
      runPython("group_ml.py", groupsPayload)
    ]);

    // Normalize helper: convert ordered lists to scored lists if no explicit scores
    function toScoredItems(list, kind) {
      // list may be strings (ids) or objects {id/ group, score}
      if (!Array.isArray(list)) return [];
      const hasScore = list.length && (typeof list[0] === "object") && ("score" in list[0] || "score" in list[0] );
      if (hasScore) {
        return list.map(it => {
          if (kind === "user") {
            const id = it.id ?? it.user ?? (typeof it === "string" ? it : undefined);
            return { type: "user", id, score: +it.score };
          } else {
            const id = it.group ?? it.id ?? (typeof it === "string" ? it : undefined);
            return { type: "group", id, score: +it.score };
          }
        });
      } else {
        // use position-based scoring: top -> 1.0, next -> decreasing by 1/(n)
        const n = list.length || 1;
        return list.map((it, idx) => {
          const rawId = (typeof it === "string") ? it : (it.id ?? it.group ?? it.user);
          const score = 1 - (idx / Math.max(1, n)); // 1.0, ~0.9, ...
          return { type: kind, id: rawId, score };
        });
      }
    }

    // Extract maps
    const userMap = userRes.best_to_worst || userRes.best_to_worst_users || userRes.bestToWorst || {};
    const groupMap = groupRes.best_to_worst_groups || groupRes.best_to_worst_groups || groupRes.best_to_worst || {};

    // Build combined per user
    const combined = {};
    const userIds = users.map(u => u.id);

    for (const uid of userIds) {
      const userListRaw = userMap[uid] || [];
      const groupListRaw = groupMap[uid] || [];

      // Convert to scored items
      const scoredUsers = userListRaw.map(u => ({
        type: "user",
        id: u.mac ?? u.id ?? u.user,
        score: +u.score ?? 0
      }));

      const scoredGroups = groupListRaw.map(g => ({
        type: "group",
        id: g.group ?? g.id,
        score: +g.score ?? 0
      }));

      // Merge
      const merged = [...scoredUsers, ...scoredGroups];

      if (!merged.length) {
        combined[uid] = [];
        continue;
      }

      // Min-max normalize scores 0-1 per user
      const scores = merged.map(m => m.score);
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const denom = (max - min) || 1;

      const normalized = merged.map(m => ({
        type: m.type,
        id: m.id,
        score: (m.score - min) / denom
      }));

      // Deduplicate by type+id (keep highest score)
      const dedupMap = {};
      for (const item of normalized) {
        const key = `${item.type}:${item.id}`;
        if (!dedupMap[key] || item.score > dedupMap[key].score) dedupMap[key] = item;
      }

      // Sort descending by score
      combined[uid] = Object.values(dedupMap).sort((a, b) => b.score - a.score);
    }


    // Respond with combined structure + raw python outputs (optional)
    res.json({
      combined_best_to_worst: combined,
      raw_user_algorithm: userRes,
      raw_group_algorithm: groupRes
    });

  } catch (err) {
    console.error("Error running algorithms:", err);
    res.status(500).send("Server error");
  }
});

//Update themselve when changes are make
app.post("/updateUser", async (req, res) => {
  try {
    const userData = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ id: userData.id });

    if (existingUser) {
      // Update existing user
      await User.updateOne({ id: userData.id }, userData);
    } else {
      // Create new user
      await new User(userData).save();
    }

    console.log("🔵 User saved/updated:", userData.id);
    res.json({ message: "User saved/updated" });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ message: "Error updating user" });
  }
});

// Get all users, return only their ids
app.get("/usersID", async (req, res) => {
  try {
    const users = await User.find({}, { id: 1, _id: 0 }); // only return id field
    console.log("🟢 All user IDs in DB:", users.map(u => u.id));
    res.json(users.map(u => u.id)); // send array of ids
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send("Server error");
  }
});

//Get all users
app.get("/users", async (req, res) => {
  try {
    const users = await User.find(); // return everything
    console.log("🟢 All users in DB:", users);
    res.json(users); // send full user data
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send("Server error");
  }
});

// Get all groups
app.get("/groups", async (req, res) => {
  try {
    const groups = await Group.find().lean(); // fetch all groups
    console.log("🟢 All groups in DB:", groups.map(g => g.id));
    console.log("📄 Groups read from JSON:", groups); // <-- add this
    res.json(groups);
  } catch (err) {
    console.error("❌ Error fetching groups:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// adding a user connection chat
app.post("/addChat", async (req, res) => {
  try {
    const { userId, addedUserId, groupId } = req.body;

    if (addedUserId) {
      console.log("🟢 AddChatUser request:", userId, "->", addedUserId);
      // Save user-to-user chat if needed
      res.json({ message: "User chat added", userId, addedUserId });

    } else if (groupId) {
      console.log("🟢 AddChatGroup request:", userId, "-> group:", groupId);

      // Update group members
      const group = await Group.findOne({ id: groupId });
      if (group && !group.members.includes(userId)) {
        group.members.push(userId);
        await group.save();
      }

      res.json({ message: "Group chat added", userId, groupId });
    } else {
      res.status(400).json({ error: "Missing addedUserId or groupId" });
    }

  } catch (err) {
    console.error("❌ Error in /addChat:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get('/chats', async (req, res) => {
  try {
    const allChats = await Chat.find({});
    console.log("📂 All chats:", allChats); // logs all chats
    res.json(allChats);
  } catch (err) {
    console.error("❌ Error fetching all chats:", err);
    res.status(500).json({ error: "Server error" });
  }
});


app.get('/chats/:pageName/messages', async (req, res) => {
  try {
    const { pageName } = req.params;
    const chat = await Chat.findOne({ pageName });
    res.json(chat ? chat.messages : []);
  } catch (err) {
    console.error("❌ Error getting messages:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST a new message
app.post("/chats/:pageName/messages", async (req, res) => {
  try {
    const { pageName } = req.params;
    const { sender, text } = req.body;

    if (!sender || !text)
      return res.status(400).json({ error: "sender and text are required" });

    const newMessage = { _id: uuidv4(), senderName: sender, text };

    // ✅ only save in database (no in-memory)
    await Chat.findOneAndUpdate(
      { pageName },
      { $push: { messages: newMessage } },
      { upsert: true, new: true }
    );

    res.json(newMessage);
  } catch (err) {
    console.error("❌ Error saving message:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

 