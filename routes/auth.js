import express from "express";
import admin from "firebase-admin";

const router = express.Router();

// Ensure Firebase Admin is initialized using the service account.
// This route can be called independently, so we import the initializer here.
import "../config/firebase.js";

// Helper to consistently shape auth responses
function buildUserResponse(email, role) {
  return {
    status: "success",
    user: {
      email,
      role,
    },
  };
}

// POST /api/auth/register
// Registers a new user in Firebase Authentication with default role "citizen".
async function handleRegister(req, res) {
  try {
    const { email, password } = req.body || {};
    console.log("AUTH /signup|/register body:", req.body);

    // Basic input validation for hackathon use.
    if (!email || !password) {
      return res
        .status(400)
        .json({ status: "error", message: "email and password are required" });
    }

    // Create user in Firebase Authentication using the Admin SDK.
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    const role = "citizen";

    // Optionally, we could store custom claims here, but for hackathon
    // we just return the role in the response.
    return res.status(201).json({
      status: "success",
      email: userRecord.email,
      role,
    });
  } catch (err) {
    const code = err?.code;
    if (code === "auth/configuration-not-found") {
      return res.status(500).json({
        status: "error",
        message:
          "Firebase Authentication is not enabled for this project (Identity Toolkit/Auth config missing). Enable Authentication in Firebase Console, then try again.",
      });
    }

    // Handle common errors like "email already exists" in a simple way.
    return res.status(400).json({
      status: "error",
      message: err.message || "Failed to register user",
    });
  }
}

router.post("/register", handleRegister);
// Alias to match frontend naming.
router.post("/signup", handleRegister);

// POST /api/auth/login
// Basic login check for hackathon: verifies that the user exists in Firebase.
// For production you would verify the password via Firebase client/REST APIs
// and issue tokens; here we keep it intentionally simple.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    console.log("AUTH /login body:", req.body);

    if (!email || !password) {
      return res
        .status(400)
        .json({ status: "error", message: "email and password are required" });
    }

    // Look up the user by email. This does not check password strength; for
    // hackathon purposes we just confirm the account exists in Firebase.
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (lookupErr) {
      // If user is not found, Firebase throws an error.
      if (lookupErr?.code === "auth/user-not-found") {
        // Hackathon-friendly: predefined admin user.
        // If admin hasn't been created in Firebase yet, create it now.
        if (email === "admin@gmail.com") {
          userRecord = await admin.auth().createUser({
            email,
            password,
          });
        } else {
          return res.status(404).json({
            status: "error",
            message: "User not found",
          });
        }
      } else {
        // Other lookup failures
        throw lookupErr;
      }
    }

    // Role logic decided entirely in the backend.
    const role = email === "admin@gmail.com" ? "admin" : "citizen";

    return res.json(buildUserResponse(userRecord.email, role));
  } catch (err) {
    if (err?.code === "auth/configuration-not-found") {
      return res.status(500).json({
        status: "error",
        message:
          "Firebase Authentication is not enabled for this project (Identity Toolkit/Auth config missing). Enable Authentication in Firebase Console, then try again.",
      });
    }

    return res.status(500).json({
      status: "error",
      message: err.message || "Failed to login",
    });
  }
});

export default router;

