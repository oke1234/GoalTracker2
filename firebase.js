import fs from "fs";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBCVfUpTplRIqiLAcgHrc5VVA7LO6T_Bbc",
  authDomain: "messages1-fb178.firebaseapp.com",
  databaseURL: "https://messages1-fb178-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "messages1-fb178",
  storageBucket: "messages1-fb178.firebasestorage.app",
  messagingSenderId: "714454103672",
  appId: "1:714454103672:web:9aa14f39038c7671b01f8d",
  measurementId: "G-FQN9B0BTME"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
// Export db so server can use it
export { db };

async function preload(filePath, nodeName) {
  const data = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(data);

  for (const item of json) {
    await set(ref(db, `${nodeName}/${item.id}`), item);
  }
  console.log(`✅ ${nodeName} uploaded to Firebase`);
}

(async () => {
  await preload("users.json", "users");
  await preload("groups.json", "groups");
})();
