export type Message = {
  id: string;
  riderId: string | null;
  riderName: string;
  content: string;
  timestamp: string;
  status: "DRAFT" | "SENT";
  sourceNotificationId?: string | null;
};
