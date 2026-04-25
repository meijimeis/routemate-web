"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ParcelsViewRefactored from "@/components/parcels/ParcelsViewRefactored";
import ParcelsTableTab from "@/components/parcels/ParcelsTableTab";
import ClusteredParcelsTableTab from "@/components/parcels/ClusteredParcelsTableTab";

type ParcelsSubtab = "workspace" | "consolidation" | "table";

export default function ParcelsPage() {
  const [activeTab, setActiveTab] = useState<ParcelsSubtab>("workspace");

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-[calc(100vh-120px)] flex-col gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-gray-900">Parcels</h1>
        </div>

        <div className="shrink-0 overflow-x-auto pb-1">
          <div className="inline-flex min-w-max gap-2 rounded-lg border border-gray-200 bg-white p-2">
            <button
              onClick={() => setActiveTab("table")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "table"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Individual Parcels
            </button>
            <button
              onClick={() => setActiveTab("workspace")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "workspace"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Clustered Parcels
            </button>
            <button
              onClick={() => setActiveTab("consolidation")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "consolidation"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Clusterize Parcels
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
          <div className="h-full min-w-[1120px]">
            {activeTab === "workspace" && <ClusteredParcelsTableTab />}

            {activeTab === "consolidation" && <ParcelsViewRefactored />}

            {activeTab === "table" && <ParcelsTableTab />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
