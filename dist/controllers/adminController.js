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
exports.getAuditLogs = exports.getHistoryAccessRequests = exports.getTreatments = exports.getPatients = exports.getDashboardStats = exports.verifyDoctor = exports.getDoctors = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const getDoctors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const status = req.query.status;
        let whereClause = {};
        if (status) {
            whereClause.verificationStatus = status;
        }
        else {
            whereClause.verificationStatus = { not: client_1.DoctorVerificationStatus.INCOMPLETE };
        }
        const doctors = yield prisma_1.default.doctorProfile.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { name: true, email: true },
                },
            },
        });
        res.json(doctors);
    }
    catch (error) {
        console.error('Error fetching doctors:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getDoctors = getDoctors;
const verifyDoctor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const doctorProfileId = req.params.id;
        const { status } = req.body;
        if (!Object.values(client_1.DoctorVerificationStatus).includes(status)) {
            return res.status(400).json({ error: 'Invalid verification status' });
        }
        const actingAdmin = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            ? yield prisma_1.default.user.findUnique({
                where: { id: req.user.id },
                select: { id: true },
            })
            : null;
        const updateData = {
            verificationStatus: status,
        };
        if (actingAdmin === null || actingAdmin === void 0 ? void 0 : actingAdmin.id) {
            updateData.verifiedById = actingAdmin.id;
        }
        const doctor = yield prisma_1.default.doctorProfile.update({
            where: { id: doctorProfileId },
            data: updateData,
        });
        res.json({ message: `Doctor status updated to ${status}`, doctor });
    }
    catch (error) {
        console.error('Error verifying doctor:', error);
        require('fs').writeFileSync('backend-error.log', String(error) + '\n' + JSON.stringify(error, null, 2) + '\n' + error.stack);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});
exports.verifyDoctor = verifyDoctor;
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const totalDoctors = yield prisma_1.default.doctorProfile.count({
            where: { verificationStatus: { not: client_1.DoctorVerificationStatus.INCOMPLETE } }
        });
        const totalPatients = yield prisma_1.default.patientProfile.count();
        const totalTreatments = yield prisma_1.default.treatment.count();
        const pendingRequests = yield prisma_1.default.historyAccessRequest.count({
            where: { status: 'PENDING' }
        });
        res.json({
            totalDoctors,
            totalPatients,
            totalTreatments,
            pendingRequests,
        });
    }
    catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getDashboardStats = getDashboardStats;
const getPatients = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const patients = yield prisma_1.default.user.findMany({
            where: { role: 'PATIENT' },
            include: {
                patientProfile: true,
            },
        });
        res.json(patients);
    }
    catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getPatients = getPatients;
const getTreatments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const treatments = yield prisma_1.default.treatment.findMany({
            include: {
                doctor: { select: { name: true, email: true } },
                patient: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(treatments);
    }
    catch (error) {
        console.error('Error fetching treatments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getTreatments = getTreatments;
const getHistoryAccessRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requests = yield prisma_1.default.historyAccessRequest.findMany({
            include: {
                doctor: { select: { name: true, email: true } },
                patient: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    }
    catch (error) {
        console.error('Error fetching history access requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getHistoryAccessRequests = getHistoryAccessRequests;
const getAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const logs = yield prisma_1.default.auditLog.findMany({
            include: {
                user: { select: { name: true, email: true, role: true } },
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    }
    catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getAuditLogs = getAuditLogs;
