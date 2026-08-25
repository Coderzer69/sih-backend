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
exports.submitVerification = exports.editTreatment = exports.createTreatment = exports.draftFromAudio = exports.getPatientHistory = exports.requestHistoryAccess = exports.scanPatientQr = exports.getAccessRequests = exports.getTreatments = exports.getPatients = exports.updatePassword = exports.updateProfile = exports.getProfile = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const generative_ai_1 = require("@google/generative-ai");
// Helper to check if doctor is verified
const isDoctorVerified = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const profile = yield prisma_1.default.doctorProfile.findUnique({ where: { userId } });
    return (profile === null || profile === void 0 ? void 0 : profile.verificationStatus) === 'APPROVED';
});
const getProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const profile = yield prisma_1.default.doctorProfile.findUnique({
            where: { userId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        createdAt: true,
                    },
                },
            },
        });
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        res.json(profile);
    }
    catch (error) {
        console.error('Error fetching doctor profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getProfile = getProfile;
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { name, email, specialization, licenseNumber } = req.body;
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }
        const existingEmailUser = yield prisma_1.default.user.findFirst({
            where: {
                email,
                NOT: { id: userId },
            },
        });
        if (existingEmailUser) {
            return res.status(400).json({ error: 'Email is already in use' });
        }
        const normalizedLicenseNumber = typeof licenseNumber === 'string' ? licenseNumber.trim() : '';
        if (normalizedLicenseNumber) {
            const existingLicenseDoctor = yield prisma_1.default.doctorProfile.findFirst({
                where: {
                    licenseNumber: normalizedLicenseNumber,
                    NOT: { userId },
                },
            });
            if (existingLicenseDoctor) {
                return res.status(400).json({ error: 'License number is already in use' });
            }
        }
        const updatedProfile = yield prisma_1.default.$transaction((prismaTx) => __awaiter(void 0, void 0, void 0, function* () {
            yield prismaTx.user.update({
                where: { id: userId },
                data: {
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                },
            });
            return prismaTx.doctorProfile.update({
                where: { userId },
                data: {
                    specialization: typeof specialization === 'string' ? specialization.trim() || null : null,
                    licenseNumber: normalizedLicenseNumber || null,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            createdAt: true,
                        },
                    },
                },
            });
        }));
        res.json({ message: 'Profile updated successfully', profile: updatedProfile });
    }
    catch (error) {
        console.error('Error updating doctor profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.updateProfile = updateProfile;
const updatePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }
        const user = yield prisma_1.default.user.findUnique({
            where: { id: userId },
            select: { passwordHash: true },
        });
        if (!user || !user.passwordHash) {
            return res.status(400).json({ error: 'Password change is not available for this account' });
        }
        const isMatch = yield bcrypt_1.default.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        const newPasswordHash = yield bcrypt_1.default.hash(newPassword, 10);
        yield prisma_1.default.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash },
        });
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        console.error('Error updating doctor password:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.updatePassword = updatePassword;
const getPatients = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        // Get patients from treatments
        const treatments = yield prisma_1.default.treatment.findMany({
            where: { doctorId },
            include: {
                patient: { select: { id: true, name: true, email: true } },
            },
        });
        // Get patients from access requests (approved or pending)
        const accessRequests = yield prisma_1.default.historyAccessRequest.findMany({
            where: { doctorId },
            include: {
                patient: { select: { id: true, name: true, email: true } },
            },
        });
        const patientMap = new Map();
        treatments.forEach(t => {
            const patientId = t.patient.id;
            if (!patientMap.has(patientId)) {
                patientMap.set(patientId, Object.assign(Object.assign({}, t.patient), { treatmentsCount: 0, lastVisit: null }));
            }
            const p = patientMap.get(patientId);
            p.treatmentsCount += 1;
            if (!p.lastVisit || new Date(t.createdAt) > new Date(p.lastVisit)) {
                p.lastVisit = t.createdAt;
            }
        });
        accessRequests.forEach(ar => {
            const patientId = ar.patient.id;
            if (!patientMap.has(patientId)) {
                patientMap.set(patientId, Object.assign(Object.assign({}, ar.patient), { treatmentsCount: 0, lastVisit: null }));
            }
        });
        // Get the patient profile for each patient to include QR code identifier
        const patients = Array.from(patientMap.values());
        const patientsWithProfile = yield Promise.all(patients.map((p) => __awaiter(void 0, void 0, void 0, function* () {
            const profile = yield prisma_1.default.patientProfile.findUnique({ where: { userId: p.id } });
            return Object.assign(Object.assign({}, p), { qrCodeIdentifier: profile === null || profile === void 0 ? void 0 : profile.qrCodeIdentifier });
        })));
        res.json(patientsWithProfile);
    }
    catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getPatients = getPatients;
