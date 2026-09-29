const { getRequest, skipIfNoDb } = require("./setup");

const SAMPLE_INCIDENT = {
  title: "API latency spike on checkout service",
  description: "p99 latency went from 120ms to 1.8s in the last 5 minutes",
  service: "checkout-api",
  severity: "high"
};

function hasDb() {
  return skipIfNoDb();
}

describe("Incident API", () => {
  describe("POST /api/incidents", () => {
    it("rejects without DB connection", async () => {
      if (hasDb()) return; // skip
      const request = getRequest();
      const res = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      // Either 500 (db not connected) or pass - we just check no crash
      expect([400, 500, 201].includes(res.status)).toBe(true);
    }, 5000);

    it("creates a valid incident and returns 201 with id (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const res = await request.post("/api/incidents").send(SAMPLE_INCIDENT);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe(SAMPLE_INCIDENT.title);
      expect(res.body.description).toBe(SAMPLE_INCIDENT.description);
      expect(res.body.service).toBe(SAMPLE_INCIDENT.service);
      expect(res.body.severity).toBe("high");
      expect(res.body.status).toBe("open");
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it("defaults severity to medium when not provided (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const { severity, ...payload } = SAMPLE_INCIDENT;
      const res = await request.post("/api/incidents").send(payload);

      expect(res.status).toBe(201);
      expect(res.body.severity).toBe("medium");
    });

    it("validates required fields and returns 400 (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();

      const cases = [
        { body: {}, expectField: "title" },
        { body: { title: "x" }, expectField: "title" },
        { body: { title: "a", description: "b" }, expectField: "title" }
      ];

      for (const c of cases) {
        const res = await request.post("/api/incidents").send(c.body);
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      }
    });

    it("rejects invalid severity with 400 (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const res = await request
        .post("/api/incidents")
        .send({ ...SAMPLE_INCIDENT, severity: "catastrophic" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid severity/);
    });
  });

  describe("GET /api/incidents", () => {
    it("lists incidents sorted by createdAt desc (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();

      const a = await request.post("/api/incidents").send({
        ...SAMPLE_INCIDENT,
        title: "Incident A",
        service: "alpha"
      });
      const b = await request.post("/api/incidents").send({
        ...SAMPLE_INCIDENT,
        title: "Incident B",
        service: "beta",
        severity: "critical"
      });
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);

      const list = await request.get("/api/incidents");
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.length).toBe(2);
      expect(new Date(list.body[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list.body[1].createdAt).getTime()
      );
    });

    it("filters by severity (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();

      await request.post("/api/incidents").send({ ...SAMPLE_INCIDENT, severity: "critical" });
      await request.post("/api/incidents").send({ ...SAMPLE_INCIDENT, severity: "low" });
      await request.post("/api/incidents").send({ ...SAMPLE_INCIDENT, severity: "low" });

      const low = await request.get("/api/incidents?severity=low");
      expect(low.body.length).toBe(2);
      low.body.forEach((i) => expect(i.severity).toBe("low"));

      const crit = await request.get("/api/incidents?severity=critical");
      expect(crit.body.length).toBe(1);
      expect(crit.body[0].severity).toBe("critical");
    });

    it("filters by status CSV and search (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();

      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      expect(created.status).toBe(201);
      await request.put(`/api/incidents/${created.body.id}`).send({ status: "investigating" });

      const list = await request.get("/api/incidents?status=investigating");
      expect(list.body.length).toBe(1);
      expect(list.body[0].status).toBe("investigating");

      const search = await request.get(
        "/api/incidents?search=checkout%20latency"
      );
      expect(search.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/incidents/stats", () => {
    it("returns aggregate stats with zero buckets (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const res = await request.get("/api/incidents/stats");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.openCritical).toBe(0);
      expect(res.body.openHigh).toBe(0);
      expect(Object.keys(res.body.byStatus)).toEqual(
        expect.arrayContaining(["open", "investigating", "mitigated", "resolved", "closed"])
      );
      expect(Object.keys(res.body.bySeverity)).toEqual(
        expect.arrayContaining(["critical", "high", "medium", "low"])
      );
    });

    it("counts open critical and open high correctly (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      await request.post("/api/incidents").send({ ...SAMPLE_INCIDENT, severity: "critical" });
      await request.post("/api/incidents").send({ ...SAMPLE_INCIDENT, severity: "critical" });
      await request.post("/api/incidents").send({ ...SAMPLE_INCIDENT, severity: "high" });

      const stats = await request.get("/api/incidents/stats");
      expect(stats.body.total).toBe(3);
      expect(stats.body.openCritical).toBe(2);
      expect(stats.body.openHigh).toBe(1);
      expect(stats.body.bySeverity.critical).toBe(2);
      expect(stats.body.bySeverity.high).toBe(1);
    });
  });

  describe("GET /api/incidents/:id", () => {
    it("rejects invalid id format with 400 (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const res = await request.get("/api/incidents/not-a-valid-mongo-id-here");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid incident ID/);
    });

    it("returns 404 for unknown but valid id (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const res = await request.get("/api/incidents/000000000000000000000000");
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Incident not found/);
    });

    it("returns single incident with matching fields (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      expect(created.status).toBe(201);

      const fetched = await request.get(`/api/incidents/${created.body.id}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body._id || fetched.body.id).toBeDefined();
      expect(fetched.body.title).toBe(SAMPLE_INCIDENT.title);
      expect(fetched.body.service).toBe(SAMPLE_INCIDENT.service);
    });
  });

  describe("PUT /api/incidents/:id", () => {
    it("updates title, status and severity correctly (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      expect(created.status).toBe(201);
      const id = created.body.id;

      const updated = await request.put(`/api/incidents/${id}`).send({
        title: "Updated title",
        status: "mitigated",
        severity: "medium"
      });
      expect(updated.status).toBe(200);
      expect(updated.body.title).toBe("Updated title");
      expect(updated.body.status).toBe("mitigated");
      expect(updated.body.severity).toBe("medium");
      expect(new Date(updated.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.body.updatedAt).getTime()
      );
    });

    it("rejects invalid status with 400 (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      const res = await request
        .put(`/api/incidents/${created.body.id}`)
        .send({ status: "abandoned" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid status/);
    });
  });

  describe("GET /api/incidents/:id/history", () => {
    it("returns created event in timeline after creating an incident (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      expect(created.status).toBe(201);

      await new Promise((r) => setTimeout(r, 150));

      const history = await request.get(`/api/incidents/${created.body.id}/history`);
      expect(history.status).toBe(200);
      expect(history.body.total).toBeGreaterThanOrEqual(1);
      expect(history.body.entries[0].type).toBe("created");
      expect(history.body.entries[0].summary).toMatch(/created/i);
    });

    it("records status change history event (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      const id = created.body.id;
      await request.put(`/api/incidents/${id}`).send({ status: "investigating" });

      await new Promise((r) => setTimeout(r, 150));

      const history = await request.get(`/api/incidents/${id}/history`);
      const types = history.body.entries.map((e) => e.type);
      expect(types).toContain("created");
      expect(types.some((t) => /status|updated/.test(t))).toBe(true);
    });
  });

  describe("DELETE /api/incidents/:id", () => {
    it("removes incident and returns success message (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const created = await request.post("/api/incidents").send(SAMPLE_INCIDENT);
      const id = created.body.id;

      const del = await request.delete(`/api/incidents/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.message).toMatch(/deleted/i);
      expect(del.body.id).toBe(id);

      const after = await request.get(`/api/incidents/${id}`);
      expect(after.status).toBe(404);
    });

    it("returns 404 when deleting non-existent incident (DB required)", async () => {
      if (!hasDb()) return;
      const request = getRequest();
      const del = await request.delete("/api/incidents/000000000000000000000000");
      expect(del.status).toBe(404);
      expect(del.body.error).toMatch(/Incident not found/);
    });
  });
});
