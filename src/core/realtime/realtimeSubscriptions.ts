export function subscribeRealtimeChannel({
  channelName,
  channel,
  recordEvent,
}: {
  channelName: string;
  channel: any;
  recordEvent: (event: Record<string, any>) => void;
}) {
  return channel.subscribe((status: string) => {
    if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      recordEvent({
        eventType: "realtime_disconnect",
        severity: status === "CHANNEL_ERROR" ? "critical" : "warning",
        source: "realtime",
        details: { channel: channelName, status },
      });
    }
  });
}
