"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { createOrganization, joinOrganization } from "@/lib/organizationService";

interface OrganizationSelectProps {
  onSelect: (organizationId: string, organizationName: string) => void;
  onBack: () => void;
  isLoading: boolean;
}

export default function OrganizationSelect({
  onSelect,
  onBack,
  isLoading,
}: OrganizationSelectProps) {
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [organizationName, setOrganizationName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateOrg = async () => {
    setError(null);

    if (!organizationName.trim()) {
      setError("Organization name is required");
      return;
    }

    setLoading(true);

    try {
      const result = await createOrganization(organizationName);

      if (!result.success) {
        setError(result.error || "Failed to create organization");
        setLoading(false);
        return;
      }

      if (result.organization) {
        onSelect(result.organization.id, result.organization.name);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinOrg = async () => {
    setError(null);

    if (!inviteCode.trim()) {
      setError("Invite code is required");
      return;
    }

    setLoading(true);

    try {
      const result = await joinOrganization(inviteCode);

      if (!result.success) {
        setError(result.error || "Failed to join organization");
        setLoading(false);
        return;
      }

      if (result.organization) {
        onSelect(result.organization.id, result.organization.name);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "An error occurred";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /* ==================== INITIAL MODE SELECTION ==================== */
  if (mode === null) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* HEADER */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              Organization Setup
            </h2>
            <p className="text-gray-700 mt-2">
              Choose to create or join an organization
            </p>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* OPTIONS */}
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              Create New Organization
            </button>

            <button
              onClick={() => setMode("join")}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-100 text-gray-900 rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50"
            >
              <Building2 className="w-5 h-5" />
              Join Existing Organization
            </button>
          </div>

          {/* BACK BUTTON */}
          <button
            onClick={onBack}
            disabled={isLoading}
            className="w-full mt-4 px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition disabled:opacity-50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  /* ==================== CREATE ORGANIZATION ==================== */
  if (mode === "create") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Create Organization
          </h2>
          <p className="text-gray-600 mb-6">
            Create a new organization and invite team members
          </p>

          {/* ERROR MESSAGE */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* FORM */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="e.g., Acme Delivery Co."
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 text-black"
              />
            </div>

            <button
              onClick={handleCreateOrg}
              disabled={loading || !organizationName.trim()}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Organization"}
            </button>

            <button
              onClick={() => setMode(null)}
              disabled={loading}
              className="w-full px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition disabled:opacity-50\"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ==================== JOIN ORGANIZATION ==================== */
  if (mode === "join") {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Join Organization
          </h2>
          <p className="text-gray-700 mb-6">
            Enter the invite code provided by your organization admin
          </p>

          {/* ERROR MESSAGE */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* FORM */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invite Code (e.g., A1B2C3D4)
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Enter your invite code"
                disabled={loading}
                maxLength={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 uppercase tracking-wider"
              />
              <p className="text-xs text-gray-700 mt-1">
                Your admin will provide this 8-character code
              </p>
            </div>

            <button
              onClick={handleJoinOrg}
              disabled={loading || !inviteCode.trim()}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "Joining..." : "Join Organization"}
            </button>

            <button
              onClick={() => setMode(null)}
              disabled={loading}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
