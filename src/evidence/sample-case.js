export const isSampleCase = (item) => /SAMPLE ONLY|synthetic|fictional/i.test(item.title) ||
  (item.title === "ClaimTrace investigation — Johannesburg motor collision" &&
   Date.parse(item.incident_at) === Date.parse("2026-08-18T12:31:50Z"));
