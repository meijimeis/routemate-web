/**
 * Enhanced authentication service with OTP handling for web
 * Mirrors the implementation in routemate-app
 * Uses Supabase Auth with email OTP verification
 */

import { supabase } from './supabaseClient';

interface OtpSendResponse {
  success: boolean;
  error: string | null;
  message: string;
}

interface AuthUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

interface AuthSession {
  user?: AuthUser;
  [key: string]: unknown;
}

interface OtpVerifyResponse {
  success: boolean;
  error: string | null;
  session: AuthSession | null;
}

// Error message mapping
export const OtpErrorMessages: { [key: string]: string } = {
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_EMAIL_FORMAT: 'Email format is not valid',
  INVALID_CODE: 'Please enter the verification code',
  CODE_TOO_SHORT: 'Verification code must be at least 6 characters',
  SEND_FAILED: 'Failed to send verification code. Please try again.',
  VERIFY_FAILED: 'Invalid or expired verification code. Please request a new code.',
  RATE_LIMITED: 'Too many requests. Please try again in 60 seconds',
  UNEXPECTED_ERROR: 'An unexpected error occurred. Please try again.',
  otp_expired: 'Your verification code has expired. Request a new one.',
  invalid_grant: 'Your verification code has expired or is invalid. Request a new one.',
  otp_not_found: 'Verification code not found. Please request a new one.',
  invalid_otp: 'Invalid verification code. Please try again or request a new one.',
};

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Send OTP for signup flow
 * Creates OTP but doesn't auto-create user account
 */
export async function sendSignupOtp(email: string): Promise<OtpSendResponse> {
  const target = email.trim().toLowerCase();

  if (!target) {
    return {
      success: false,
      error: 'INVALID_EMAIL',
      message: 'Email is required',
    };
  }

  if (!isValidEmail(target)) {
    return {
      success: false,
      error: 'INVALID_EMAIL_FORMAT',
      message: 'Please enter a valid email address',
    };
  }

  try {
    console.log('[Auth] Sending signup OTP to', target);

    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error('[Auth] Signup OTP error:', error);
      return {
        success: false,
        error: error.code || 'SEND_FAILED',
        message: error.message || 'Failed to send verification code',
      };
    }

    console.log('[Auth] Signup OTP sent successfully');
    return {
      success: true,
      error: null,
      message: 'Verification code sent to your email',
    };
  } catch (err: unknown) {
    console.error('[Auth] Unexpected signup OTP error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Network error occurred';
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      message: errorMsg,
    };
  }
}

/**
 * Send OTP to user email for password reset
 * Supabase handles email delivery automatically
 */
export async function sendPasswordResetOtp(
  email: string
): Promise<OtpSendResponse> {
  const target = email.trim().toLowerCase();

  if (!target) {
    return {
      success: false,
      error: 'INVALID_EMAIL',
      message: 'Email is required',
    };
  }

  if (!isValidEmail(target)) {
    return {
      success: false,
      error: 'INVALID_EMAIL_FORMAT',
      message: 'Please enter a valid email address',
    };
  }

  try {
    console.log('[Auth] Sending password reset OTP to', target);

    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error('[Auth] OTP send error:', error);
      return {
        success: false,
        error: error.code || 'SEND_FAILED',
        message: error.message || 'Failed to send verification code',
      };
    }

    console.log('[Auth] OTP sent successfully');
    return {
      success: true,
      error: null,
      message: 'Verification code sent to your email',
    };
  } catch (err: unknown) {
    console.error('[Auth] Password reset OTP send error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Network error occurred';
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      message: errorMsg,
    };
  }
}

/**
 * Verify OTP code and get session
 * OTP codes expire after 24 hours by default in Supabase
 */
export async function verifyOtp(
  email: string,
  code: string
): Promise<OtpVerifyResponse> {
  const target = email.trim().toLowerCase();
  const token = code.trim();

  if (!target) {
    return {
      success: false,
      error: 'INVALID_EMAIL',
      session: null,
    };
  }

  if (!token) {
    return {
      success: false,
      error: 'INVALID_CODE',
      session: null,
    };
  }

  if (token.length < 6) {
    return {
      success: false,
      error: 'CODE_TOO_SHORT',
      session: null,
    };
  }

  try {
    console.log('[Auth] Verifying OTP for', target);

    const { data, error } = await supabase.auth.verifyOtp({
      email: target,
      token,
      type: 'email',
    });

    if (error) {
      console.error('[Auth] OTP verification error:', error);
      // Map Supabase error codes to our error messages
      const errorCode = error.code || 'VERIFY_FAILED';
      
      return {
        success: false,
        error: errorCode,
        session: null,
      };
    }

    // Successful verification
    const session = ((data as unknown) as { session?: AuthSession })?.session || null;
    console.log('[Auth] OTP verified successfully');

    // Save session to localStorage
    if (session) {
      saveSessionToLocalStorage(session);
    }

    return {
      success: true,
      error: null,
      session: session || null,
    };
  } catch (err: unknown) {
    console.error('[Auth] Unexpected OTP verification error:', err);
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      session: null,
    };
  }
}

