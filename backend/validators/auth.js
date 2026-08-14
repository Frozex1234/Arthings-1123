/**
 * Validation schemas for authentication endpoints.
 */

const { z } = require('zod');
const { email, password, optionalText, requiredText } = require('./common');

const consent = z.object({
    type: z.string().max(50),
    version: z.string().max(20)
});

const register = z.object({
    email,
    password,
    name: optionalText(255),
    phone: optionalText(50),
    city: optionalText(100),
    consents: z.array(consent).max(10).optional()
});

const login = z.object({
    email,
    // Deliberately not the strict `password` schema: rejecting a short
    // password at validation time would tell an attacker the policy and
    // return a different shape than a normal failed login.
    password: z.string().min(1, 'Password is required').max(200)
});

const verifyEmail = z.object({
    email,
    code: z
        .string({ required_error: 'Verification code is required' })
        .trim()
        .regex(/^\d{4,10}$/, 'Enter the numeric code from your email')
});

const resend = z.object({ email });

const forgotPassword = z.object({ email });

const resetPassword = z.object({
    token: z.string().min(10, 'Invalid or expired link').max(300),
    password
});

const changePassword = z.object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: password
});

const updateProfile = z.object({
    name: requiredText(1, 255, 'Name').optional(),
    phone: optionalText(50),
    city: optionalText(100)
});

module.exports = {
    register,
    login,
    verifyEmail,
    resend,
    forgotPassword,
    resetPassword,
    changePassword,
    updateProfile
};
