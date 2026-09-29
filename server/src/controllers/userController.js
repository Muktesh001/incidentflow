const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
const { logger } = require("../config/logger");
const { getRequestId } = require("../middleware/requestId");
const {
  createUser,
  setPassword,
  verifyPassword,
  isValidUserId,
  isValidRole,
  VALID_ROLES
} = require("../models/user");
const { signToken, AUTH_REQUIRED } = require("../middleware/auth");
const {
  createValidationError,
  createNotFoundError,
  createUnauthorizedError,
  createConflictError
} = require("../utils/errors");

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

async function registerHandler(req, res) {
  const requestId = getRequestId() || req.requestId;
  const { email, password, name, role } = req.body || {};

  if (!email || !validateEmail(email)) {
    throw createValidationError("Valid email is required", { field: "email", value: email });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    throw createValidationError("Password must be at least 6 characters", { field: "password" });
  }
  if (role !== undefined && !isValidRole(role)) {
    throw createValidationError("Invalid role", {
      field: "role",
      value: role,
      allowedValues: VALID_ROLES
    });
  }

  const db = getDatabase();
  const existing = await db
    .collection("users")
    .findOne({ email: String(email).toLowerCase().trim() });
  if (existing) {
    throw createConflictError("User with this email already exists", {
      field: "email",
      value: String(email).toLowerCase()
    });
  }

  const user = setPassword(
    createUser({
      email,
      name: name || undefined,
      role: role || undefined
    }),
    password
  );

  const count = await db.collection("users").countDocuments();
  if (count === 0) {
    user.role = "admin";
    logger.info({ requestId, email: user.email }, "[auth] First user → granted admin role");
  }

  const result = await db.collection("users").insertOne(user);
  const persisted = { ...user, _id: result.insertedId };

  logger.info(
    { requestId, userId: String(result.insertedId), email: persisted.email, role: persisted.role },
    "[auth] User registered"
  );

  const token = signToken(persisted);

  return res.status(201).json({
    ok: true,
    requestId,
    token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    user: {
      id: String(persisted._id),
      email: persisted.email,
      name: persisted.name,
      role: persisted.role,
      createdAt: persisted.createdAt
    }
  });
}

async function loginHandler(req, res) {
  const requestId = getRequestId() || req.requestId;
  const { email, password } = req.body || {};

  if (!email || !validateEmail(email)) {
    throw createValidationError("Valid email is required", { field: "email", value: email });
  }
  if (!password || typeof password !== "string") {
    throw createValidationError("Password is required", { field: "password" });
  }

  const db = getDatabase();
  const user = await db
    .collection("users")
    .findOne({ email: String(email).toLowerCase().trim() });

  if (
    !user ||
    !user.passwordSalt ||
    !user.passwordHash ||
    !verifyPassword(password, user.passwordSalt, user.passwordHash)
  ) {
    logger.warn({ requestId, email: String(email).toLowerCase() }, "[auth] Failed login attempt");
    throw createUnauthorizedError("Invalid email or password");
  }

  logger.info(
    { requestId, userId: String(user._id), email: user.email, role: user.role },
    "[auth] User logged in"
  );

  const token = signToken(user);

  return res.status(200).json({
    ok: true,
    requestId,
    token,
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    }
  });
}

async function meHandler(req, res) {
  const requestId = getRequestId() || req.requestId;
  if (!req.user) {
    if (AUTH_REQUIRED) {
      throw createUnauthorizedError("Not authenticated");
    }
    return res.json({
      ok: true,
      requestId,
      authenticated: false,
      authRequired: AUTH_REQUIRED,
      user: null
    });
  }

  const db = getDatabase();
  if (!ObjectId.isValid(req.user.id)) {
    throw createValidationError("Invalid user ID");
  }
  const user = await db.collection("users").findOne({ _id: new ObjectId(req.user.id) });
  if (!user) {
    throw createNotFoundError("User not found");
  }
  return res.json({
    ok: true,
    requestId,
    authenticated: true,
    authRequired: AUTH_REQUIRED,
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    }
  });
}

async function listUsersHandler(req, res) {
  const db = getDatabase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const cursor = db
    .collection("users")
    .find({}, { projection: { passwordHash: 0, passwordSalt: 0 } })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
  const entries = await cursor.toArray();
  const total = await db.collection("users").countDocuments();
  return res.json({
    total,
    limit,
    offset,
    entries: entries.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    }))
  });
}

module.exports = {
  registerHandler,
  loginHandler,
  meHandler,
  listUsersHandler,
  createConflictError
};
