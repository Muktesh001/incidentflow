const express = require("express");
const {
  n8nWebhookHandler,
  automationHistoryHandler
} = require("../controllers/webhookController");

const router = express.Router();

router.post("/n8n", n8nWebhookHandler);
router.get("/automation-history", automationHistoryHandler);

module.exports = router;
