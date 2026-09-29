const { MongoClient } = require("mongodb");
const { logger } = require("./logger");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "incidentflow";

const client = new MongoClient(MONGO_URI);

let db;

async function connectDatabase() {
  try {
    await client.connect();

    db = client.db(DB_NAME);

    logger.info({ db: DB_NAME, uri: `${MONGO_URI.split("@").pop().split("?")[0]}` }, "MongoDB connected successfully");
  } catch (error) {
    logger.error({ err: error, message: error && error.message ? error.message : String(error) }, "MongoDB connection failed");
    throw error;
  }
}

function getDatabase() {
  if (!db) {
    throw new Error("Database is not connected");
  }

  return db;
}

module.exports = {
  connectDatabase,
  getDatabase
};