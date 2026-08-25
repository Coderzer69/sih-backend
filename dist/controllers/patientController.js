"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAccessRequest = exports.getAccessRequests = exports.getTreatments = exports.getProfile = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const getProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const profile = yield prisma_1.default.patientProfile.findUnique({
            where: { userId },
            include: {
                user: { select: { name: true, email: true } },
            },
        });
        if (!profile)
            return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
    }
    catch (error) {
        console.error('Error fetching patient profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getProfile = getProfile;
const getTreatments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        // Patients can only view CONFIRMED treatments
        const treatments = yield prisma_1.default.treatment.findMany({
            where: { patientId: userId, status: 'CONFIRMED' },
            include: {
                doctor: { select: { name: true } },
                prescriptions: true,
                amendments: true,
            },
            orderBy: { confirmedAt: 'desc' },
        });
        res.json(treatments);
    }
    catch (error) {
        console.error('Error fetching patient treatments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getTreatments = getTreatments;
const getAccessRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const requests = yield prisma_1.default.historyAccessRequest.findMany({
            where: { patientId: userId },
            include: {
                doctor: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    }
    catch (error) {
        console.error('Error fetching access requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getAccessRequests = getAccessRequests;
const updateAccessRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requestId = req.params.id;
        const userId = req.user.id;
        const { status } = req.body;
        if (!['APPROVED', 'DENIED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be APPROVED or DENIED.' });
        }
        const request = yield prisma_1.default.historyAccessRequest.findFirst({
            where: { id: requestId, patientId: userId },
        });
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        if (request.status !== 'PENDING') {
            return res.status(400).json({ error: 'Can only update PENDING requests' });
        }
        let expiresAt = null;
        if (status === 'APPROVED') {
            // Grant access for 24 hours
            expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
        }
        const updatedRequest = yield prisma_1.default.historyAccessRequest.update({
            where: { id: requestId },
            data: { status: status, expiresAt },
        });
        res.json({ message: `Access request ${status}`, request: updatedRequest });
    }
    catch (error) {
        console.error('Error updating access request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.updateAccessRequest = updateAccessRequest;
