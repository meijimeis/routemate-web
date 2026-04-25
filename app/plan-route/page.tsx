"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import RiderPool from "@/components/plan-route/RiderPool";
import ParcelPool from "@/components/plan-route/ParcelPool";
import RiderAssignment from "@/components/plan-route/RiderAssignment";
import RiderRoute from "@/components/plan-route/RiderRoute";
import PlanRouteMap from "@/components/plan-route/PlanRouteMap";
import { MapPin, Users, Package } from "lucide-react";

export default function PlanRoutePage() {
  return (
    <DashboardLayout>
      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Plan Route</h1>
        <p className="text-gray-600 mt-1">Assign parcels to riders and optimize delivery routes</p>
        
        {/* QUICK TIPS */}
        <div className="mt-4 grid grid-cols-3 gap-4">
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
              <p className="font-medium text-amber-900">2. Pick Parcel Input</p>
              <p className="text-amber-700 text-xs">Select from cluster parcels or individual parcels</p>
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
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-320px)]">
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
    </DashboardLayout>
  );
}
