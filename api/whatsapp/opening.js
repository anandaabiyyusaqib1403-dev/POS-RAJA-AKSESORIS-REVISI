import { handleWhatsappNotificationRequest } from "../../backend/server/whatsappRequest.js";

export default async function handler(req, res) {
  return handleWhatsappNotificationRequest("opening", req, res);
}
