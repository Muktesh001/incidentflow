const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getDatabase } = require("../config/database");
const { logger } = require("../config/logger");
const { getRequestId } = require("./requestId");
const { createUnauthorizedError, createForbiddenError } = require("../utils/errors");

const JWT_SECRET = process.env.JWT_SECRET || "";
const AUTH_REQUIRED = String(process.env.AUTH_REQUIRED || "false").toLowerCase() === "true";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(user) {
  if (!JWT_SECRET || JWT_SECRET.trim().length === 0) {
    throw new Error("JWT_SECRET is not configured");
  }
  const payload = {
    sub: String(user._id || user.id),
    email: user.email,
    role: user.role || "user",
    name: user.name || undefined
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function extractToken(req) {
  const auth = req.headers && req.headers.authorization;
  if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return null;
}

async function resolveUserFromToken(token) {
  if (!JWT_SECRET || JWT_SECRET.trim().length === 0) {
    return null;
  }
  const decoded = jwt.verify(token, JWT_SECRET);
  const userId = decoded && decoded.sub ? String(decoded.sub) : null;
  if (!userId || !ObjectId.isValid(userId)) return null;
  const db = getDatabase();
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  return user ? { ...user, _id: user._id } : null;
}

async function authMiddleware(req, res, next) {
  const requestId = getRequestId() || req.requestId;
  const token = extractToken(req);

  if (!token) {
    if (AUTH_REQUIRED) {
      throw createUnauthorizedError("Missing bearer token (AUTH_REQUIRED=true)");
    }
    req.user = null;
    return next();
  }

  try {
    const user = await resolveUserFromToken(token);
    if (!user) {
      if (AUTH_REQUIRED) throw createUnauthorizedError("Invalid or expired token");
      req.user = null;
      return next();
    }
    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name || undefined,
      role: user.role || "user"
    };
    logger.debug(
      { requestId, userId: req.user.id, role: req.user.role },
      "[auth] Authenticated request"
    );
    return next();
  } catch (err) {
    if (AUTH_REQUIRED) {
      throw createUnauthorizedError(
        err && err.message ? String(err.message) : "Token verification failed"
      );
    }
    req.user = null;
    return next();
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (AUTH_REQUIRED && !req.user) {
      throw createUnauthorizedError("Authentication required");
    }
    if (roles.length > 0 && req.user && !roles.includes(req.user.role)) {
      throw createForbiddenError(
        `Role ${req.user.role} is not permitted (required: ${roles.join(", ")})`
      );
    }
    next();
  };
}

module.exports = {
  signToken,
  authMiddleware,
  requireRole,
  extractToken,
  AUTH_REQUIRED,
  JWT_EXPIRES_IN
};
