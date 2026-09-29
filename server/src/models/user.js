const { ObjectId } = require("mongodb");
const { randomBytes, createHash } = require("crypto");

const VALID_ROLES = ["admin", "user", "viewer"];

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + "|" + password).digest("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = createHash("sha256")
    .update(salt + "|" + password)
    .digest("hex");
  return actual === expectedHash;
}

function createUser(data) {
  const now = new Date();
  return {
    email: String(data.email).toLowerCase().trim(),
    name: data.name ? String(data.name).trim() : String(data.email).split("@")[0],
    passwordSalt: null,
    passwordHash: null,
    role: VALID_ROLES.includes(String(data.role || "user").toLowerCase())
      ? String(data.role || "user").toLowerCase()
      : "user",
    createdAt: now,
    updatedAt: now
  };
}

function setPassword(user, password) {
  const { salt, hash } = hashPassword(String(password));
  user.passwordSalt = salt;
  user.passwordHash = hash;
  user.updatedAt = new Date();
  return user;
}

function isValidUserId(id) {
  return ObjectId.isValid(id);
}

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

module.exports = {
  VALID_ROLES,
  createUser,
  setPassword,
  hashPassword,
  verifyPassword,
  isValidUserId,
  isValidRole
};
