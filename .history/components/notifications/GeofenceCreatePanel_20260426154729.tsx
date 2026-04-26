"use client";

import { FormEvent, useMemo, useState } from "react";
import { createGeofence } from "@/lib/api";
import { useGeofence } from "@/components/notifications/GeofenceContext";

type Severity = "info" | "warning" | "critical";
type ZoneType = "RESTRICTED" | "DELIVERY" | "DEPOT" | "NO_PARKING" | "SERVICE_AREA";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeLongitude(lng: number): number {
  if (lng > 180) return lng - 360;
  if (lng < -180) return lng + 360;
  return lng;
}

function metersToLatitudeDegrees(meters: number): number {
  return meters / 111320;
}

function metersToLongitudeDegrees(meters: number, atLatitude: number): number {
  const latitudeRadians = toRadians(atLatitude);
  const cosLat = Math.cos(latitudeRadians);
  const safeCosLat = Math.max(0.00001, Math.abs(cosLat));
  return meters / (111320 * safeCosLat);
}

function buildRectanglePolygon(
  centerLat: number,
  centerLng: number,
  widthMeters: number,
  heightMeters: number
): { type: "Polygon"; coordinates: number[][][] } {
  const halfHeightDeg = metersToLatitudeDegrees(heightMeters / 2);
  const halfWidthDeg = metersToLongitudeDegrees(widthMeters / 2, centerLat);

  const north = centerLat + halfHeightDeg;
  const south = centerLat - halfHeightDeg;
  const east = normalizeLongitude(centerLng + halfWidthDeg);
  const west = normalizeLongitude(centerLng - halfWidthDeg);

  const ring: number[][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];

  return {
    type: "Polygon",
    coordinates: [ring],
  };
}

