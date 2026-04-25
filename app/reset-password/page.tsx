"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { supabase } from "@/lib/supabaseClient";
import {
  sendPasswordResetOtp,
  verifyOtp,
  resendOtp,
  OtpErrorMessages,
} from "@/lib/authService";

type Step = "email" | "otp" | "reset";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpExpired, setOtpExpired] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  /* =======================
     SEND OTP
  ======================= */
  const handleSendOtp = async () => {
    setError(null);

    if (!email) {
      setError("Email is required");
      return;
    }

    setLoading(true);

    try {
      const result = await sendPasswordResetOtp(email);

      if (!result.success) {
        const errorMessage = result.error
          ? OtpErrorMessages[result.error as keyof typeof OtpErrorMessages]
          : result.message;
        setError(errorMessage);
      } else {
        setStep("otp");
        setOtp("");
        setOtpExpired(false);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to send code";
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

    if (!otp || otp.length < 6) {
      setError("Please enter a valid verification code");
      return;
    }

    setLoading(true);

    try {
      const result = await verifyOtp(email, otp);

      if (!result.success) {
        const errorMessage = result.error
          ? OtpErrorMessages[result.error as keyof typeof OtpErrorMessages]
          : "Failed to verify code";

        if (result.error === "otp_expired") {
          setOtpExpired(true);
        }

        setError(errorMessage);
      } else {
        // OTP verified - move to password reset step
        setStep("reset");
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Verification failed";
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
     SET NEW PASSWORD
  ======================= */
  const handleResetPassword = async () => {
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError("Both password fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      // Get the current session from OTP verification
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !data.session) {
        setError("Session expired. Please verify again.");
        setStep("email");
        setLoading(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      // Success - redirect to login
      await supabase.auth.signOut();
      router.push("/login?reset=success");
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to reset password";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /* =======================
     GO BACK
  ======================= */
  const handleBack = () => {
    if (step === "otp") {
      setStep("email");
      setOtp("");
      setOtpExpired(false);
    } else {
      router.push("/login");
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-black mb-2">Reset Password</h1>
        <p className="text-sm text-gray-600 mb-6">
          {step === "email"
            ? "Enter your email to receive a verification code"
            : step === "otp"
            ? "Enter the code sent to your email"
            : "Create your new password"}
        </p>

        {/* STEP 1: EMAIL */}
        {step === "email" && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 text-sm text-black focus:ring-2 focus:ring-indigo-500"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
            >
              {loading ? "Sending..." : "Send Verification Code"}
            </button>

            <button
              onClick={() => router.push("/login")}
              className="w-full text-indigo-600 py-2 rounded-md font-medium hover:text-indigo-700 mt-3"
            >
              Back to Login
            </button>
          </>
        )}

        {/* STEP 2: OTP */}
        {step === "otp" && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00000000"
                maxLength={8}
                className="w-full border rounded-md px-3 py-2 text-sm text-black focus:ring-2 focus:ring-indigo-500 text-center tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                disabled={loading || otpExpired}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            {!otpExpired ? (
              <button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
              >
                {loading ? "Verifying..." : "Verify Code"}
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

            {!otpExpired && (
              <p className="text-xs text-gray-600 text-center mt-3">
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

            <button
              onClick={handleBack}
              className="w-full text-indigo-600 py-2 rounded-md font-medium hover:text-indigo-700 mt-3"
            >
              ← Back
            </button>
          </>
        )}

        {/* STEP 3: NEW PASSWORD */}
        {step === "reset" && (
          <>
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                New Password
              </label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block text-gray-700">
                Confirm Password
              </label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </p>
            )}

            <button
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium disabled:opacity-50 hover:bg-indigo-700"
            >
              {loading ? "Updating..." : "Reset Password"}
            </button>

            <button
              onClick={() => router.push("/login")}
              className="w-full text-indigo-600 py-2 rounded-md font-medium hover:text-indigo-700 mt-3"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
