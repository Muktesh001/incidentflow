const express = require("express");

const {
  createIncidentHandler,
  getIncidentsHandler,
  getIncidentStatsHandler,
  getIncidentHandler,
  getIncidentHistoryHandler,
  updateIncidentHandler,
  deleteIncidentHandler
} = require("../controllers/incidentController");

const router = express.Router();

router.post("/", createIncidentHandler);
router.get("/", getIncidentsHandler);
router.get("/stats", getIncidentStatsHandler);
router.get("/:id/history", getIncidentHistoryHandler);
router.get("/:id", getIncidentHandler);
router.put("/:id", updateIncidentHandler);
router.delete("/:id", deleteIncidentHandler);

module.exports = router;