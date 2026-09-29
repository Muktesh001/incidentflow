const { getRequest } = require("./setup");

describe("GET /health", () => {
  it("returns 200 with status ok and service name", async () => {
    const request = getRequest();
    const res = await request.get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("incidentflow-api");
  });

  it("includes ISO timestamp and request ID", async () => {
    const request = getRequest();
    const res = await request.get("/health");

    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    expect(res.header["x-request-id"]).toBeDefined();
    expect(res.header["x-request-id"]).toBe(res.body.requestId);
  });

  it("reports auth section with required=false and no auth in test env", async () => {
    const request = getRequest();
    const res = await request.get("/health");

    expect(res.body.auth).toBeDefined();
    expect(typeof res.body.auth.required).toBe("boolean");
    expect(res.body.auth.authenticated).toBe(false);
    expect(res.body.auth.user).toBeNull();
  });

  it("reports integrations statuses", async () => {
    const request = getRequest();
    const res = await request.get("/health");

    expect(res.body.integrations).toBeDefined();
    for (const k of ["n8nWebhook", "n8nApiKey", "gemini", "jwt"]) {
      expect(res.body.integrations[k]).toEqual(
        expect.stringMatching(/^configured$|^not_configured$/)
      );
    }
  });
});

describe("404 Not Found handler", () => {
  it("returns 404 JSON for unknown route", async () => {
    const request = getRequest();
    const res = await request.get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBeDefined();
  });
});