/**
 * Resend OTP code (rate limited by Supabase)
 * Default rate limit: 1 request per minute
 */
export async function resendOtp(email: string): Promise<OtpSendResponse> {
  const target = email.trim().toLowerCase();

  if (!target) {
    return {
      success: false,
      error: 'INVALID_EMAIL',
      message: 'Email is required',
    };
  }

  try {
    console.log('[Auth] Resending OTP to', target);

    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      console.error('[Auth] Resend OTP error:', error);

      // Handle rate limit specifically
      if (error.status === 429 || error.message?.includes('rate')) {
        return {
          success: false,
          error: 'RATE_LIMITED',
          message: 'Too many requests. Please try again in 60 seconds',
        };
      }

      return {
        success: false,
        error: error.code || 'SEND_FAILED',
        message: error.message || 'Failed to resend code',
      };
    }

    console.log('[Auth] OTP resent successfully');
    return {
      success: true,
      error: null,
      message: 'New verification code sent to your email',
    };
  } catch (err: unknown) {
    console.error('[Auth] Unexpected resend error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Network error occurred';
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      message: errorMsg,
    };
  }
}

/**
 * Save session to localStorage for persistence
 */
function saveSessionToLocalStorage(session: AuthSession | null | undefined): void {
  try {
    if (!session) return;

    const sessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: session.user,
    };

    localStorage.setItem('routemate_session', JSON.stringify(sessionData));
    localStorage.setItem(
      'routemate_session_timestamp',
      new Date().getTime().toString()
    );

    console.log('[Auth] Session saved to localStorage');
  } catch (err) {
    console.error('[Auth] Failed to save session:', err);
  }
}

/**
 * Sign out and clear session
 */
export async function signOut() {
  try {
    await supabase.auth.signOut();
    localStorage.removeItem('routemate_session');
    localStorage.removeItem('routemate_session_timestamp');
    console.log('[Auth] User signed out');
  } catch (err) {
    console.error('[Auth] Sign out error:', err);
  }
}

/**
 * Get current user from Supabase session
 */
export async function getCurrentUser() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (err) {
    console.error('[Auth] Get current user error:', err);
    return null;
  }
}

/**
 * Create profile via API endpoint after OTP verification
 * Uses service role on backend to bypass RLS policies
 */
export async function createUserProfile(
  role: 'supervisor' | 'rider' = 'supervisor',
  organizationId?: string,
  profileData?: {
    full_name?: string;
    phone_number?: string;
    vehicle_type?: "motorcycle";
    capacity?: number;
    department?: string;
  }
): Promise<{ success: boolean; error: string | null; message: string }> {
  try {
    // Get current session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {
        success: false,
        error: 'NO_SESSION',
        message: 'User session not found. Please verify OTP again.',
      };
    }

    console.log('[Auth] Creating profile via API...', { role, organizationId, profileData });

    // Call API endpoint with auth token
    const requestBody = {
      role,
      organization_id: organizationId,
      ...profileData,
      ...(role === 'rider' ? { vehicle_type: 'motorcycle' } : {}),
    };

    const response = await fetch('/api/auth/create-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Auth] Profile creation API error:', {
        status: response.status,
        error: data?.error,
        details: data?.details,
        code: data?.code,
      });
      return {
        success: false,
        error: 'PROFILE_CREATE_FAILED',
        message: data?.error || data?.details || 'Failed to create user profile',
      };
    }

    console.log('[Auth] Profile created successfully', { profile: data.profile, role });
    return {
      success: true,
      error: null,
      message: data.message || 'Profile created successfully',
    };
  } catch (err: unknown) {
    console.error('[Auth] Unexpected profile creation error:', err);
    const errorMsg = err instanceof Error ? err.message : 'Failed to create profile';
    return {
      success: false,
      error: 'UNEXPECTED_ERROR',
      message: errorMsg,
    };
  }
}