const getTreatments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const treatments = yield prisma_1.default.treatment.findMany({
            where: { doctorId },
            include: {
                patient: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                prescriptions: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(treatments);
    }
    catch (error) {
        console.error('Error fetching doctor treatments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getTreatments = getTreatments;
const getAccessRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const requests = yield prisma_1.default.historyAccessRequest.findMany({
            where: { doctorId },
            include: {
                patient: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const requestsWithProfile = yield Promise.all(requests.map((r) => __awaiter(void 0, void 0, void 0, function* () {
            const profile = yield prisma_1.default.patientProfile.findUnique({ where: { userId: r.patient.id } });
            return Object.assign(Object.assign({}, r), { patient: Object.assign(Object.assign({}, r.patient), { qrCodeIdentifier: profile === null || profile === void 0 ? void 0 : profile.qrCodeIdentifier }) });
        })));
        res.json(requestsWithProfile);
    }
    catch (error) {
        console.error('Error fetching access requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getAccessRequests = getAccessRequests;
const scanPatientQr = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const qrId = req.params.qrId;
        const patientProfile = yield prisma_1.default.patientProfile.findUnique({
            where: { qrCodeIdentifier: qrId },
            include: {
                user: { select: { id: true, name: true, email: true } },
            },
        });
        if (!patientProfile) {
            return res.status(404).json({ error: 'Patient not found for this QR code' });
        }
        res.json({
            id: patientProfile.user.id,
            patientId: patientProfile.user.id,
            name: patientProfile.user.name,
            email: patientProfile.user.email,
            qrId: patientProfile.qrCodeIdentifier,
            qrIdentifier: patientProfile.qrCodeIdentifier
        });
    }
    catch (error) {
        console.error('Error scanning QR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.scanPatientQr = scanPatientQr;
const requestHistoryAccess = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const { patientId } = req.body;
        if (!(yield isDoctorVerified(doctorId))) {
            return res.status(403).json({ error: 'Only verified doctors can request history access' });
        }
        // Check if an active request already exists
        const existing = yield prisma_1.default.historyAccessRequest.findFirst({
            where: {
                doctorId,
                patientId,
                status: 'APPROVED',
                expiresAt: { gt: new Date() },
            },
        });
        if (existing) {
            return res.status(400).json({ error: 'You already have active access to this patient\'s history' });
        }
        const request = yield prisma_1.default.historyAccessRequest.create({
            data: {
                doctorId,
                patientId,
            },
        });
        res.status(201).json({ message: 'Access request sent to patient', request });
    }
    catch (error) {
        console.error('Error requesting history access:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.requestHistoryAccess = requestHistoryAccess;
const getPatientHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const patientId = req.params.id;
        if (!(yield isDoctorVerified(doctorId))) {
            return res.status(403).json({ error: 'Only verified doctors can view history' });
        }
        const access = yield prisma_1.default.historyAccessRequest.findFirst({
            where: {
                doctorId,
                patientId,
                status: 'APPROVED',
                expiresAt: { gt: new Date() },
            },
        });
        if (!access) {
            return res.status(403).json({ error: 'You do not have active permission to view this patient\'s history' });
        }
        // Log the access
        yield prisma_1.default.auditLog.create({
            data: {
                userId: doctorId,
                action: 'VIEWED_PATIENT_HISTORY',
                details: { patientId },
            },
        });
        const treatments = yield prisma_1.default.treatment.findMany({
            where: { patientId, status: 'CONFIRMED' },
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
        console.error('Error fetching patient history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.getPatientHistory = getPatientHistory;
const draftFromAudio = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { text, currentState } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI API key is missing in environment variables' });
        }
        const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.6-flash",
            generationConfig: {
                responseMimeType: "application/json",
            }
        });
        const prompt = `
You are a medical assistant parsing transcribed voice notes from a doctor.
You will be given the CURRENT STATE of the structured data, as well as a NEW TRANSCRIBED TEXT.
Update the current state by merging the new information into it.
Do not remove existing information unless the new text explicitly contradicts or overrides it.
If a field is not mentioned in either the current state or new text, leave it as an empty string (or empty array for prescriptions).

CURRENT STATE:
${currentState ? JSON.stringify(currentState, null, 2) : '{}'}

NEW TRANSCRIBED TEXT:
"${text}"

JSON Schema:
{
  "condition": "The main medical condition or chief complaint",
  "symptoms": "Detailed symptoms mentioned",
  "diagnosis": "The doctor's diagnosis, if any",
  "doctorNotes": "Any other notes, observations, or advice",
  "prescriptions": [
    {
      "medicineName": "Name of the medicine",
      "strength": "Strength (e.g., 500mg)",
      "dosage": "Dosage (e.g., 1 tablet)",
      "frequency": "Frequency (e.g., twice a day)",
      "duration": "Duration (e.g., 5 days)",
      "route": "Route of administration (e.g., oral)",
      "instructions": "Specific instructions (e.g., after meals)"
    }
  ]
}
`;
        const result = yield model.generateContent(prompt);
        const content = result.response.text();
        if (!content) {
            throw new Error('No content returned from Gemini');
        }
        const draftData = JSON.parse(content);
        res.json({ message: 'Structured data drafted. Please review before confirming.', data: draftData });
    }
    catch (error) {
        console.error('Error drafting from audio text:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.draftFromAudio = draftFromAudio;
const createTreatment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const { patientId, condition, symptoms, diagnosis, doctorNotes, status, prescriptions } = req.body;
        if (status === 'CONFIRMED' && !(yield isDoctorVerified(doctorId))) {
            return res.status(403).json({ error: 'Only verified doctors can confirm treatments' });
        }
        const treatment = yield prisma_1.default.$transaction((prismaTx) => __awaiter(void 0, void 0, void 0, function* () {
            const newTreatment = yield prismaTx.treatment.create({
                data: {
                    doctorId,
                    patientId,
                    condition,
                    symptoms,
                    diagnosis,
                    doctorNotes,
                    status: status || 'DRAFT',
                    confirmedAt: status === 'CONFIRMED' ? new Date() : null,
                },
            });
            if (prescriptions && prescriptions.length > 0) {
                const presData = prescriptions.map((p) => ({
                    treatmentId: newTreatment.id,
                    medicineName: p.medicineName,
                    strength: p.strength,
                    dosage: p.dosage,
                    frequency: p.frequency,
                    duration: p.duration,
                    route: p.route,
                    instructions: p.instructions,
                }));
                yield prismaTx.prescription.createMany({ data: presData });
            }
            return yield prismaTx.treatment.findUnique({
                where: { id: newTreatment.id },
                include: { prescriptions: true },
            });
        }));
        res.status(201).json(treatment);
    }
    catch (error) {
        console.error('Error creating treatment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.createTreatment = createTreatment;
const editTreatment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const treatmentId = req.params.id;
        const { condition, symptoms, diagnosis, doctorNotes, status, prescriptions, amendmentReason } = req.body;
        const existingTreatment = yield prisma_1.default.treatment.findUnique({
            where: { id: treatmentId },
            include: { prescriptions: true },
        });
        if (!existingTreatment)
            return res.status(404).json({ error: 'Treatment not found' });
        if (existingTreatment.doctorId !== doctorId)
            return res.status(403).json({ error: 'Not authorized to edit this treatment' });
        if (existingTreatment.status === 'CONFIRMED') {
            if (!amendmentReason) {
                return res.status(400).json({ error: 'Amendment reason is required when editing a confirmed treatment' });
            }
            // Create an amendment record before updating
            yield prisma_1.default.treatmentAmendment.create({
                data: {
                    treatmentId,
                    doctorId,
                    reason: amendmentReason,
                    previousData: JSON.parse(JSON.stringify(existingTreatment)),
                    newData: { condition, symptoms, diagnosis, doctorNotes, prescriptions },
                },
            });
        }
        const updatedTreatment = yield prisma_1.default.$transaction((prismaTx) => __awaiter(void 0, void 0, void 0, function* () {
            // Update treatment details
            const updateData = { condition, symptoms, diagnosis, doctorNotes };
            if (status === 'CONFIRMED' && existingTreatment.status === 'DRAFT') {
                updateData.status = 'CONFIRMED';
                updateData.confirmedAt = new Date();
            }
            yield prismaTx.treatment.update({
                where: { id: treatmentId },
                data: updateData,
            });
            // Update prescriptions (for simplicity, we delete existing and recreate them)
            if (prescriptions) {
                yield prismaTx.prescription.deleteMany({ where: { treatmentId } });
                const presData = prescriptions.map((p) => ({
                    treatmentId,
                    medicineName: p.medicineName,
                    strength: p.strength,
                    dosage: p.dosage,
                    frequency: p.frequency,
                    duration: p.duration,
                    route: p.route,
                    instructions: p.instructions,
                }));
                yield prismaTx.prescription.createMany({ data: presData });
            }
            return yield prismaTx.treatment.findUnique({
                where: { id: treatmentId },
                include: { prescriptions: true, amendments: true },
            });
        }));
        res.json({ message: 'Treatment updated successfully', treatment: updatedTreatment });
    }
    catch (error) {
        console.error('Error editing treatment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.editTreatment = editTreatment;
const submitVerification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const doctorId = req.user.id;
        const { licenseNumber, specialization, qualification, registrationYear, issuingAuthority } = req.body;
        const files = req.files;
        const licenseDoc = files['licenseDocument'] ? files['licenseDocument'][0].filename : null;
        const qualDoc = files['qualificationDocument'] ? files['qualificationDocument'][0].filename : null;
        if (!licenseNumber || !licenseDoc) {
            return res.status(400).json({ error: 'License number and license document are required' });
        }
        const updatedProfile = yield prisma_1.default.doctorProfile.update({
            where: { userId: doctorId },
            data: Object.assign(Object.assign({ licenseNumber,
                specialization, verificationStatus: 'PENDING' }, (licenseDoc && { verificationDocumentUrl: licenseDoc })), (qualDoc && { qualificationDocumentUrl: qualDoc })),
        });
        res.json({ message: 'Verification documents submitted successfully', profile: updatedProfile });
    }
    catch (error) {
        console.error('Error submitting verification:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.submitVerification = submitVerification;
