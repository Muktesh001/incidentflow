const express = require("express");
const {
  registerHandler,
  loginHandler,
  meHandler,
  listUsersHandler
} = require("../controllers/userController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.post("/register", registerHandler);
router.post("/login", loginHandler);
router.get("/me", meHandler);
router.get("/", requireRole("admin"), listUsersHandler);

module.exports = router;
