import { Router } from "express";
import { employeesHandler } from "../server/employeesApi.js";

const router = Router();

router.all("/", employeesHandler);

export default router;