export default function GeofenceCreatePanel() {
  const { draftGeofencePoint, setDraftGeofencePoint } = useGeofence();

  const [isOpen, setIsOpen] = useState(false);

  const [name, setName] = useState("");
  const [zoneType, setZoneType] = useState<ZoneType>("RESTRICTED");
  const [severity, setSeverity] = useState<Severity>("warning");
  const [centerLat, setCenterLat] = useState("14.5995");
  const [centerLng, setCenterLng] = useState("120.9842");
  const [widthMeters, setWidthMeters] = useState("300");
  const [heightMeters, setHeightMeters] = useState("200");
  const [maxDwellMinutes, setMaxDwellMinutes] = useState("20");
  const [zoneExitCooldownMinutes, setZoneExitCooldownMinutes] = useState("8");
  const [zoneOverstayCooldownMinutes, setZoneOverstayCooldownMinutes] = useState("15");
  const [offRouteCooldownMinutes, setOffRouteCooldownMinutes] = useState("8");
  const [delayCooldownMinutes, setDelayCooldownMinutes] = useState("20");
  const [fallbackCooldownMinutes, setFallbackCooldownMinutes] = useState("10");
  const [allowExit, setAllowExit] = useState(false);
  const [requiredEntry, setRequiredEntry] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const latNum = useMemo(() => Number(centerLat), [centerLat]);
  const lngNum = useMemo(() => Number(centerLng), [centerLng]);
  const widthNum = useMemo(() => Number(widthMeters), [widthMeters]);
  const heightNum = useMemo(() => Number(heightMeters), [heightMeters]);
  const dwellNum = useMemo(() => Number(maxDwellMinutes), [maxDwellMinutes]);
  const zoneExitCooldownNum = useMemo(() => Number(zoneExitCooldownMinutes), [zoneExitCooldownMinutes]);
  const zoneOverstayCooldownNum = useMemo(
    () => Number(zoneOverstayCooldownMinutes),
    [zoneOverstayCooldownMinutes]
  );
  const offRouteCooldownNum = useMemo(() => Number(offRouteCooldownMinutes), [offRouteCooldownMinutes]);
  const delayCooldownNum = useMemo(() => Number(delayCooldownMinutes), [delayCooldownMinutes]);
  const fallbackCooldownNum = useMemo(() => Number(fallbackCooldownMinutes), [fallbackCooldownMinutes]);

  const resetForm = () => {
    setName("");
    setZoneType("RESTRICTED");
    setSeverity("warning");
    setWidthMeters("300");
    setHeightMeters("200");
    setMaxDwellMinutes("20");
    setZoneExitCooldownMinutes("8");
    setZoneOverstayCooldownMinutes("15");
    setOffRouteCooldownMinutes("8");
    setDelayCooldownMinutes("20");
    setFallbackCooldownMinutes("10");
    setAllowExit(false);
    setRequiredEntry(false);
    setIsActive(true);
  };

  const applyMapPointToCenter = () => {
    if (!draftGeofencePoint) return;

    setCenterLat(draftGeofencePoint.lat.toFixed(6));
    setCenterLng(draftGeofencePoint.lng.toFixed(6));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setResultError(null);
    setResultMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setResultError("Zone name is required.");
      return;
    }

    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      setResultError("Center latitude must be between -90 and 90.");
      return;
    }

    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      setResultError("Center longitude must be between -180 and 180.");
      return;
    }

    if (!Number.isFinite(widthNum) || widthNum < 25 || widthNum > 10000) {
      setResultError("Width must be between 25m and 10000m.");
      return;
    }

    if (!Number.isFinite(heightNum) || heightNum < 25 || heightNum > 10000) {
      setResultError("Height must be between 25m and 10000m.");
      return;
    }

    if (!Number.isFinite(dwellNum) || dwellNum < 0 || dwellNum > 720) {
      setResultError("Max dwell minutes must be between 0 and 720.");
      return;
    }

    if (!Number.isFinite(zoneExitCooldownNum) || zoneExitCooldownNum < 5 || zoneExitCooldownNum > 720) {
      setResultError("Zone exit cooldown must be between 5 and 720 minutes.");
      return;
    }

    if (
      !Number.isFinite(zoneOverstayCooldownNum) ||
      zoneOverstayCooldownNum < 5 ||
      zoneOverstayCooldownNum > 720
    ) {
      setResultError("Zone overstay cooldown must be between 5 and 720 minutes.");
      return;
    }

    if (!Number.isFinite(offRouteCooldownNum) || offRouteCooldownNum < 1 || offRouteCooldownNum > 720) {
      setResultError("Off-route cooldown must be between 1 and 720 minutes.");
      return;
    }

    if (!Number.isFinite(delayCooldownNum) || delayCooldownNum < 1 || delayCooldownNum > 720) {
      setResultError("Delay cooldown must be between 1 and 720 minutes.");
      return;
    }

    if (!Number.isFinite(fallbackCooldownNum) || fallbackCooldownNum < 1 || fallbackCooldownNum > 720) {
      setResultError("Fallback cooldown must be between 1 and 720 minutes.");
      return;
    }

    setSaving(true);

    try {
      const geometry = buildRectanglePolygon(latNum, lngNum, widthNum, heightNum);

      const response = await createGeofence({
        name: trimmedName,
        zone_type: zoneType,
        severity,
        is_active: isActive,
        allow_exit: allowExit,
        required_entry: requiredEntry,
        max_dwell_minutes: Math.round(dwellNum),
        geometry,
        rules: {
          source: "supervisor-manual",
          center: { lat: latNum, lng: lngNum },
          rectangle_width_meters: widthNum,
          rectangle_height_meters: heightNum,
          zoneExitCooldownMinutes: Math.round(zoneExitCooldownNum),
          zoneOverstayCooldownMinutes: Math.round(zoneOverstayCooldownNum),
          offRouteCooldownMinutes: Math.round(offRouteCooldownNum),
          delayCooldownMinutes: Math.round(delayCooldownNum),
          fallbackCooldownMinutes: Math.round(fallbackCooldownNum),
          notification_config: {
            zoneExitCooldownMinutes: Math.round(zoneExitCooldownNum),
            zoneOverstayCooldownMinutes: Math.round(zoneOverstayCooldownNum),
            offRouteCooldownMinutes: Math.round(offRouteCooldownNum),
            delayCooldownMinutes: Math.round(delayCooldownNum),
            fallbackCooldownMinutes: Math.round(fallbackCooldownNum),
          },
        },
      });

      if (!response?.success) {
        setResultError(response?.error || "Failed to create geofence.");
        return;
      }

      setResultMessage("Geofence created successfully. It should appear on the map shortly.");
      resetForm();
      setIsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected geofence creation error.";
      setResultError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm flex flex-col h-full max-h-[500px]">
      <div className="flex items-center justify-between gap-2 shrink-0" >
        <div>
          <p className="text-sm font-semibold text-gray-900">Supervisor Geofence Controls</p>
          <p className="text-xs text-gray-500">Create organization geofences directly from the dashboard.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {isOpen ? "Close" : "Add Geofence"}
        </button>
      </div>

      {resultError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {resultError}
        </div>
      ) : null}

      {resultMessage ? (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          {resultMessage}
        </div>
      ) : null}

         {isOpen ? (
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto">
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-gray-700">
            Zone Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Warehouse North"
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="text-xs text-gray-700">
            Zone Type
            <select
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value as ZoneType)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            >
              <option value="RESTRICTED">Restricted</option>
              <option value="DELIVERY">Delivery</option>
              <option value="DEPOT">Depot</option>
              <option value="NO_PARKING">No Parking</option>
              <option value="SERVICE_AREA">Service Area</option>
            </select>
          </label>

          <label className="text-xs text-gray-700">
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label className="text-xs text-gray-700">
            Rectangle Width (meters)
            <input
              type="number"
              min={25}
              max={10000}
              value={widthMeters}
              onChange={(e) => setWidthMeters(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="text-xs text-gray-700">
            Rectangle Height (meters)
            <input
              type="number"
              min={25}
              max={10000}
              value={heightMeters}
              onChange={(e) => setHeightMeters(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="text-xs text-gray-700">
            Center Latitude
            <input
              type="number"
              step="any"
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            />
          </label>

          <label className="text-xs text-gray-700">
            Center Longitude
            <input
              type="number"
              step="any"
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            />
          </label>

          <div className="md:col-span-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-900">
            <p className="font-medium">Map Click Placement</p>
            <p className="mt-1">
              Click anywhere on the geofence map to capture coordinates, then apply that point as the center.
            </p>

            {draftGeofencePoint ? (
              <p className="mt-1 text-teal-800">
                Last map point: {draftGeofencePoint.lat.toFixed(6)}, {draftGeofencePoint.lng.toFixed(6)}
              </p>
            ) : (
              <p className="mt-1 text-teal-700">No map point selected yet.</p>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyMapPointToCenter}
                disabled={!draftGeofencePoint}
                className="rounded-md border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use Last Map Point
              </button>
              <button
                type="button"
                onClick={() => setDraftGeofencePoint(null)}
                disabled={!draftGeofencePoint}
                className="rounded-md border border-teal-200 bg-white px-3 py-1.5 text-xs text-teal-700 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear Map Point
              </button>
            </div>
          </div>

          <label className="text-xs text-gray-700">
            Max Dwell (minutes)
            <input
              type="number"
              min={0}
              max={720}
              value={maxDwellMinutes}
              onChange={(e) => setMaxDwellMinutes(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-900"
            />
          </label>

          <div className="md:col-span-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-3">
            <p className="text-xs font-semibold text-indigo-900">Alert Cooldowns (minutes)</p>
            <p className="mt-1 text-[11px] text-indigo-800">
              These values are saved in geofence rule settings. Geofence alerts use a minimum of 5 minutes to reduce redundant notifications.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs text-indigo-900">
                Zone Exit Cooldown
                <input
                  type="number"
                  min={5}
                  max={720}
                  value={zoneExitCooldownMinutes}
                  onChange={(e) => setZoneExitCooldownMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-sm text-gray-900"
                />
              </label>

              <label className="text-xs text-indigo-900">
                Zone Overstay Cooldown
                <input
                  type="number"
                  min={5}
                  max={720}
                  value={zoneOverstayCooldownMinutes}
                  onChange={(e) => setZoneOverstayCooldownMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-sm text-gray-900"
                />
              </label>

              <label className="text-xs text-indigo-900">
                Off-route Cooldown
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={offRouteCooldownMinutes}
                  onChange={(e) => setOffRouteCooldownMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-sm text-gray-900"
                />
              </label>

              <label className="text-xs text-indigo-900">
                Delivery Delay Cooldown
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={delayCooldownMinutes}
                  onChange={(e) => setDelayCooldownMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-sm text-gray-900"
                />
              </label>

              <label className="text-xs text-indigo-900 md:col-span-2">
                Fallback Cooldown
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={fallbackCooldownMinutes}
                  onChange={(e) => setFallbackCooldownMinutes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-sm text-gray-900"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowExit}
                onChange={(e) => setAllowExit(e.target.checked)}
              />
              Allow zone exit
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={requiredEntry}
                onChange={(e) => setRequiredEntry(e.target.checked)}
              />
              Require entry
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active now
            </label>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {saving ? "Creating..." : "Create Geofence"}
            </button>
          </div>
        </form>
        </div>
      ) : null}
    </div>
  );
}
