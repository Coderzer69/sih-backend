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
exports.oauthLogin = exports.login = exports.register = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const prisma_1 = __importDefault(require("../utils/prisma"));
const qrGenerator_1 = require("../utils/qrGenerator");
const client_1 = require("@prisma/client");
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const buildAuthUser = (user) => (Object.assign({ id: user.id, name: user.name, email: user.email, role: user.role }, (user.doctorProfile && {
    specialization: user.doctorProfile.specialization || undefined,
    verificationStatus: user.doctorProfile.verificationStatus,
    documentsSubmitted: !!user.doctorProfile.verificationDocumentUrl,
})));
// ==================== REGISTER ====================
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, name, role, specialization, licenseNumber, } = req.body;
        if (!email || !password || !name || !role) {
            return res.status(400).json({
                error: 'Missing required fields',
            });
        }
        const existingUser = yield prisma_1.default.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            return res.status(400).json({
                error: 'User already exists',
            });
        }
        const passwordHash = yield bcrypt_1.default.hash(password, 10);
        const user = yield prisma_1.default.$transaction((prismaTx) => __awaiter(void 0, void 0, void 0, function* () {
            const newUser = yield prismaTx.user.create({
                data: {
                    email,
                    passwordHash,
                    name,
                    role,
                },
            });
            // Create Patient Profile
            if (role === client_1.Role.PATIENT) {
                let unique = false;
                let qrCode = '';
                while (!unique) {
                    qrCode = (0, qrGenerator_1.generatePatientQrCodeId)();
                    const existingQr = yield prismaTx.patientProfile.findUnique({
                        where: {
                            qrCodeIdentifier: qrCode,
                        },
                    });
                    if (!existingQr) {
                        unique = true;
                    }
                }
                yield prismaTx.patientProfile.create({
                    data: {
                        userId: newUser.id,
                        qrCodeIdentifier: qrCode,
                    },
                });
            }
            // Create Doctor Profile
            else if (role === client_1.Role.DOCTOR) {
                yield prismaTx.doctorProfile.create({
                    data: {
                        userId: newUser.id,
                        specialization,
                        licenseNumber,
                    },
                });
            }
            return prismaTx.user.findUnique({
                where: { id: newUser.id },
                include: { doctorProfile: true },
            });
        }));
        return res.status(201).json({
            message: 'User registered successfully',
            userId: user.id,
            user: buildAuthUser(user),
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({
            error: 'Internal server error',
        });
    }
});
exports.register = register;
// ==================== LOGIN ====================
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: 'Missing required fields',
            });
        }
        const user = yield prisma_1.default.user.findUnique({
            where: { email },
            include: { doctorProfile: true },
        });
        if (!user || !user.passwordHash) {
            return res.status(401).json({
                error: 'Invalid credentials',
            });
        }
        const isMatch = yield bcrypt_1.default.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({
                error: 'Invalid credentials',
            });
        }
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            role: user.role,
            email: user.email,
        }, process.env.JWT_SECRET, {
            expiresIn: '24h',
        });
        return res.json({
            token,
            user: buildAuthUser(user),
        });
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            error: 'Internal server error',
        });
    }
});
exports.login = login;
// ==================== GOOGLE OAUTH LOGIN ====================
const oauthLogin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { credential, role } = req.body;
        // 1. Check Google credential
        if (!credential) {
            return res.status(400).json({
                error: 'Google credential is required',
            });
        }
        // 2. Verify Google ID token
        const ticket = yield googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            return res.status(401).json({
                error: 'Invalid Google token',
            });
        }
        // 3. Get verified Google account information
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;
        // Make sure Google has verified the email
        if (!googleId || !email || payload.email_verified !== true) {
            return res.status(401).json({
                error: 'Invalid or unverified Google account',
            });
        }
        // 4. Find existing user
        let user = yield prisma_1.default.user.findFirst({
            where: {
                OR: [
                    { oauthId: googleId },
                    { email: email },
                ],
            },
            include: { doctorProfile: true },
        });
        if (user && role && user.role !== role) {
            return res.status(400).json({
                error: `An account with this email already exists as a ${user.role.toLowerCase()}. Please log in or use a different account.`
            });
        }
        // ==================== NEW GOOGLE USER ====================
        if (!user) {
            // New Google users must select a role
            if (!role) {
                return res.status(400).json({
                    error: 'Role is required for new OAuth registration',
                });
            }
            user = yield prisma_1.default.$transaction((prismaTx) => __awaiter(void 0, void 0, void 0, function* () {
                // Create user
                const newUser = yield prismaTx.user.create({
                    data: {
                        email,
                        name: name || 'Google User',
                        role,
                        oauthId: googleId,
                        oauthProvider: 'google',
                    },
                });
                // Create Patient Profile
                if (role === client_1.Role.PATIENT) {
                    let unique = false;
                    let qrCode = '';
                    while (!unique) {
                        qrCode = (0, qrGenerator_1.generatePatientQrCodeId)();
                        const existingQr = yield prismaTx.patientProfile.findUnique({
                            where: {
                                qrCodeIdentifier: qrCode,
                            },
                        });
                        if (!existingQr) {
                            unique = true;
                        }
                    }
                    yield prismaTx.patientProfile.create({
                        data: {
                            userId: newUser.id,
                            qrCodeIdentifier: qrCode,
                        },
                    });
                }
                // Create Doctor Profile
                else if (role === client_1.Role.DOCTOR) {
                    yield prismaTx.doctorProfile.create({
                        data: {
                            userId: newUser.id,
                        },
                    });
                }
                const userWithProfile = yield prismaTx.user.findUnique({
                    where: { id: newUser.id },
                    include: { doctorProfile: true },
                });
                return userWithProfile;
            }));
        }
        // ==================== USER MUST EXIST HERE ====================
        if (!user) {
            return res.status(500).json({
                error: 'User could not be created or found',
            });
        }
        // ==================== GENERATE JWT ====================
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            role: user.role,
            email: user.email,
        }, process.env.JWT_SECRET, {
            expiresIn: '24h',
        });
        // ==================== RESPONSE ====================
        return res.json({
            token,
            user: buildAuthUser(user),
        });
    }
    catch (error) {
        console.error('OAuth Login error:', error);
        return res.status(401).json({
            error: 'Google authentication failed',
        });
    }
});
exports.oauthLogin = oauthLogin;
