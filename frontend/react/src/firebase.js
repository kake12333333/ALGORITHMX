import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// REPLACE WITH YOUR OWN CONFIG FROM FIREBASE CONSOLE IF NEEDED
const firebaseConfig = {
  apiKey: "AIzaSyD-REPLACE-WITH-ACTUAL-API-KEY",
  authDomain: "veripulse-93cbc.firebaseapp.com",
  projectId: "veripulse-93cbc",
  storageBucket: "veripulse-93cbc.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef1234567890"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
