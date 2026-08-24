const express = require("express");

const app = express();

const PORT = process.env.PORT || 5000;

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "incidentflow-api"
  });
});

app.listen(PORT, () => {
  console.log(`IncidentFlow API running on port ${PORT}`);
});