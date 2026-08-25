const express = require("express");

const {
  createIncidentHandler,
  getIncidentsHandler,
  getIncidentHandler,
  updateIncidentHandler,
  deleteIncidentHandler
} = require("../controllers/incidentController");

const router = express.Router();

router.post("/", createIncidentHandler);
router.get("/", getIncidentsHandler);
router.get("/:id", getIncidentHandler);
router.put("/:id", updateIncidentHandler);
router.delete("/:id", deleteIncidentHandler);

module.exports = router;