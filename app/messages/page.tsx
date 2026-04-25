"use client";

import { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

const drivers = [
  { id: "A", name: "Driver A", status: "Online" },
  { id: "B", name: "Driver B", status: "Online" },
  { id: "C", name: "Driver C", status: "Offline" },
];

export default function MessagesPage() {
  const [activeDriver, setActiveDriver] = useState(drivers[1]); // Driver B default
  const [message, setMessage] = useState("");

  return (
    <DashboardLayout>
      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-120px)]">
        {/* LEFT: Driver List */}
        <div className="col-span-3 bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold mb-3">Drivers</h3>

          <div className="space-y-2">
            {drivers.map((driver) => (
              <button
                key={driver.id}
                onClick={() => setActiveDriver(driver)}
                className={`w-full text-left p-3 rounded-lg border ${
                  activeDriver.id === driver.id
                    ? "border-purple-600 bg-purple-50"
                    : "border-gray-200"
                }`}
              >
                <div className="font-medium">{driver.name}</div>
                <div className="text-xs text-gray-700">
                  {driver.status === "Online" ? "🟢 Online" : "⚪ Offline"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER: Chat */}
        <div className="col-span-6 bg-white rounded-xl shadow-sm flex flex-col">
          {/* Header */}
          <div className="p-4 border-b flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-200 flex items-center justify-center font-semibold">
              {activeDriver.name[0]}
            </div>
            <div>
              <p className="font-semibold">{activeDriver.name}</p>
              <p className="text-xs text-green-500">{activeDriver.status}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto bg-gray-50">
            <div className="bg-white p-3 rounded-lg max-w-[75%] shadow-sm">
              Driver, please re-enter assigned zone.
              <div className="text-xs text-gray-700 mt-1">You · 10:01 AM</div>
            </div>

            <div className="bg-purple-600 text-white p-3 rounded-lg max-w-[75%] ml-auto">
              Acknowledged. Re-routing now.
              <div className="text-xs opacity-80 mt-1">Driver · 10:02 AM</div>
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message…"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button className="bg-purple-600 text-white px-4 rounded-lg">
              Send
            </button>
          </div>
        </div>

        {/* RIGHT: Context Panel */}
        <div className="col-span-3 space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h4 className="font-semibold mb-2">Triggered From</h4>
            <p className="text-sm text-gray-600">
              ⚠ Geofence Exit — Makati
            </p>
            <p className="text-xs text-gray-700 mt-1">2 mins ago</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h4 className="font-semibold mb-2">Quick Actions</h4>
            <button className="w-full border rounded-lg py-2 text-sm mb-2">
              View in Geofencing
            </button>
            <button className="w-full border rounded-lg py-2 text-sm">
              View Route
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
