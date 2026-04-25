"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  acquireParcelClusters,
  acquireParcels,
  createParcelAcquisitionLog,
  getGeofences,
  getParcelAcquisitionLogsPage,
  getUnacquiredClusterParcelRows,
  getUnacquiredIndividualParcels,
  importParcelCsvRows,
} from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import {
  buildGeofenceRuntime,
  isPointInsideGeofences,
  pointsShareMergedGeofenceComponent,
  type GeofenceRuntime,
} from "@/lib/geofenceRuntime";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Boxes,
  Calendar,
  CheckCircle2,
  FileUp,
  Loader,
  MapPin,
  Package,
  RefreshCcw,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

type ParcelRow = {
  id: string;
  tracking_code?: string | null;
  address?: string | null;
  recipient_name?: string | null;
  weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  region?: string | null;
  created_at: string;
  status?: string | null;
};

type ClusterSummaryRow = {
  parcel_cluster_id: string;
  cluster_name: string;
  parcel_count: number;
  total_weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  status?: string | null;
};

type UnacquiredClusterParcelRow = {
  id: string;
  cluster_name?: string | null;
  weight_kg?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  status?: string | null;
};

type GeofenceRow = {
  id?: string | null;
  name?: string | null;
  region?: string | null;
  geometry?: unknown;
};

type AcquisitionLogRow = {
  id: string;
  supervisor_name?: string | null;
  acquisition_type: "individual" | "cluster";
  selected_item_count: number;
  acquired_parcel_count: number;
  acquired_cluster_count: number;
  created_at: string;
};

type AcquisitionTab = "individual" | "clusters";

type CsvImportSkippedRow = {
  row: number;
  reason: string;
};

type CsvImportSummary = {
  totalRows: number;
  insertedCount: number;
  insertedIndividualRowsCount: number;
  insertedClusteredRowsCount: number;
  importedClusterCount: number;
  clusteredRowsDetectedCount: number;
  skippedCount: number;
  geocodedCount: number;
  usedProvidedCoordinatesCount: number;
  droppedContactDetails: boolean;
  assignedToOrganization: boolean;
  organizationId?: string | null;
  skippedRows: CsvImportSkippedRow[];
};

type CsvRawRow = Record<string, string | number | null | undefined>;

type CsvImportPreview = {
  totalRows: number;
  rowsWithClusters: number;
  uniqueClusterCount: number;
  individualRows: number;
  previewItems: string[];
  previewClusterNames: string[];
};

const INDIVIDUAL_PAGE_SIZE = 12;
const CLUSTER_PAGE_SIZE = 10;
const LOG_PAGE_SIZE = 8;
const MISSING_GEOFENCE_MESSAGE =
  "No active geofences found for your organization. Acquisition inventory only shows parcels inside geofences.";

const CSV_CLUSTER_KEYS = ["cluster_name", "cluster", "parcel_cluster", "cluster_label", "group_name"];
const CSV_TRACKING_KEYS = [
  "tracking_code",
  "tracking",
  "tracking_number",
  "tracking_id",
  "shipment_tracking_id",
  "shipment_id",
  "reference",
];
const CSV_ADDRESS_KEYS = [
  "address",
  "delivery_address",
  "dropoff_address",
  "destination_address",
  "full_address",
  "location",
];

function normalizeCsvKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toNormalizedCsvRow(row: CsvRawRow) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = normalizeCsvKey(key);
    if (!normalizedKey) continue;
    normalized[normalizedKey] = String(value ?? "").trim();
  }

  return normalized;
}

function pickFirstCsvValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function buildCsvImportPreview(rows: CsvRawRow[]): CsvImportPreview {
  const previewItems: string[] = [];
  const clusterNames = new Set<string>();
  let rowsWithClusters = 0;

  for (const row of rows) {
    const cleanRow = toNormalizedCsvRow(row);
    const clusterName = pickFirstCsvValue(cleanRow, CSV_CLUSTER_KEYS);
    const trackingOrAddress =
      pickFirstCsvValue(cleanRow, CSV_TRACKING_KEYS) || pickFirstCsvValue(cleanRow, CSV_ADDRESS_KEYS);

    if (clusterName) {
      rowsWithClusters += 1;
      clusterNames.add(clusterName);
    }

    if (trackingOrAddress && previewItems.length < 5) {
      previewItems.push(trackingOrAddress);
    }
  }

  const uniqueClusterNames = Array.from(clusterNames);

  return {
    totalRows: rows.length,
    rowsWithClusters,
    uniqueClusterCount: uniqueClusterNames.length,
    individualRows: Math.max(0, rows.length - rowsWithClusters),
    previewItems,
    previewClusterNames: uniqueClusterNames.slice(0, 5),
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function parseCsvFile(file: File): Promise<CsvRawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (Array.isArray(results.errors) && results.errors.length > 0) {
          reject(new Error(results.errors[0]?.message || "Failed to parse CSV file"));
          return;
        }

        const rows = Array.isArray(results.data)
          ? (results.data as CsvRawRow[]).filter((row) =>
              Object.values(row || {}).some((value) => String(value ?? "").trim().length > 0)
            )
          : [];

        resolve(rows);
      },
      error: (error) => reject(error),
    });
  });
}

function toFiniteCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function PaginationControls({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 py-1.5 rounded border text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
      >
        Prev
      </button>

      <span className="text-gray-600">
        Page {page} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded border text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
      >
        Next
      </button>
    </div>
  );
}

export default function ParcelAcquisitionPage() {
  const [activeTab, setActiveTab] = useState<AcquisitionTab>("individual");
  const [hasSupervisorAccess, setHasSupervisorAccess] = useState(false);

  const [individualRows, setIndividualRows] = useState<ParcelRow[]>([]);
  const [individualPage, setIndividualPage] = useState(1);
  const [individualTotalCount, setIndividualTotalCount] = useState(0);

  const [clusterRows, setClusterRows] = useState<ClusterSummaryRow[]>([]);
  const [clusterPage, setClusterPage] = useState(1);
  const [clusterTotalCount, setClusterTotalCount] = useState(0);

  const [logs, setLogs] = useState<AcquisitionLogRow[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalCount, setLogsTotalCount] = useState(0);

  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [selectedClusterNames, setSelectedClusterNames] = useState<Set<string>>(new Set());

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [acquiring, setAcquiring] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [csvImportSummary, setCsvImportSummary] = useState<CsvImportSummary | null>(null);
  const [csvImportFileName, setCsvImportFileName] = useState<string | null>(null);
  const [pendingCsvRows, setPendingCsvRows] = useState<CsvRawRow[]>([]);
  const [pendingCsvPreview, setPendingCsvPreview] = useState<CsvImportPreview | null>(null);
  const [showCsvConfirmModal, setShowCsvConfirmModal] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const getGeofenceRuntime = useCallback(async (): Promise<GeofenceRuntime> => {
    const geofenceRowsRaw = await getGeofences(undefined);
    const geofenceRows = Array.isArray(geofenceRowsRaw)
      ? (geofenceRowsRaw as GeofenceRow[])
      : [];

    return buildGeofenceRuntime(geofenceRows);
  }, []);

  const verifySupervisorAccess = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setHasSupervisorAccess(false);
      setMessage({ type: "error", text: "You must be logged in to access acquisition." });
      return false;
    }

    const { data: supervisorRow, error } = await supabase
      .from("supervisors")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (error) {
      setHasSupervisorAccess(false);
      setMessage({ type: "error", text: error.message });
      return false;
    }

    if (!supervisorRow) {
      setHasSupervisorAccess(false);
      setMessage({ type: "error", text: "Only supervisors can access this page." });
      return false;
    }

    setHasSupervisorAccess(true);
    return true;
  }, []);

  const showMissingGeofenceMessage = useCallback(() => {
    setMessage((previous) => {
      if (previous?.text === MISSING_GEOFENCE_MESSAGE) {
        return previous;
      }

      if (previous?.type === "success") {
        return previous;
      }

      return {
        type: "error",
        text: MISSING_GEOFENCE_MESSAGE,
      };
    });
  }, []);

  const loadIndividualPage = useCallback(async (page: number) => {
    setLoadingInventory(true);
    try {
      const [rowsRaw, geofenceRuntime] = await Promise.all([
        getUnacquiredIndividualParcels(),
        getGeofenceRuntime(),
      ]);

      const rows = Array.isArray(rowsRaw) ? (rowsRaw as ParcelRow[]) : [];

      if (geofenceRuntime.zones.length === 0) {
        showMissingGeofenceMessage();
        setIndividualRows([]);
        setIndividualTotalCount(0);
        setIndividualPage(1);
        return;
      }

      const eligibleRows = rows.filter((row) => {
        const lat = toFiniteCoordinate(row.latitude);
        const lng = toFiniteCoordinate(row.longitude);
        if (lat == null || lng == null) return false;

        return isPointInsideGeofences(lat, lng, geofenceRuntime);
      });

      const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
      const totalCount = eligibleRows.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / INDIVIDUAL_PAGE_SIZE));
      const boundedPage = Math.min(safePage, totalPages);
      const from = (boundedPage - 1) * INDIVIDUAL_PAGE_SIZE;
      const to = from + INDIVIDUAL_PAGE_SIZE;

      setIndividualRows(eligibleRows.slice(from, to));
      setIndividualTotalCount(totalCount);
      setIndividualPage(boundedPage);
    } catch (error) {
      console.error("Failed to load geofence-restricted individual parcels:", error);
      setIndividualRows([]);
      setIndividualTotalCount(0);
      setIndividualPage(1);
    } finally {
      setLoadingInventory(false);
    }
  }, [getGeofenceRuntime, showMissingGeofenceMessage]);

  const loadClusterPage = useCallback(async (page: number) => {
    setLoadingInventory(true);
    try {
      const [rowsRaw, geofenceRuntime] = await Promise.all([
        getUnacquiredClusterParcelRows(),
        getGeofenceRuntime(),
      ]);

      const rows = Array.isArray(rowsRaw)
        ? (rowsRaw as UnacquiredClusterParcelRow[])
        : [];

      if (geofenceRuntime.zones.length === 0) {
        showMissingGeofenceMessage();
        setClusterRows([]);
        setClusterTotalCount(0);
        setClusterPage(1);
        return;
      }

      const rowsByClusterName = new Map<string, UnacquiredClusterParcelRow[]>();

      rows.forEach((row) => {
        const clusterName = (row.cluster_name || "").trim();
        if (!clusterName) return;

        if (!rowsByClusterName.has(clusterName)) {
          rowsByClusterName.set(clusterName, []);
        }

        rowsByClusterName.get(clusterName)?.push(row);
      });

      const eligibleClusters: ClusterSummaryRow[] = [];

      rowsByClusterName.forEach((clusterRowsRaw, clusterName) => {
        const pointRows = clusterRowsRaw
          .map((row) => {
            const lat = toFiniteCoordinate(row.latitude);
            const lng = toFiniteCoordinate(row.longitude);

            if (lat == null || lng == null) return null;

            return {
              row,
              lat,
              lng,
            };
          })
          .filter(
            (
              point
            ): point is { row: UnacquiredClusterParcelRow; lat: number; lng: number } => point != null
          );

        // If any row is missing coordinates, skip this cluster because geofence eligibility cannot be verified.
        if (pointRows.length === 0 || pointRows.length !== clusterRowsRaw.length) {
          return;
        }

        const allInsideGeofences = pointRows.every((point) =>
          isPointInsideGeofences(point.lat, point.lng, geofenceRuntime)
        );

        if (!allInsideGeofences) {
          return;
        }

        const isMergedComponentEligible = pointsShareMergedGeofenceComponent(
          pointRows.map((point) => ({ lat: point.lat, lng: point.lng })),
          geofenceRuntime
        );

        if (!isMergedComponentEligible) {
          return;
        }

        const centroidLat =
          pointRows.reduce((sum, point) => sum + point.lat, 0) / pointRows.length;
        const centroidLng =
          pointRows.reduce((sum, point) => sum + point.lng, 0) / pointRows.length;

        const latestCreatedAtMs = clusterRowsRaw.reduce((latest, row) => {
          const createdAtMs = new Date(row.created_at || "").getTime();
          return Math.max(latest, Number.isFinite(createdAtMs) ? createdAtMs : 0);
        }, 0);

        const totalWeightKg = clusterRowsRaw.reduce(
          (sum, row) => sum + Number(toFiniteCoordinate(row.weight_kg) || 0),
          0
        );

        eligibleClusters.push({
          parcel_cluster_id: clusterName,
          cluster_name: clusterName,
          parcel_count: clusterRowsRaw.length,
          total_weight_kg: totalWeightKg,
          latitude: centroidLat,
          longitude: centroidLng,
          created_at: latestCreatedAtMs > 0 ? new Date(latestCreatedAtMs).toISOString() : null,
          status: clusterRowsRaw[0]?.status || "pending",
        });
      });

      eligibleClusters.sort((left, right) => {
        const leftTs = new Date(left.created_at || "").getTime();
        const rightTs = new Date(right.created_at || "").getTime();
        return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0);
      });

      const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
      const totalCount = eligibleClusters.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / CLUSTER_PAGE_SIZE));
      const boundedPage = Math.min(safePage, totalPages);
      const from = (boundedPage - 1) * CLUSTER_PAGE_SIZE;
      const to = from + CLUSTER_PAGE_SIZE;

      setClusterRows(eligibleClusters.slice(from, to));
      setClusterTotalCount(totalCount);
      setClusterPage(boundedPage);
    } catch (error) {
      console.error("Failed to load geofence-restricted parcel clusters:", error);
      setClusterRows([]);
      setClusterTotalCount(0);
      setClusterPage(1);
    } finally {
      setLoadingInventory(false);
    }
  }, [getGeofenceRuntime, showMissingGeofenceMessage]);

  const loadLogsPage = useCallback(async (page: number) => {
    setLoadingLogs(true);
    const result = await getParcelAcquisitionLogsPage(page, LOG_PAGE_SIZE);
    setLogs(Array.isArray(result.rows) ? (result.rows as AcquisitionLogRow[]) : []);
    setLogsTotalCount(result.totalCount || 0);
    setLogsPage(result.page || page);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      setCheckingAccess(true);
      const allowed = await verifySupervisorAccess();
      setCheckingAccess(false);

      if (!allowed) return;

      await Promise.all([loadIndividualPage(1), loadClusterPage(1), loadLogsPage(1)]);
    };

    initialize();
  }, [verifySupervisorAccess, loadIndividualPage, loadClusterPage, loadLogsPage]);

  const handleRefresh = async () => {
    if (!hasSupervisorAccess) return;

    if (activeTab === "individual") {
      await Promise.all([loadIndividualPage(individualPage), loadLogsPage(logsPage)]);
      return;
    }

    await Promise.all([loadClusterPage(clusterPage), loadLogsPage(logsPage)]);
  };

  const openCsvPicker = () => {
    csvInputRef.current?.click();
  };

  const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage(null);
    setCsvImportSummary(null);
    setCsvImportFileName(file.name);
    setShowCsvConfirmModal(false);
    setPendingCsvRows([]);
    setPendingCsvPreview(null);
    setImportingCsv(true);

    try {
      const rows = await parseCsvFile(file);
      if (rows.length === 0) {
        setMessage({
          type: "error",
          text: "CSV file is empty. Add at least one row with an address.",
        });
        return;
      }

      setPendingCsvRows(rows);
      setPendingCsvPreview(buildCsvImportPreview(rows));
      setShowCsvConfirmModal(true);
    } catch (error) {
      console.error("CSV import failed:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to parse and import CSV file.",
      });
    } finally {
      setImportingCsv(false);
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
    }
  };

  const handleCancelCsvImport = () => {
    setShowCsvConfirmModal(false);
    setPendingCsvRows([]);
    setPendingCsvPreview(null);
  };

  const handleConfirmCsvImport = async () => {
    if (pendingCsvRows.length === 0) {
      setShowCsvConfirmModal(false);
      return;
    }

    setImportingCsv(true);
    setMessage(null);

    try {
      const result = await importParcelCsvRows(pendingCsvRows, { assignToOrganization: true });
      const summary = (result.summary || null) as CsvImportSummary | null;

      if (summary) {
        setCsvImportSummary(summary);
      }

      if (!result.success) {
        setMessage({
          type: "error",
          text: result.error || "Failed to import CSV rows.",
        });
        return;
      }

      const insertedCount = summary?.insertedCount || 0;
      const insertedIndividualRowsCount = summary?.insertedIndividualRowsCount || 0;
      const insertedClusteredRowsCount = summary?.insertedClusteredRowsCount || 0;
      const importedClusterCount = summary?.importedClusterCount || 0;

      if (insertedIndividualRowsCount > 0) {
        const logResult = await createParcelAcquisitionLog({
          acquisitionType: "individual",
          selectedItemCount: insertedIndividualRowsCount,
          acquiredParcelCount: insertedIndividualRowsCount,
          acquiredClusterCount: 0,
          details: {
            source: "csv-import",
            fileName: csvImportFileName,
          },
        });

        if (!logResult.success) {
          console.warn("CSV import completed but individual audit log failed:", logResult.error);
        }
      }

      if (importedClusterCount > 0) {
        const logResult = await createParcelAcquisitionLog({
          acquisitionType: "cluster",
          selectedItemCount: importedClusterCount,
          acquiredParcelCount: insertedClusteredRowsCount,
          acquiredClusterCount: importedClusterCount,
          details: {
            source: "csv-import",
            fileName: csvImportFileName,
          },
        });

        if (!logResult.success) {
          console.warn("CSV import completed but cluster audit log failed:", logResult.error);
        }
      }

      const skippedSuffix =
        summary && summary.skippedCount > 0
          ? ` Skipped ${summary.skippedCount} row(s).`
          : "";

      const geocodeSuffix = summary
        ? ` Geocoded ${summary.geocodedCount} row(s).`
        : "";

      const clusterSuffix =
        importedClusterCount > 0
          ? ` Imported ${importedClusterCount} cluster(s) with ${insertedClusteredRowsCount} clustered parcel row(s).`
          : "";

      const organizationSuffix =
        summary?.assignedToOrganization
          ? " Imported rows are now under your organization."
          : "";

      setMessage({
        type: "success",
        text:
          `CSV import completed. Inserted ${insertedCount} row(s), including ${insertedIndividualRowsCount} individual parcel row(s).` +
          `${clusterSuffix}${geocodeSuffix}${skippedSuffix}${organizationSuffix}`,
      });

      setShowCsvConfirmModal(false);
      setPendingCsvRows([]);
      setPendingCsvPreview(null);
      setSelectedParcelIds(new Set());
      setSelectedClusterNames(new Set());

      await Promise.all([loadIndividualPage(1), loadClusterPage(1), loadLogsPage(1)]);
    } catch (error) {
      console.error("CSV import confirmation failed:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to import CSV rows.",
      });
    } finally {
      setImportingCsv(false);
    }
  };

  const selectedParcelRows = useMemo(
    () => individualRows.filter((row) => selectedParcelIds.has(row.id)),
    [individualRows, selectedParcelIds]
  );

  const selectedClusterRows = useMemo(
    () => clusterRows.filter((row) => selectedClusterNames.has(row.cluster_name)),
    [clusterRows, selectedClusterNames]
  );

  const summary = useMemo(() => {
    if (activeTab === "individual") {
      const totalWeight = selectedParcelRows.reduce((sum, row) => sum + (row.weight_kg || 0), 0);
      return {
        title: "Acquire Individual Parcels",
        selectedItemCount: selectedParcelRows.length,
        acquiredParcelCount: selectedParcelRows.length,
        acquiredClusterCount: 0,
        totalWeight,
        previewItems: selectedParcelRows.slice(0, 5).map((row) => row.tracking_code || row.id),
      };
    }

    const parcelCount = selectedClusterRows.reduce((sum, row) => sum + (row.parcel_count || 0), 0);
    const totalWeight = selectedClusterRows.reduce((sum, row) => sum + (row.total_weight_kg || 0), 0);

    return {
      title: "Acquire Parcel Clusters",
      selectedItemCount: selectedClusterRows.length,
      acquiredParcelCount: parcelCount,
      acquiredClusterCount: selectedClusterRows.length,
      totalWeight,
      previewItems: selectedClusterRows.slice(0, 5).map((row) => row.cluster_name),
    };
  }, [activeTab, selectedParcelRows, selectedClusterRows]);

  const selectedCount =
    activeTab === "individual" ? selectedParcelIds.size : selectedClusterNames.size;

  const toggleParcel = (id: string) => {
    setSelectedParcelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleCluster = (clusterName: string) => {
    setSelectedClusterNames((prev) => {
      const next = new Set(prev);
      if (next.has(clusterName)) {
        next.delete(clusterName);
      } else {
        next.add(clusterName);
      }
      return next;
    });
  };

  const toggleSelectAllCurrentPage = () => {
    if (activeTab === "individual") {
      const currentIds = individualRows.map((row) => row.id);
      const allSelected = currentIds.every((id) => selectedParcelIds.has(id));

      setSelectedParcelIds((prev) => {
        const next = new Set(prev);

        if (allSelected) {
          currentIds.forEach((id) => next.delete(id));
        } else {
          currentIds.forEach((id) => next.add(id));
        }

        return next;
      });

      return;
    }

    const currentNames = clusterRows.map((row) => row.cluster_name);
    const allSelected = currentNames.every((name) => selectedClusterNames.has(name));

    setSelectedClusterNames((prev) => {
      const next = new Set(prev);

      if (allSelected) {
        currentNames.forEach((name) => next.delete(name));
      } else {
        currentNames.forEach((name) => next.add(name));
      }

      return next;
    });
  };

  const openConfirmModal = () => {
    setMessage(null);

    if (selectedCount === 0) {
      setMessage({
        type: "error",
        text: activeTab === "individual"
          ? "Please select at least one individual parcel."
          : "Please select at least one parcel cluster.",
      });
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmAcquire = async () => {
    if (!showConfirmModal) return;

    setAcquiring(true);
    setMessage(null);

    try {
      if (activeTab === "individual") {
        const ids = Array.from(selectedParcelIds);
        const result = await acquireParcels(ids);

        if (!result.success) {
          setMessage({ type: "error", text: result.error || "Failed to acquire parcels." });
          return;
        }

        const logResult = await createParcelAcquisitionLog({
          acquisitionType: "individual",
          selectedItemCount: ids.length,
          acquiredParcelCount: result.acquired || 0,
          acquiredClusterCount: 0,
          details: {
            parcelIds: ids,
          },
        });

        if (!logResult.success) {
          console.warn("Acquisition completed but audit log failed:", logResult.error);
        }

        setSelectedParcelIds(new Set());
        setShowConfirmModal(false);

        await Promise.all([loadIndividualPage(1), loadLogsPage(1)]);

        setMessage({
          type: "success",
          text: `Successfully acquired ${result.acquired} individual parcel${result.acquired === 1 ? "" : "s"}.`,
        });

        return;
      }

      const clusterNames = Array.from(selectedClusterNames);
      const result = await acquireParcelClusters(clusterNames);

      if (!result.success) {
        setMessage({ type: "error", text: result.error || "Failed to acquire parcel clusters." });
        return;
      }

      const logResult = await createParcelAcquisitionLog({
        acquisitionType: "cluster",
        selectedItemCount: clusterNames.length,
        acquiredParcelCount: result.acquired || 0,
        acquiredClusterCount: clusterNames.length,
        details: {
          clusterNames,
        },
      });

      if (!logResult.success) {
        console.warn("Acquisition completed but audit log failed:", logResult.error);
      }

      setSelectedClusterNames(new Set());
      setShowConfirmModal(false);

      await Promise.all([loadClusterPage(1), loadLogsPage(1)]);

      setMessage({
        type: "success",
        text: `Successfully acquired ${clusterNames.length} parcel cluster${clusterNames.length === 1 ? "" : "s"} (${result.acquired} parcels imported).`,
      });
    } catch (err) {
      console.error("Acquire error:", err);
      setMessage({ type: "error", text: "Failed to complete acquisition." });
    } finally {
      setAcquiring(false);
    }
  };

  if (checkingAccess) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto py-12 flex items-center gap-3 text-gray-700">
          <Loader className="w-5 h-5 animate-spin" />
          Checking supervisor access...
        </div>
      </DashboardLayout>
    );
  }

  if (!hasSupervisorAccess) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto py-10">
          <div className="p-5 rounded-lg border bg-amber-50 border-amber-200 text-amber-800 flex gap-3 items-start">
            <TriangleAlert className="w-5 h-5 mt-0.5" />
            <div>
              <p className="font-semibold">Supervisor Access Required</p>
              <p className="text-sm mt-1">This page is only available to supervisors.</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Parcel Acquisition</h1>
          <p className="text-gray-600 mt-2">
            Import unacquired individual parcels and parcel clusters into your organization.
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            <p className="font-medium">{message.text}</p>
          </div>
        )}

        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-purple-100 p-2 text-purple-700">
                <FileUp className="w-5 h-5" />
              </div>

              <div>
                <p className="font-semibold text-gray-900">Bulk CSV Upload</p>
                <p className="text-sm text-gray-600 mt-1">
                  Upload parcel rows in CSV, review the preview, then confirm import.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Required column: address (or delivery_address/location). Recommended: latitude and longitude for the best map accuracy.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Optional columns: tracking_code, recipient_name, weight_kg, region, priority, payment_type, cluster_name.
                  If coordinates are missing, addresses are geocoded with a Philippines bias before import. Confirmed imports are assigned directly to your organization.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="hidden"
              />

              <button
                onClick={openCsvPicker}
                disabled={importingCsv || acquiring}
                className="px-16 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer inline-flex items-center gap-2"
              >
                {importingCsv ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importingCsv ? "Processing CSV..." : "Upload CSV"}
              </button>

              {csvImportFileName ? (
                <p className="text-xs text-gray-500">Last file: {csvImportFileName}</p>
              ) : null}
            </div>
          </div>

          {csvImportSummary ? (
            <>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Rows</p>
                  <p className="text-lg font-semibold text-gray-900">{csvImportSummary.totalRows}</p>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-green-600">Inserted</p>
                  <p className="text-lg font-semibold text-green-800">{csvImportSummary.insertedCount}</p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-amber-700">Skipped</p>
                  <p className="text-lg font-semibold text-amber-800">{csvImportSummary.skippedCount}</p>
                </div>

                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-purple-700">Geocoded</p>
                  <p className="text-lg font-semibold text-purple-800">{csvImportSummary.geocodedCount}</p>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-indigo-700">Cluster Rows</p>
                  <p className="text-lg font-semibold text-indigo-900">
                    {csvImportSummary.insertedClusteredRowsCount}
                  </p>
                </div>

                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-sky-700">Clusters</p>
                  <p className="text-lg font-semibold text-sky-900">
                    {csvImportSummary.importedClusterCount}
                  </p>
                </div>
              </div>

              {csvImportSummary.assignedToOrganization ? (
                <p className="mt-3 text-xs text-green-700">
                  Imported rows were assigned to your organization.
                </p>
              ) : null}

              {csvImportSummary.skippedRows.length > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">Skipped rows (first 5)</p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-900">
                    {csvImportSummary.skippedRows.slice(0, 5).map((row) => (
                      <li key={`${row.row}-${row.reason}`}>Row {row.row}: {row.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="mb-4 bg-white border rounded-lg p-2 inline-flex gap-2 w-fit">
          <button
            onClick={() => setActiveTab("individual")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "individual"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Individual Parcels ({individualTotalCount})
          </button>
          <button
            onClick={() => setActiveTab("clusters")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "clusters"
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Parcel Clusters ({clusterTotalCount})
          </button>
        </div>

        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              onChange={toggleSelectAllCurrentPage}
              checked={
                activeTab === "individual"
                  ? individualRows.length > 0 && individualRows.every((row) => selectedParcelIds.has(row.id))
                  : clusterRows.length > 0 && clusterRows.every((row) => selectedClusterNames.has(row.cluster_name))
              }
              className="w-5 h-5 rounded border-gray-300 cursor-pointer"
            />
            <span className="text-sm font-medium text-gray-700">
              {selectedCount === 0
                ? "Select items"
                : `${selectedCount} selected`}
            </span>
            <span className="text-xs text-gray-500">Acquisition requires popup confirmation</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="px-3 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Refresh
            </button>

            <button
              onClick={openConfirmModal}
              disabled={selectedCount === 0 || acquiring}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                selectedCount === 0 || acquiring
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              }`}
            >
              {acquiring ? (
                <span className="flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Acquiring...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {activeTab === "individual" ? "Review & Confirm Parcels" : "Review & Confirm Clusters"}
                </span>
              )}
            </button>
          </div>
        </div>

        {loadingInventory ? (
          <div className="py-12 text-center text-gray-700 flex items-center justify-center gap-3 bg-white rounded-lg border">
            <Loader className="w-5 h-5 animate-spin" />
            Loading acquisition inventory...
          </div>
        ) : activeTab === "individual" ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {individualRows.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No unacquired individual parcels</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left" />
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tracking</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Location</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Details</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Posted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {individualRows.map((parcel) => (
                      <tr
                        key={parcel.id}
                        className={`hover:bg-gray-50 transition ${
                          selectedParcelIds.has(parcel.id) ? "bg-purple-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedParcelIds.has(parcel.id)}
                            onChange={() => toggleParcel(parcel.id)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-semibold text-gray-900">
                            {parcel.tracking_code || parcel.id}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                            <div>
                              {parcel.region && <p className="text-sm font-medium text-gray-900">{parcel.region}</p>}
                              {parcel.address && (
                                <p className="text-xs text-gray-600 line-clamp-1">{parcel.address}</p>
                              )}
                              {typeof parcel.latitude === "number" && typeof parcel.longitude === "number" && (
                                <p className="text-xs text-gray-500">
                                  {parcel.latitude.toFixed(4)}, {parcel.longitude.toFixed(4)}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-600 space-y-1">
                            {parcel.recipient_name && (
                              <p>
                                <span className="font-medium">Recipient:</span> {parcel.recipient_name}
                              </p>
                            )}
                            {typeof parcel.weight_kg === "number" && (
                              <p>
                                <span className="font-medium">Weight:</span> {parcel.weight_kg} kg
                              </p>
                            )}
                            {parcel.status && (
                              <p>
                                <span className="font-medium">Status:</span> {parcel.status}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            {formatDate(parcel.created_at)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <PaginationControls
                  page={individualPage}
                  pageSize={INDIVIDUAL_PAGE_SIZE}
                  totalCount={individualTotalCount}
                  onPageChange={(nextPage) => {
                    setSelectedParcelIds(new Set());
                    loadIndividualPage(nextPage);
                  }}
                />
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {clusterRows.length === 0 ? (
              <div className="text-center py-12">
                <Boxes className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No unacquired parcel clusters</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left" />
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cluster</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Parcels</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Total Weight</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Center</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Posted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {clusterRows.map((cluster) => (
                      <tr
                        key={cluster.parcel_cluster_id}
                        className={`hover:bg-gray-50 transition ${
                          selectedClusterNames.has(cluster.cluster_name) ? "bg-purple-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedClusterNames.has(cluster.cluster_name)}
                            onChange={() => toggleCluster(cluster.cluster_name)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{cluster.cluster_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{cluster.parcel_count}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{(cluster.total_weight_kg || 0).toFixed(2)} kg</td>
                        <td className="px-4 py-3 text-xs text-gray-700 font-mono">
                          {typeof cluster.latitude === "number" && typeof cluster.longitude === "number"
                            ? `${cluster.latitude.toFixed(4)}, ${cluster.longitude.toFixed(4)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDate(cluster.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <PaginationControls
                  page={clusterPage}
                  pageSize={CLUSTER_PAGE_SIZE}
                  totalCount={clusterTotalCount}
                  onPageChange={(nextPage) => {
                    setSelectedClusterNames(new Set());
                    loadClusterPage(nextPage);
                  }}
                />
              </>
            )}
          </div>
        )}

        <div className="mt-8 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Acquisition Audit Log</h2>
            <button
              onClick={() => loadLogsPage(logsPage)}
              className="px-3 py-1.5 rounded border text-sm text-gray-700 hover:bg-white"
            >
              Refresh Logs
            </button>
          </div>

          {loadingLogs ? (
            <div className="p-6 text-sm text-gray-600 flex items-center gap-2">
              <Loader className="w-4 h-4 animate-spin" />
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">No acquisition logs yet.</div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">When</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Supervisor</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Selected</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Imported Parcels</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Imported Clusters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{log.supervisor_name || "Unknown"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 capitalize">{log.acquisition_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{log.selected_item_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{log.acquired_parcel_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{log.acquired_cluster_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <PaginationControls
                page={logsPage}
                pageSize={LOG_PAGE_SIZE}
                totalCount={logsTotalCount}
                onPageChange={(nextPage) => loadLogsPage(nextPage)}
              />
            </>
          )}
        </div>

        {showCsvConfirmModal && pendingCsvPreview && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl border w-full max-w-xl">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Review CSV Import</h3>
                <button
                  onClick={handleCancelCsvImport}
                  className="p-1 rounded hover:bg-gray-100"
                  disabled={importingCsv}
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3 text-sm text-gray-700">
                <p className="font-medium text-gray-900">Confirm CSV parcels for organization import</p>
                {csvImportFileName ? <p className="text-xs text-gray-500">File: {csvImportFileName}</p> : null}
                <p className="text-xs text-gray-500">
                  No parcel rows are saved until you press Confirm Import.
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border bg-gray-50 p-2">
                    <p className="text-gray-500">CSV rows</p>
                    <p className="font-semibold text-gray-900">{pendingCsvPreview.totalRows}</p>
                  </div>
                  <div className="rounded border bg-gray-50 p-2">
                    <p className="text-gray-500">Individual rows</p>
                    <p className="font-semibold text-gray-900">{pendingCsvPreview.individualRows}</p>
                  </div>
                  <div className="rounded border bg-gray-50 p-2">
                    <p className="text-gray-500">Clustered rows</p>
                    <p className="font-semibold text-gray-900">{pendingCsvPreview.rowsWithClusters}</p>
                  </div>
                  <div className="rounded border bg-gray-50 p-2">
                    <p className="text-gray-500">Unique clusters</p>
                    <p className="font-semibold text-gray-900">{pendingCsvPreview.uniqueClusterCount}</p>
                  </div>
                </div>

                {pendingCsvPreview.previewItems.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Preview rows</p>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {pendingCsvPreview.previewItems.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {pendingCsvPreview.previewClusterNames.length > 0 ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Detected clusters</p>
                    <ul className="text-xs text-gray-700 space-y-1">
                      {pendingCsvPreview.previewClusterNames.map((clusterName) => (
                        <li key={clusterName}>• {clusterName}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="px-5 py-4 border-t flex justify-end gap-2">
                <button
                  onClick={handleCancelCsvImport}
                  className="px-4 py-2 rounded border text-gray-700 hover:bg-gray-50"
                  disabled={importingCsv}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCsvImport}
                  disabled={importingCsv}
                  className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {importingCsv ? "Importing..." : "Confirm Import"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-2xl">
              <div className="bg-gradient-to-r from-purple-600 via-violet-600 to-fuchsia-600 px-5 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white/20 p-2">
                      {activeTab === "individual" ? (
                        <Package className="h-5 w-5" />
                      ) : (
                        <Boxes className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">Confirm Acquisition</h3>
                      <p className="text-xs text-white/85">{summary.title}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="rounded-md p-1.5 text-white/90 transition hover:bg-white/20 hover:text-white"
                    aria-label="Close confirmation modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p className="font-medium">Final check before importing</p>
                  <p className="mt-0.5 text-amber-800">No acquisition is written until you press Confirm Acquire.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-purple-700">Selected</p>
                    <p className="mt-1 text-xl font-semibold text-purple-900">{summary.selectedItemCount}</p>
                  </div>

                  <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-sky-700">Parcels</p>
                    <p className="mt-1 text-xl font-semibold text-sky-900">{summary.acquiredParcelCount}</p>
                  </div>

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-700">Clusters</p>
                    <p className="mt-1 text-xl font-semibold text-indigo-900">{summary.acquiredClusterCount}</p>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700">Total Weight</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-900">{summary.totalWeight.toFixed(2)} kg</p>
                  </div>
                </div>

                {summary.previewItems.length > 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      {activeTab === "individual" ? "Selected Parcels" : "Selected Clusters"}
                    </p>

                    <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                      {summary.previewItems.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAcquire}
                  disabled={acquiring}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {acquiring ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Acquiring...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm Acquire
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
