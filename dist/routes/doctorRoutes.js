"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const doctorController_1 = require("../controllers/doctorController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const uploadMiddleware_1 = require("../middlewares/uploadMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate, (0, authMiddleware_1.requireRole)(['DOCTOR']));
router.get('/profile', doctorController_1.getProfile);
router.patch('/profile', doctorController_1.updateProfile);
router.patch('/password', doctorController_1.updatePassword);
router.get('/patients', doctorController_1.getPatients);
router.get('/treatments', doctorController_1.getTreatments);
router.get('/access-requests', doctorController_1.getAccessRequests);
router.get('/patient/:qrId', doctorController_1.scanPatientQr);
router.post('/access-requests', doctorController_1.requestHistoryAccess);
router.get('/patient/:id/history', doctorController_1.getPatientHistory);
router.post('/treatment/draft-from-audio', doctorController_1.draftFromAudio);
router.post('/treatment', doctorController_1.createTreatment);
router.patch('/treatment/:id', doctorController_1.editTreatment);
router.post('/verify', uploadMiddleware_1.upload.fields([
    { name: 'licenseDocument', maxCount: 1 },
    { name: 'qualificationDocument', maxCount: 1 }
]), doctorController_1.submitVerification);
exports.default = router;
