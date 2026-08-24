const express = require("express");
const { connectDatabase } = require("./config/database");

const app = express();

const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "incidentflow-api"
  });
});

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`IncidentFlow API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed");
    process.exit(1);
  }
}

startServer();