import { buildOpeningShiftMessage, sendWA } from "./sendWA.js";

const shouldSend = process.argv.includes("--send");

const message = buildOpeningShiftMessage({
  shiftId: "manual-test",
  kasir: "Test Kasir",
  timestamp: new Date().toISOString(),
});

try {
  const result = await sendWA(message, {
    dryRun: !shouldSend,
    idempotencyKey: shouldSend ? `manual-test:${Date.now()}` : "",
    metadata: {
      type: "manual_test",
    },
  });

  console.log(
    shouldSend
      ? "Manual WhatsApp test sent through Fonnte."
      : "Dry run OK. Add --send to send a real WhatsApp message."
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Manual WhatsApp test failed:", error.message);
  process.exit(1);
}
