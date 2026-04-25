"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import LogoUploader from "./logo";

type OrgOnboardingStep = "choice" | "create" | "join";

export default function OrganizationOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<OrgOnboardingStep>("choice");
  const [substep, setSubstep] = useState<1 | 2>(1); // For create org flow
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create org state
  const [company, setCompany] = useState({
    name: "",
    type: "",
    domain: "",
  });

  // Join org state
  const [joinCode, setJoinCode] = useState("");

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  /* ------------------------------------------------------------
     AUTH + PROFILE GUARD
  ------------------------------------------------------------ */
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", session.user.id)
        .single();

      if (error || !profile) {
        router.replace("/login");
        return;
      }

      // Check if organization is already set in supervisor table
      const { data: supervisor } = await supabase
        .from("supervisors")
        .select("organization_id")
        .eq("profile_id", session.user.id)
        .single();

      // If supervisor has organization_id, they're already set up - redirect to dashboard
      if (supervisor?.organization_id) {
        router.replace("/");
        return;
      }
    };

    init();
  }, [router]);

  /* ------------------------------------------------------------
     CREATE ORGANIZATION
  ------------------------------------------------------------ */
  const handleCreateOrganization = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!company.name.trim()) {
        setError("Company name is required");
        setLoading(false);
        return;
      }

      console.log("[Onboarding] Starting organization creation...");

      // Call API endpoint with service role to bypass RLS
      console.log("[Onboarding] Calling create-organization API...");
      const response = await fetch("/api/auth/create-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: company.name,
          type: company.type || null,
          domain: company.domain || null,
          logo_url: logoUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("[Onboarding] API error:", data);
        throw new Error(data.error || "Failed to create organization");
      }

      const { organization } = await response.json();
      console.log("[Onboarding] ✓ Organization created:", organization.id);

      // Refresh session to pick up the updated profile
      console.log("[Onboarding] Refreshing session...");
      await supabase.auth.refreshSession();

      console.log("[Onboarding] ✓ Redirecting to dashboard...");
      router.push("/");
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[Onboarding] Error:", error.message);
      setError(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------
     JOIN ORGANIZATION
  ------------------------------------------------------------ */
  const handleJoinOrganization = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!joinCode.trim()) {
        setError("Join code is required");
        setLoading(false);
        return;
      }

      console.log("[Onboarding] Attempting to join organization with code:", joinCode);

      const response = await fetch("/api/auth/join-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: joinCode.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("[Onboarding] API error:", data);
        throw new Error(data.error || "Failed to join organization");
      }

      const { organization } = await response.json();
      console.log("[Onboarding] ✓ Joined organization:", organization.id);

      // Refresh session to pick up the updated profile
      console.log("[Onboarding] Refreshing session...");
      await supabase.auth.refreshSession();

      console.log("[Onboarding] ✓ Redirecting to dashboard...");
      router.push("/");
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[Onboarding] Error:", error.message);
      setError(error.message || "Failed to join organization");
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------
     UI
  ------------------------------------------------------------ */
  return (
    <div className="min-h-screen flex justify-center bg-white px-6 py-12">
      <div className="w-full max-w-xl">

        {/* STEP HEADER */}
        <div className="text-center mb-8">
          {step === "choice" && (
            <>
              <h1 className="text-2xl font-semibold mt-2">
                Organization Setup
              </h1>
              <p className="text-sm text-gray-700 mt-2">
                Do you want to create a new organization or join an existing one?
              </p>
            </>
          )}
          {step === "create" && (
            <>
              <div className="text-sm text-gray-700">
                {substep} / 2
              </div>
              <h1 className="text-2xl font-semibold mt-2">
                Create your Organization
              </h1>
              <p className="text-sm text-gray-400">
                Setup your organization for members that may join later.
              </p>
            </>
          )}
          {step === "join" && (
            <>
              <h1 className="text-2xl font-semibold mt-2">
                Join Organization
              </h1>
              <p className="text-sm text-gray-400">
                Enter the join code provided by your organization admin.
              </p>
            </>
          )}
        </div>

        {/* CHOICE STEP */}
        {step === "choice" && (
          <div className="space-y-4">
            {/* CREATE ORG */}
            <button
              onClick={() => {
                setStep("create");
                setError(null);
              }}
              className="w-full border-2 border-indigo-300 rounded-lg p-8 text-left hover:bg-indigo-50 transition"
            >
              <h3 className="text-lg font-semibold mb-2">Create New Organization</h3>
              <p className="text-sm text-gray-600">
                Start a new organization and invite team members to join.
              </p>
            </button>

            {/* JOIN ORG */}
            <button
              onClick={() => {
                setStep("join");
                setError(null);
              }}
              className="w-full border-2 border-gray-300 rounded-lg p-8 text-left hover:bg-gray-50 transition"
            >
              <h3 className="text-lg font-semibold mb-2">Join Existing Organization</h3>
              <p className="text-sm text-gray-600">
                Join an organization using a code provided by your admin.
              </p>
            </button>
          </div>
        )}

        {/* CREATE ORG - STEP 1 */}
        {step === "create" && substep === 1 && (
          <div className="bg-white border rounded-lg p-8">
            <label className="block text-sm font-medium mb-2">
              Company Name *
            </label>
            <input
              className="w-full border rounded px-3 py-2 mb-4"
              placeholder="Your company name"
              value={company.name}
              onChange={(e) =>
                setCompany({ ...company, name: e.target.value })
              }
            />

            <label className="block text-sm font-medium mb-2">
              Company Type
            </label>
            <select
              className="w-full border rounded px-3 py-2 mb-4"
              value={company.type}
              onChange={(e) =>
                setCompany({ ...company, type: e.target.value })
              }
            >
              <option value="">Select Company Type</option>
              <option value="logistics">Logistics</option>
              <option value="retail">Retail</option>
              <option value="food">Food / F&B</option>
            </select>

            <label className="block text-sm font-medium mb-2">
              Company Domain
            </label>
            <input
              className="w-full border rounded px-3 py-2 mb-6"
              placeholder="example.com"
              value={company.domain}
              onChange={(e) =>
                setCompany({ ...company, domain: e.target.value })
              }
            />

            <div className="flex justify-between">
              <button
                onClick={() => setStep("choice")}
                className="text-indigo-600 hover:text-indigo-700 px-6 py-2 rounded"
              >
                ← Back
              </button>
              <button
                onClick={() => setSubstep(2)}
                className="bg-indigo-600 text-white px-6 py-2 rounded"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* CREATE ORG - STEP 2 */}
        {step === "create" && substep === 2 && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-32 h-32 rounded-full border-2 border-indigo-300 flex items-center justify-center">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Company logo"
                    width={112}
                    height={112}
                    className="w-28 h-28 object-contain rounded-full"
                  />
                ) : (
                  <span className="text-indigo-400">Logo</span>
                )}
              </div>
            </div>

            <div className="flex justify-center mb-10">
              <LogoUploader onChange={setLogoUrl} />
            </div>

            <div className="bg-white border rounded-lg p-8">
              <div className="mb-4">
                <strong>Company Name</strong>
                <div>{company.name}</div>
              </div>

              <div className="mb-4">
                <strong>Company Type</strong>
                <div>{company.type || "—"}</div>
              </div>

              <div className="mb-6">
                <strong>Company Domain</strong>
                <div>{company.domain || "—"}</div>
              </div>

              {error && (
                <div className="text-sm text-red-500 mb-3">{error}</div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setSubstep(1)}
                  className="border px-4 py-2 rounded"
                >
                  Back
                </button>

                <button
                  disabled={loading}
                  onClick={handleCreateOrganization}
                  className="bg-indigo-600 text-white px-6 py-2 rounded disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create Organization"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* JOIN ORG FORM */}
        {step === "join" && (
          <div className="bg-white border rounded-lg p-8">
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Join Code *
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Enter the join code provided by your admin"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={loading}
                autoFocus
              />
              <p className="text-xs text-gray-700 mt-1">
                Contact your organization admin to get your join code.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep("choice")}
                className="border px-4 py-2 rounded hover:bg-gray-50"
              >
                Back
              </button>

              <button
                disabled={loading || !joinCode.trim()}
                onClick={handleJoinOrganization}
                className="bg-indigo-600 text-white px-6 py-2 rounded disabled:opacity-50"
              >
                {loading ? "Joining..." : "Join Organization"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}