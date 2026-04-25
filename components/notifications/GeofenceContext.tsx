"use client";

import { createContext, useContext, useState } from "react";

type Point = {
  lat: number;
  lng: number;
};

type GeofenceContextType = {
  focusedZone: string | null;
  setFocusedZone: (zone: string | null) => void;

  focusedPoint: Point | null;
  focusPoint: (point: Point | null) => void;

  draftGeofencePoint: Point | null;
  setDraftGeofencePoint: (point: Point | null) => void;

  violationZone: string | null;
  triggerViolation: (zone: string) => void;
};

const GeofenceContext = createContext<GeofenceContextType | null>(null);

export function GeofenceProvider({ children }: { children: React.ReactNode }) {
  const [focusedZone, setFocusedZone] = useState<string | null>(null);
  const [focusedPoint, setFocusedPoint] = useState<Point | null>(null);
  const [draftGeofencePoint, setDraftGeofencePoint] = useState<Point | null>(null);
  const [violationZone, setViolationZone] = useState<string | null>(null);

  const triggerViolation = (zone: string) => {
    setFocusedZone(zone);
    setFocusedPoint(null);
    setViolationZone(zone);

    setTimeout(() => {
      setViolationZone(null);
    }, 5000);
  };

  const focusPoint = (point: Point | null) => {
    setFocusedPoint(point);
    setFocusedZone(null);
    setViolationZone(null);
  };

  return (
    <GeofenceContext.Provider
      value={{
        focusedZone,
        setFocusedZone,
        focusedPoint,
        focusPoint,
        draftGeofencePoint,
        setDraftGeofencePoint,
        violationZone,
        triggerViolation,
      }}
    >
      {children}
    </GeofenceContext.Provider>
  );
}

export function useGeofence() {
  const ctx = useContext(GeofenceContext);
  if (!ctx) throw new Error("useGeofence must be used inside GeofenceProvider");
  return ctx;
}
