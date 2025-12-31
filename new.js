useEffect(() => {
  if (!mlUser?.id) return;

  const interval = setInterval(async () => {
    try {
      // 1. Fetch all chats from your backend
      const res = await fetch("http://192.168.1.32:5000/chats"); // your endpoint that returns all chats
      const chats = await res.json();

      // 2. Filter chats where current user is in allowedUsers
      const myChats = chats.filter(chat =>
        chat.allowedUsers?.includes(mlUser.id)
      );

      // 3. Map them into items with status "active"
      const newItems = myChats.map(chat => ({
        id: chat.pageName, // or chat._id
        name: chat.pageName, // or any display name
        type: "person", // adjust if needed
        page: chat.pageName,
        status: "active",
      }));

      // 4. Add new items without duplicates
      setItems(prev => {
        const existingPages = new Set(prev.map(i => i.page));
        const toAdd = newItems.filter(i => !existingPages.has(i.page));
        return [...prev, ...toAdd];
      });

    } catch (err) {
      console.error("❌ Error checking allowedUsers:", err);
    }
  }, 10000); // every 10 seconds

  return () => clearInterval(interval); // cleanup on unmount
}, [mlUser?.id]);

// 🔄 Check every 10 seconds if current user is allowed in any chats
useEffect(() => {
  if (!mlUser?.id) return;

  const interval = setInterval(async () => {
    try {
      // 1️⃣ Fetch all chats from backend
      const res = await fetch("http://192.168.1.32:5000/chats"); 
      const chats = await res.json();

      // 2️⃣ Filter chats where current user is in allowedUsers
      const myChats = chats.filter(chat =>
        chat.allowedUsers?.includes(mlUser.id)
      );

      // 3️⃣ Update existing items or add new ones
      setItems(prev => {
        const updated = [...prev];

        myChats.forEach(chat => {
          const existingIndex = updated.findIndex(i => i.page === chat.pageName);
          if (existingIndex !== -1) {
            // ✅ Update status if item already exists
            updated[existingIndex].status = "active";
          } else {
            // ➕ Add new item
            updated.push({
              id: chat.pageName,
              name: chat.pageName,
              type: "person",
              page: chat.pageName,
              status: "active",
            });
          }
        });

        return updated;
      });

    } catch (err) {
      console.error("❌ Error checking allowedUsers:", err);
    }
  }, 10000); // every 10 seconds

  return () => clearInterval(interval); // cleanup on unmount
}, [mlUser?.id]);



app.post("/addChat", async (req, res) => {
  try {
    const { userId, addedUserId, groupId } = req.body;

    if (addedUserId) {
      console.log("🟢 AddChatUser request:", userId, "->", addedUserId);

      let chat = await Chat.findOne({ pageName: `${userId}_${addedUserId}` });

      if (!chat) {
        chat = new Chat({
          pageName: `${userId}_${addedUserId}`,
          messages: [],
          allowedUsers: [userId, addedUserId],
        });
        await chat.save();
      } else {
        // Ensure both users are in allowedUsers
        const updatedUsers = new Set([...chat.allowedUsers.map(String), userId, addedUserId]);
        chat.allowedUsers = Array.from(updatedUsers);
        await chat.save();
      }

      res.json({ message: "User chat added", chat });

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
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

// Add allowed id's for the user - user chats (leave the groups alone), so the App.js can check it regurally and if there is one -> add it to items

export default mongoose.model("Chat", chatSchema);
