"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import AuthLayout from "@/components/AuthLayout";
import OrganizationSelect from "@/components/auth/OrganizationSelect";
import { supabase } from "@/lib/supabaseClient";
import {
  sendSignupOtp,
  verifyOtp,
  resendOtp,
  createUserProfile,
  OtpErrorMessages,
} from "@/lib/authService";

type Mode = "signin" | "signup";
type SignupStep = "email" | "otp" | "organization" | "profile";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP states for signup
  const [signupStep, setSignupStep] = useState<SignupStep>("email");
  const [otp, setOtp] = useState("");
  
  // Organization selection
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgName, setSelectedOrgName] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpExpired, setOtpExpired] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  /* =======================
     RESEND COOLDOWN TIMER
  ======================= */
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCooldown]);

  /* =======================
     SUBMIT HANDLER FOR SIGNIN & SIGNUP EMAIL
  ======================= */
  const handleSubmit = async () => {
    setError(null);

    if (!email) {
      setError("Email is required.");
      return;
    }

    setLoading(true);

    try {
      /* =======================
         SIGN IN
      ======================= */
      if (mode === "signin") {
        if (!password) {
          setError("Password is required.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        const user = data.user;
        if (!user) throw new Error("No user returned.");

        // 🔐 FETCH PROFILE
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          await supabase.auth.signOut();
          throw new Error("Profile not found. Please complete signup first.");
        }

        // ✅ Authenticated - redirect to dashboard
        router.push("/");
      }
      /* =======================
         SIGN UP - SEND OTP TO EMAIL
      ======================= */
      else {
        console.log("[Auth] Sending OTP to email...");

        const result = await sendSignupOtp(email);

        if (!result.success) {
          setError(result.error || "Failed to send OTP");
          setLoading(false);
          return;
        }

        console.log("[Auth] OTP sent successfully to", email);
        setSignupStep("otp");
        setOtpExpired(false);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Authentication failed";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /* =======================
     VERIFY OTP
  ======================= */
  const handleVerifyOtp = async () => {
    setError(null);
    setOtpLoading(true);

    try {
      const result = await verifyOtp(email, otp);

      if (!result.success) {
        const errorMessage = result.error
          ? OtpErrorMessages[result.error as keyof typeof OtpErrorMessages]
          : "Failed to verify code";

        // Set otpExpired for any error that suggests the token is invalid or expired
        if (
          result.error === "otp_expired" ||
          result.error === "invalid_grant" ||
          result.error === "otp_not_found" ||
          result.error === "invalid_otp" ||
          result.error === "VERIFY_FAILED" ||
          errorMessage.includes("expired") ||
          errorMessage.includes("invalid")
        ) {
          setOtpExpired(true);
        }

        setError(errorMessage);
        setOtpLoading(false);
        return;
      }

      // OTP verified successfully - move to organization selection step
      console.log("[Auth] OTP verified - moving to organization selection step");
      setSignupStep("organization");
      setOtp("");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Verification failed";
      setError(errorMsg);
    } finally {
      setOtpLoading(false);
    }
  };

  /* =======================
     CREATE PROFILE AFTER OTP - SUBMIT NAME & PASSWORD
  ======================= */
  const handleCreateProfileAfterOtp = async () => {
    setError(null);
    setLoading(true);

    // REQUIRED: User must have selected an organization
    if (!selectedOrgId) {
      setError("Please select or create an organization first");
      setLoading(false);
      return;
    }

    // Validate inputs
    if (!fullName.trim()) {
      setError("Full name is required");
      setLoading(false);
      return;
    }

    if (!password) {
      setError("Password is required");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (!confirmPassword) {
      setError("Please confirm your password");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    // Check password strength
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);

    if (!hasUpper || !hasLower || !hasNumber) {
      setError("Password must contain uppercase, lowercase, and numbers");
      setLoading(false);
      return;
    }

    try {
      console.log("[Auth] Setting password on existing OTP user...");

      // User already exists from OTP creation - just set the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: {
          full_name: fullName,
        },
      });

      if (updateError) {
        setError(updateError.message || "Failed to set password");
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Failed to get user information");
        setLoading(false);
        return;
      }

      console.log("[Auth] Password set successfully for user:", user.id);

      // Create profile via API endpoint (uses service role to bypass RLS)
      const profileResult = await createUserProfile("supervisor", selectedOrgId || undefined, {
        full_name: fullName,
        phone_number: phoneNumber || undefined,
      });

      if (!profileResult.success) {
        console.error("Profile creation error:", profileResult.error);
        // Sign out if profile creation fails
        await supabase.auth.signOut();
        setError(profileResult.message);
        setLoading(false);
        return;
      }

      console.log("[Auth] Profile created successfully");

      // Success - redirect to dashboard (org already selected during signup)
      router.push("/dashboard");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Account creation failed";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /* =======================
     RESEND OTP
  ======================= */
  const handleResendOtp = async () => {
    setError(null);
    setResendCooldown(60);

    try {
      const result = await resendOtp(email);

      if (!result.success) {
        const errorMessage = result.error
          ? OtpErrorMessages[result.error as keyof typeof OtpErrorMessages]
          : result.message;
        setError(errorMessage);
      } else {
        setOtp("");
        setOtpExpired(false);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to resend code";
      setError(errorMsg);
    }

    // Start cooldown timer
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /* =======================
     GO BACK TO OTP
  ======================= */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBackToOtp = () => {
    setSignupStep("otp");
    setFullName("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  };

  /* =======================
     GO BACK TO EMAIL
  ======================= */
  const handleBackToEmail = () => {
    setSignupStep("email");
    setOtp("");
    setOtpExpired(false);
    setError(null);
  };

  /* =======================
     HANDLE ORGANIZATION SELECTION
  ======================= */
  const handleOrganizationSelect = (orgId: string, orgName: string) => {
    setSelectedOrgId(orgId);
    setSelectedOrgName(orgName);
    setSignupStep("profile");
    setError(null);
  };

  /* =======================
     HANDLE BACK FROM ORGANIZATION
  ======================= */
  const handleBackFromOrganization = () => {
    setSignupStep("otp");
    setSelectedOrgId(null);
    setSelectedOrgName(null);
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-sm">
        {/* LOGO */}
        <div className="flex items-center gap-2 mb-8">
          <Image
            src="/images/logo.png"
            alt="Routemate"
            width={32}
            height={32}
          />
          <span className="text-lg font-semibold text-gray-900">
            Routemate+
          </span>
        </div>

        {/* SIGNIN OR SIGNUP EMAIL STEP */}
        {mode === "signin" || (mode === "signup" && signupStep === "email") ? (
          <>
            {/* TABS */}
            <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
              <button
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                  mode === "signin"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-700"
                }`}
                onClick={() => {
                  setMode("signin");
                  setSignupStep("email");
                  setError(null);
                  setPassword("");
                }}
              >
                Sign In
              </button>
              <button
                className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                  mode === "signup"
                    ? "bg-indigo-600 text-white"
                    : "text-gray-700"
                }`}
                onClick={() => {
                  setMode("signup");
                  setSignupStep("email");
                  setError(null);
                  setPassword("");
                }}
              >
                Sign Up
              </button>
            </div>

            {/* EMAIL */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Email
              </label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 text-sm text-black focus:ring-2 focus:ring-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* PASSWORD (SIGNIN ONLY) */}
            {mode === "signin" && (
              <div className="mb-4">
                <label className="text-sm font-medium mb-1 block text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            )}

            {/* NO PASSWORD FOR SIGNUP EMAIL STEP - WILL BE ADDED AFTER OTP */}
            {mode === "signup" && signupStep === "email" && (
              <p className="text-xs text-gray-600 text-center mb-4">
                We&apos;ll send you a verification code via email
              </p>
            )}

            {/* ERROR */}
            {error && (
              <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            {/* SUBMIT */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
            >
              {loading
                ? "Processing..."
                : mode === "signin"
                ? "Sign In"
                : mode === "signup" && signupStep === "email"
                ? "Send Verification Code"
                : "Sign Up"}
            </button>

            {/* FORGOT PASSWORD */}
            {mode === "signin" && (
              <p
                className="text-sm text-indigo-500 text-center mt-4 cursor-pointer hover:underline"
                onClick={() => router.push("/reset-password")}
              >
                Forgot Password?
              </p>
            )}
          </>
        ) : mode === "signup" && signupStep === "otp" ? (
          /* OTP VERIFICATION STEP */
          <>
            {/* BACK BUTTON */}
            <button
              onClick={handleBackToEmail}
              className="text-sm text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1"
            >
              ← Back to Email
            </button>

            {/* OTP TITLE */}
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Verify Your Email
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              We sent an 8-digit code to <strong>{email}</strong>
            </p>

            {/* OTP INPUT */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00000000"
                maxLength={8}
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 text-center tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                disabled={otpLoading || otpExpired}
              />
            </div>

            {/* ERROR */}
            {error && (
              <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            {/* VERIFY BUTTON */}
            {!otpExpired ? (
              <button
                onClick={handleVerifyOtp}
                disabled={otpLoading || otp.length < 6}
                className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
              >
                {otpLoading ? "Verifying..." : "Verify Code"}
              </button>
            ) : (
              <button
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend Code"}
              </button>
            )}

            {/* RESEND LINK */}
            {!otpExpired && (
              <p className="text-xs text-gray-600 text-center mt-4">
                Didn&apos;t receive the code?{" "}
                <button
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  className="text-indigo-600 hover:text-indigo-700 disabled:opacity-50 font-medium"
                >
                  Resend
                </button>
              </p>
            )}
          </>
        ) : mode === "signup" && signupStep === "organization" ? (
          /* ORGANIZATION SELECTION STEP */
          <OrganizationSelect
            onSelect={handleOrganizationSelect}
            onBack={handleBackFromOrganization}
            isLoading={loading}
          />
        ) : mode === "signup" && signupStep === "profile" ? (
          /* PROFILE CREATION AFTER OTP STEP */
          <>
            {/* BACK BUTTON */}
            <button
              onClick={() => {
                setSignupStep("organization");
                setSelectedOrgId(null);
                setSelectedOrgName(null);
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1"
            >
              ← Back to Organization
            </button>

            {/* TITLE */}
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Create Your Profile
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Email verified! Now set up your profile.
            </p>

            {/* ORGANIZATION INFO */}
            {selectedOrgName && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <span className="font-medium">Organization:</span> {selectedOrgName}
              </div>
            )}

            {/* FULL NAME */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Full Name
              </label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                placeholder="Enter your full name"
              />
            </div>

            {/* PHONE NUMBER */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Phone Number (Optional)
              </label>
              <input
                type="tel"
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            {/* PASSWORD */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Password
              </label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="Create a password"
              />
              <p className="text-xs text-gray-700 mt-1">
                Min 8 characters, mix of uppercase, lowercase, and numbers
              </p>
            </div>

            {/* CONFIRM PASSWORD */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Confirm Password
              </label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                placeholder="Confirm your password"
              />
            </div>

            {/* ERROR */}
            {error && (
              <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            {/* CREATE PROFILE BUTTON */}
            <button
              onClick={handleCreateProfileAfterOtp}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
            >
              {loading ? "Creating Profile..." : "Create Profile"}
            </button>
          </>
        ) : (
          <p className="text-sm text-red-500">Invalid state</p>
        )}
      </div>
    </AuthLayout>
  );
}
