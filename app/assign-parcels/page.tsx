"use client";
import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import RiderPool from "@/components/plan-route/RiderPool";
import ParcelPool from "@/components/plan-route/ParcelPool";
import RiderAssignment from "@/components/plan-route/RiderAssignment";
import RiderRoute from "@/components/plan-route/RiderRoute";
import PlanRouteMap from "@/components/plan-route/PlanRouteMap";
import DeliveryAssignment from "@/components/assignment/DeliveryAssignment";
import { MapPin, Users, Package, Zap } from "lucide-react";

export default function AssignParcelsPage() {
  const [view, setView] = useState<"quick" | "advanced">("quick");

  return (
    <DashboardLayout>
      <div className="flex h-full min-h-[calc(100vh-120px)] flex-col">
        {/* HEADER */}
        <div className="mb-4 shrink-0">
          <h1 className="text-3xl font-bold text-gray-900">Assign Parcels</h1>
          <p className="text-gray-600 mt-1">Assign parcels to riders and optimize delivery routes</p>

          {/* VIEW TOGGLE */}
          <div className="mt-4 overflow-x-auto pb-1">
            <div className="inline-flex min-w-max gap-3">
              <button
                onClick={() => setView("quick")}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  view === "quick"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Quick Assign
                </span>
              </button>
              <button
                onClick={() => setView("advanced")}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  view === "advanced"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Route Planning
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* QUICK ASSIGN VIEW */}
        {view === "quick" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-4 shrink-0 text-gray-600">Quickly assign parcels to riders</p>
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
              <div className="h-full min-w-[1120px]">
                <DeliveryAssignment />
              </div>
            </div>
          </div>
        )}

        {/* ADVANCED ROUTE PLANNING VIEW */}
        {view === "advanced" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* QUICK TIPS */}
            <div className="mb-4 shrink-0 overflow-x-auto pb-1">
              <div className="grid min-w-[960px] grid-cols-3 gap-4">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900">1. Select Rider</p>
                    <p className="text-blue-700 text-xs">Choose an available rider from the left panel</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <Package className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-900">2. Add Parcels</p>
                    <p className="text-amber-700 text-xs">Select parcels from the pool to assign</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                  <MapPin className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-900">3. View Route</p>
                    <p className="text-green-700 text-xs">See optimized route on the map</p>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN LAYOUT */}
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-1">
              <div className="grid h-full min-w-[1240px] grid-cols-12 gap-6">
                {/* LEFT - RIDER & PARCEL POOLS */}
                <div className="col-span-3 space-y-6 overflow-y-auto pr-2">
                  <RiderPool />
                  <ParcelPool />
                </div>

                {/* CENTER - ASSIGNMENT & ROUTE */}
                <div className="col-span-4 space-y-6 overflow-y-auto pr-2">
                  <RiderAssignment />
                  <RiderRoute />
                </div>

                {/* RIGHT - MAP */}
                <div className="col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-sm">Route Visualization</div>
                  <div className="flex-1 overflow-hidden">
                    <PlanRouteMap />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
