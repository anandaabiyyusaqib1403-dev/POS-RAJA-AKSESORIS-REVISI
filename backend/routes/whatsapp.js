import { Router } from "express";
import { handleWhatsappNotificationRequest } from "../server/whatsappRequest.js";

const router = Router();

router.post("/opening", (req, res) => handleWhatsappNotificationRequest("opening", req, res));
router.post("/closing", (req, res) => handleWhatsappNotificationRequest("closing", req, res));

export default router;
