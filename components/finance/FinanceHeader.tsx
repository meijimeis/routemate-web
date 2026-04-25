"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCcw, X } from "lucide-react";
import { getRiders } from "@/lib/api";
import { type DashboardTimeRange, useFinanceData } from "./FinanceDataProvider";

const TIME_RANGE_OPTIONS: Array<{ value: DashboardTimeRange; label: string }> = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "all", label: "All Time" },
];

const COST_CATEGORIES = ["FUEL", "MAINTENANCE", "INSURANCE", "OTHER"] as const;
const PAYOUT_TYPES = ["BASE_PAY", "INCENTIVE", "OVERTIME", "OTHER"] as const;
const BILLING_STATUSES = ["PAID", "PENDING", "OVERDUE"] as const;

type EntryType = "cost" | "payout" | "billing";

type RiderOption = {
  id: string;
  name: string;
};

export default function FinanceHeader() {
  const {
    data,
    loading,
    refresh,
    region,
    timeRange,
    availableRegions,
    savingEntry,
    setRegion,
    setTimeRange,
    createCostEntry,
    createPayoutEntry,
    createBillingEntry,
  } = useFinanceData();

  const [showModal, setShowModal] = useState(false);
  const [entryType, setEntryType] = useState<EntryType>("cost");
  const [modalMessage, setModalMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [riderOptions, setRiderOptions] = useState<RiderOption[]>([]);

  const [costForm, setCostForm] = useState({
    category: "FUEL" as (typeof COST_CATEGORIES)[number],
    amount: "",
    fuelLiters: "",
    notes: "",
    region: "",
  });

  const [payoutForm, setPayoutForm] = useState({
    riderId: "",
    payoutType: "BASE_PAY" as (typeof PAYOUT_TYPES)[number],
    amount: "",
    status: "PENDING" as (typeof BILLING_STATUSES)[number],
    payoutDate: "",
    reference: "",
    region: "",
  });

  const [billingForm, setBillingForm] = useState({
    referenceLabel: "",
    amount: "",
    status: "PENDING" as (typeof BILLING_STATUSES)[number],
    billedDate: "",
    dueDate: "",
    paidDate: "",
    notes: "",
    region: "",
  });

  const regionOptions = useMemo(() => {
    return ["all", ...availableRegions.filter((item) => item.trim().length > 0)];
  }, [availableRegions]);

  useEffect(() => {
    if (!showModal || entryType !== "payout") return;

    let cancelled = false;

    const loadRiders = async () => {
      try {
        const rows = await getRiders(undefined);
        const mapped = (Array.isArray(rows) ? rows : []).map((row) => {
          const profiles = Array.isArray((row as { profiles?: unknown }).profiles)
            ? (row as { profiles?: Array<{ full_name?: string | null }> }).profiles?.[0]
            : ((row as { profiles?: { full_name?: string | null } }).profiles || null);

          return {
            id: String((row as { id?: string }).id || ""),
            name: String(profiles?.full_name || "Unknown Rider"),
          };
        });

        if (!cancelled) {
          setRiderOptions(mapped.filter((item) => item.id));
        }
      } catch {
        if (!cancelled) {
          setRiderOptions([]);
        }
      }
    };

    void loadRiders();

    return () => {
      cancelled = true;
    };
  }, [entryType, showModal]);

  const openModal = (type: EntryType) => {
    setEntryType(type);
    setModalMessage(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (savingEntry) return;
    setShowModal(false);
    setModalMessage(null);
  };

  const handleExport = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      filters: {
        timeRange,
        region,
      },
      data,
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finance-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleSubmitEntry = async () => {
    setModalMessage(null);

    if (entryType === "cost") {
      const amount = Number(costForm.amount);
      const fuelLiters = costForm.fuelLiters.trim() ? Number(costForm.fuelLiters) : null;

      const result = await createCostEntry({
        category: costForm.category,
        amount,
        fuel_liters: fuelLiters,
        notes: costForm.notes,
        region: costForm.region.trim() || (region !== "all" ? region : undefined),
      });

      if (!result.success) {
        setModalMessage({ type: "error", text: result.error || "Failed to save cost entry." });
        return;
      }

      setModalMessage({ type: "success", text: "Cost entry saved." });
      setCostForm({ category: "FUEL", amount: "", fuelLiters: "", notes: "", region: "" });
      return;
    }

    if (entryType === "payout") {
      const amount = Number(payoutForm.amount);

      const result = await createPayoutEntry({
        rider_id: payoutForm.riderId || null,
        payout_type: payoutForm.payoutType,
        amount,
        status: payoutForm.status,
        payout_date: payoutForm.payoutDate ? new Date(`${payoutForm.payoutDate}T00:00:00.000Z`).toISOString() : undefined,
        reference: payoutForm.reference,
        region: payoutForm.region.trim() || (region !== "all" ? region : undefined),
      });

      if (!result.success) {
        setModalMessage({ type: "error", text: result.error || "Failed to save payout entry." });
        return;
      }

      setModalMessage({ type: "success", text: "Payout entry saved." });
      setPayoutForm({
        riderId: "",
        payoutType: "BASE_PAY",
        amount: "",
        status: "PENDING",
        payoutDate: "",
        reference: "",
        region: "",
      });
      return;
    }

    const billingAmount = Number(billingForm.amount);

    const result = await createBillingEntry({
      reference_label: billingForm.referenceLabel,
      amount: billingAmount,
      status: billingForm.status,
      billed_at: billingForm.billedDate
        ? new Date(`${billingForm.billedDate}T00:00:00.000Z`).toISOString()
        : undefined,
      due_at: billingForm.dueDate
        ? new Date(`${billingForm.dueDate}T00:00:00.000Z`).toISOString()
        : null,
      paid_at: billingForm.paidDate
        ? new Date(`${billingForm.paidDate}T00:00:00.000Z`).toISOString()
        : null,
      notes: billingForm.notes,
      region: billingForm.region.trim() || (region !== "all" ? region : undefined),
    });

    if (!result.success) {
      setModalMessage({ type: "error", text: result.error || "Failed to save billing entry." });
      return;
    }

    setModalMessage({ type: "success", text: "Billing entry saved." });
    setBillingForm({
      referenceLabel: "",
      amount: "",
      status: "PENDING",
      billedDate: "",
      dueDate: "",
      paidDate: "",
      notes: "",
      region: "",
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-[26px] font-semibold text-[#1F2937]">Finance</h1>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value as DashboardTimeRange)}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {regionOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All Regions" : option}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              void refresh();
            }}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            disabled={loading}
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={() => openModal("cost")}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Plus size={16} />
            Add Entry
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Finance Quick Entry</h3>
              <button onClick={closeModal} className="rounded p-1 hover:bg-gray-100" disabled={savingEntry}>
                <X className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
                {(["cost", "payout", "billing"] as EntryType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEntryType(type)}
                    className={`rounded px-3 py-1.5 font-medium capitalize transition ${
                      entryType === type ? "bg-purple-600 text-white" : "text-gray-700 hover:bg-white"
                    }`}
                    disabled={savingEntry}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {entryType === "cost" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-gray-700">
                    Category
                    <select
                      value={costForm.category}
                      onChange={(event) =>
                        setCostForm((prev) => ({ ...prev, category: event.target.value as (typeof COST_CATEGORIES)[number] }))
                      }
                      className="mt-1 w-full rounded border px-3 py-2"
                    >
                      {COST_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    Amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={costForm.amount}
                      onChange={(event) => setCostForm((prev) => ({ ...prev, amount: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Fuel Liters (optional)
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={costForm.fuelLiters}
                      onChange={(event) => setCostForm((prev) => ({ ...prev, fuelLiters: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Region (optional)
                    <input
                      type="text"
                      value={costForm.region}
                      onChange={(event) => setCostForm((prev) => ({ ...prev, region: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700 md:col-span-2">
                    Notes
                    <textarea
                      value={costForm.notes}
                      onChange={(event) => setCostForm((prev) => ({ ...prev, notes: event.target.value }))}
                      className="mt-1 h-24 w-full rounded border px-3 py-2"
                    />
                  </label>
                </div>
              ) : null}

              {entryType === "payout" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-gray-700">
                    Rider (optional)
                    <select
                      value={payoutForm.riderId}
                      onChange={(event) => setPayoutForm((prev) => ({ ...prev, riderId: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    >
                      <option value="">Unassigned</option>
                      {riderOptions.map((rider) => (
                        <option key={rider.id} value={rider.id}>
                          {rider.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    Payout Type
                    <select
                      value={payoutForm.payoutType}
                      onChange={(event) =>
                        setPayoutForm((prev) => ({ ...prev, payoutType: event.target.value as (typeof PAYOUT_TYPES)[number] }))
                      }
                      className="mt-1 w-full rounded border px-3 py-2"
                    >
                      {PAYOUT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    Amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={payoutForm.amount}
                      onChange={(event) => setPayoutForm((prev) => ({ ...prev, amount: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Status
                    <select
                      value={payoutForm.status}
                      onChange={(event) =>
                        setPayoutForm((prev) => ({ ...prev, status: event.target.value as (typeof BILLING_STATUSES)[number] }))
                      }
                      className="mt-1 w-full rounded border px-3 py-2"
                    >
                      {BILLING_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    Payout Date
                    <input
                      type="date"
                      value={payoutForm.payoutDate}
                      onChange={(event) => setPayoutForm((prev) => ({ ...prev, payoutDate: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Region (optional)
                    <input
                      type="text"
                      value={payoutForm.region}
                      onChange={(event) => setPayoutForm((prev) => ({ ...prev, region: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700 md:col-span-2">
                    Reference
                    <input
                      type="text"
                      value={payoutForm.reference}
                      onChange={(event) => setPayoutForm((prev) => ({ ...prev, reference: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>
                </div>
              ) : null}

              {entryType === "billing" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm text-gray-700 md:col-span-2">
                    Reference Label
                    <input
                      type="text"
                      value={billingForm.referenceLabel}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, referenceLabel: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={billingForm.amount}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, amount: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Status
                    <select
                      value={billingForm.status}
                      onChange={(event) =>
                        setBillingForm((prev) => ({ ...prev, status: event.target.value as (typeof BILLING_STATUSES)[number] }))
                      }
                      className="mt-1 w-full rounded border px-3 py-2"
                    >
                      {BILLING_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    Billed Date
                    <input
                      type="date"
                      value={billingForm.billedDate}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, billedDate: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Due Date
                    <input
                      type="date"
                      value={billingForm.dueDate}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Paid Date
                    <input
                      type="date"
                      value={billingForm.paidDate}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, paidDate: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700">
                    Region (optional)
                    <input
                      type="text"
                      value={billingForm.region}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, region: event.target.value }))}
                      className="mt-1 w-full rounded border px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-gray-700 md:col-span-2">
                    Notes
                    <textarea
                      value={billingForm.notes}
                      onChange={(event) => setBillingForm((prev) => ({ ...prev, notes: event.target.value }))}
                      className="mt-1 h-24 w-full rounded border px-3 py-2"
                    />
                  </label>
                </div>
              ) : null}

              {modalMessage ? (
                <p
                  className={`mt-4 rounded border px-3 py-2 text-xs ${
                    modalMessage.type === "success"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {modalMessage.text}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
              <button
                onClick={closeModal}
                className="rounded border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                disabled={savingEntry}
              >
                Close
              </button>
              <button
                onClick={() => {
                  void handleSubmitEntry();
                }}
                className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                disabled={savingEntry}
              >
                {savingEntry ? "Saving..." : "Save Entry"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}