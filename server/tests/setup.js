const supertest = require("supertest");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", "..", ".env")
});

const { createApp } = require("../src/index");
const { connectDatabase, getDatabase } = require("../src/config/database");
const { ensureIndexes } = require("../src/services/incidentHistoryService");

const TEST_COLLECTIONS = ["incidents", "incident_history", "users"];

let app;
let request;
let mongoClientDirect;

beforeAll(async () => {
  try {
    await connectDatabase();
    ensureIndexes();
  } catch (err) {
    console.warn(
      "[test-setup] MongoDB connection failed. " +
        "Tests that require DB will be skipped. " +
        "Make sure MongoDB is running (e.g. `docker-compose up -d mongodb`).\n" +
        "Error: " + (err && err.message ? err.message : String(err))
    );
  }

  app = await createApp();
  request = supertest(app);

  try {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
    mongoClientDirect = new MongoClient(MONGO_URI);
    await mongoClientDirect.connect();
  } catch (_err) {
    mongoClientDirect = null;
  }

  global.__TEST__ = {
    getRequest: () => request,
    getApp: () => app,
    getDb: () => {
      try {
        return getDatabase();
      } catch (_e) {
        return null;
      }
    },
    hasDb: () => {
      try {
        return !!getDatabase();
      } catch (_e) {
        return false;
      }
    },
    skipIfNoDb: () => {
      let ok = false;
      try {
        ok = !!getDatabase();
      } catch (_e) {
        ok = false;
      }
      if (!ok) {
        console.warn("[test-setup] Skipping DB tests: MongoDB not connected");
      }
      return ok;
    },
    ObjectId
  };
});

beforeEach(async () => {
  let db = null;
  try {
    db = getDatabase();
  } catch (_e) {
    return;
  }
  if (!db) return;

  for (const name of TEST_COLLECTIONS) {
    try {
      await db.collection(name).deleteMany({});
    } catch (_e) {
      /* ignore */
    }
  }
});

afterAll(async () => {
  if (mongoClientDirect) {
    try {
      await mongoClientDirect.close();
    } catch (_e) {
      /* ignore */
    }
  }
});

module.exports = {
  getRequest: () => request,
  getApp: () => app,
  hasDb: global.__TEST__ ? global.__TEST__.hasDb : () => false,
  skipIfNoDb: global.__TEST__ ? global.__TEST__.skipIfNoDb : () => false,
  ObjectId
};
