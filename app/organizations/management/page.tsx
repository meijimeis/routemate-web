"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check, Users, Key } from "lucide-react";
import { getUserOrganization, getOrganizationRiders } from "@/lib/organizationService";

interface Rider {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
}

export default function OrganizationManagementPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [organization, setOrganization] = useState<any>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isMountedRef = useRef(true);

  const loadRiders = useCallback(async (organizationId: string) => {
    try {
      const result = await getOrganizationRiders(organizationId);

      if (isMountedRef.current) {
        if (result.success && result.riders) {
          setRiders(result.riders as Rider[]);
        }

        setLoading(false);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load riders";
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, []);

  const loadOrganization = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getUserOrganization();

      if (!result.success) {
        if (isMountedRef.current) {
          setError(result.error || "Failed to load organization");
          setLoading(false);
        }
        return;
      }

      if (isMountedRef.current && result.organization) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgData = result.organization as any;
        setOrganization(orgData);

        // Load riders
        if (orgData?.id) {
          await loadRiders(orgData.id);
        } else if (isMountedRef.current) {
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : "An error occurred";
        setError(errorMessage);
        setLoading(false);
      }
    }
  }, [loadRiders]);

  useEffect(() => {
    // eslint-disable-next-line
    loadOrganization();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadOrganization]);

  const handleCopyCode = async () => {
    if (organization?.code) {
      await navigator.clipboard.writeText(organization.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Loading organization...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-800">
            <h3 className="font-semibold mb-2">Error</h3>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900">{organization?.name}</h1>
          <p className="text-gray-600 mt-1">Manage your organization and riders</p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* INVITE CODE CARD */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Invite Code</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Share this code with riders or supervisors to let them join your organization
                  </p>

                  {organization?.code && (
                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-mono font-bold text-blue-600">
                          {organization.code}
                        </span>
                        <button
                          onClick={handleCopyCode}
                          className="p-2 hover:bg-gray-200 rounded-lg transition"
                          title="Copy code"
                        >
                          {copied ? (
                            <Check className="w-5 h-5 text-green-600" />
                          ) : (
                            <Copy className="w-5 h-5 text-gray-600" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>How to use:</strong> New users can enter this code during signup
                    to join your organization.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIDERS LIST CARD */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Riders</h2>
                <span className="ml-auto bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                  {riders.length}
                </span>
              </div>

              {riders.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-600">No riders yet</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Share your invite code to add riders to your organization
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-700">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riders.map((rider) => (
                        <tr key={rider.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{rider.full_name}</td>
                          <td className="py-3 px-4 text-gray-600">{rider.email}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {rider.status || "active"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {new Date(rider.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ORGANIZATION INFO CARD */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Organization Information</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600">Organization Name</p>
              <p className="text-lg font-medium text-gray-900 mt-1">{organization?.name}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="text-lg font-medium text-gray-900 mt-1">
                {new Date(organization?.created_at).toLocaleDateString()}
              </p>
            </div>

            {organization?.domain && (
              <div>
                <p className="text-sm text-gray-600">Domain</p>
                <p className="text-lg font-medium text-gray-900 mt-1">{organization.domain}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
