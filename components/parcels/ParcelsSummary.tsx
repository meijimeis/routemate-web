"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ParcelsSummary() {
  const [ungrouped, setUngrouped] = useState(0);
  const [grouped, setGrouped] = useState(0);
  const [priority, setPriority] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      const [u, g, p] = await Promise.all([
        supabase
          .from("parcel_lists")
          .select("id", { count: "exact", head: true })
          .eq("status", "unassigned"),

        supabase
          .from("parcel_lists")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),

        supabase
          .from("parcel_lists")
          .select("id", { count: "exact", head: true })
          .eq("priority", "High"),
      ]);

      setUngrouped(u.count || 0);
      setGrouped(g.count || 0);
      setPriority(p.count || 0);
      setLoading(false);
    }

    fetchSummary();
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-md p-4 w-full">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">
          Parcels
        </h2>

        <button className="text-gray-700 hover:text-gray-900 text-lg">
          ⋯
        </button>
      </div>

      {/* SUMMARY LIST */}
      <div className="divide-y divide-gray-100 text-sm">
        <SummaryRow
          label="Ungrouped"
          value={loading ? "…" : ungrouped}
        />

        <SummaryRow
          label="Grouped"
          value={loading ? "…" : grouped}
        />

        <SummaryRow
          label="Priority"
          value={loading ? "…" : priority}
        />

        <SummaryRow
          label="Drivers"
          value="8"
        />
      </div>
    </div>
  );
}

/* ---------- Reusable row ---------- */

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-gray-700">
        {label}
      </span>

      <span className="font-semibold text-gray-900">
        {value}
      </span>
    </div>
  );
}
