Deno.serve(async (req) => {
  // Twilio integration has been completely removed.
  // We now use Evolution API for all WhatsApp communication.
  return new Response("Twilio integration removed. Use Evolution API endpoint.", { status: 410 });
});
