"use client";
import { Suspense } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DriverPool from "@/components/drivers/DriverPool";
import DriverDetails from "@/components/drivers/DriverDetails";
import DriverActivity from "@/components/drivers/DriverActivity";
import { useSearchParams } from "next/navigation";

export default function DriversPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600 text-sm">
          Loading drivers...
        </div>
      }
    >
      <DriversPageContent />
    </Suspense>
  );
}

function DriversPageContent() {
  const searchParams = useSearchParams();

  const riderId = (searchParams.get("riderId") || "").trim();
  const routeId = (searchParams.get("routeId") || "").trim();
  const deliveryId = (searchParams.get("deliveryId") || "").trim();
  const shipmentId = (searchParams.get("shipmentId") || "").trim();

  const hasTrackedContext = Boolean(riderId || routeId || deliveryId || shipmentId);

  return (
    <DashboardLayout>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Driver Pool</h1>

        {hasTrackedContext ? (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
              Live Tracking Context
            </p>

            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-blue-900 md:grid-cols-2">
              {shipmentId ? (
                <p>
                  <span className="font-medium">Shipment ID:</span> {shipmentId}
                </p>
              ) : null}
              {deliveryId ? (
                <p className="break-all">
                  <span className="font-medium">Delivery ID:</span> {deliveryId}
                </p>
              ) : null}
              {routeId ? (
                <p className="break-all">
                  <span className="font-medium">Route ID:</span> {routeId}
                </p>
              ) : null}
              {riderId ? (
                <p className="break-all">
                  <span className="font-medium">Rider ID:</span> {riderId}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      
      <div className="h-[calc(100vh-200px)] w-full">
        <div className="grid grid-cols-12 gap-6 h-full">
          {/* LEFT - DRIVER LIST */}
          <div className="col-span-3 h-full">
            <DriverPool />
          </div>

          {/* CENTER - DRIVER DETAILS */}
          <div className="col-span-6 h-full">
            <DriverDetails />
          </div>

          {/* RIGHT - ACTIVITY */}
          <div className="col-span-3 h-full">
            <DriverActivity />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
