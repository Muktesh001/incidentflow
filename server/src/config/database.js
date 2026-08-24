const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME || "incidentflow";

const client = new MongoClient(MONGO_URI);

let db;

async function connectDatabase() {
  try {
    await client.connect();

    db = client.db(DB_NAME);

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
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