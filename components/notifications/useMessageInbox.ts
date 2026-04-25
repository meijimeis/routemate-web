"use client";

import { useState } from "react";
import { Message } from "./messageTypes";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/lib/supabaseClient";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useMessageInbox() {
  const [messages, setMessages] = useState<Message[]>([]);

  async function resolveRiderIdForDraft(message: Message): Promise<string | null> {
    if (message.riderId) {
      return message.riderId;
    }

    if (!message.sourceNotificationId) {
      return null;
    }

    const { data: sourceNotification, error: sourceError } = await supabase
      .from("notifications")
      .select("id, rider_id, metadata")
      .eq("id", message.sourceNotificationId)
      .maybeSingle();

    if (sourceError) {
      console.warn("Failed to resolve source notification for message draft:", sourceError.message);
      return null;
    }

    const sourceMetadata = asRecord(sourceNotification?.metadata);
    const directRiderId =
      readString(sourceNotification?.rider_id) ||
      readString(sourceMetadata.riderId) ||
      readString(sourceMetadata.rider_id);

    if (directRiderId) {
      return directRiderId;
    }

    const deliveryId = readString(sourceMetadata.deliveryId) || readString(sourceMetadata.delivery_id);
    if (deliveryId) {
      const { data: deliveryRow, error: deliveryError } = await supabase
        .from("deliveries")
        .select("id, rider_id")
        .eq("id", deliveryId)
        .maybeSingle();

      if (!deliveryError) {
        const deliveryRiderId = readString(deliveryRow?.rider_id);
        if (deliveryRiderId) {
          return deliveryRiderId;
        }
      }
    }

    const routeId = readString(sourceMetadata.routeId) || readString(sourceMetadata.route_id);
    if (routeId) {
      const { data: routeRow, error: routeError } = await supabase
        .from("routes")
        .select("id, rider_id")
        .eq("id", routeId)
        .maybeSingle();

      if (!routeError) {
        const routeRiderId = readString(routeRow?.rider_id);
        if (routeRiderId) {
          return routeRiderId;
        }
      }
    }

    return null;
  }

  function createDraft(
    riderId: string | null,
    riderName: string,
    content: string,
    sourceNotificationId: string | null = null
  ) {
    const draft: Message = {
      id: uuidv4(),
      riderId,
      riderName,
      content,
      timestamp: new Date().toISOString(),
      status: "DRAFT",
      sourceNotificationId,
    };

    setMessages((m) => [draft, ...m]);
    return draft;
  }

  async function sendMessage(id: string) {
    const target = messages.find((message) => message.id === id);
    if (!target) {
      throw new Error("Draft message not found.");
    }

    const resolvedRiderId = await resolveRiderIdForDraft(target);
    if (!resolvedRiderId) {
      throw new Error("Unable to resolve rider for this draft. Open a rider-specific alert and retry.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Not authenticated.");
    }

    const eventKey = `supervisor-message:${resolvedRiderId}:${target.id}:${Date.now()}`;

    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        riderId: resolvedRiderId,
        type: "system",
        alertType: "SUPERVISOR_MESSAGE",
        severity: "info",
        message: target.content,
        eventKey,
        metadata: {
          channel: "supervisor_message",
          riderId: resolvedRiderId,
          driverName: target.riderName,
          sourceNotificationId: target.sourceNotificationId,
          mobileAlert: true,
          messageDraft: target.content,
        },
      }),
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error || "Failed to send message to rider.");
    }

    setMessages((msgs) =>
      msgs.map((m) =>
        m.id === id ? { ...m, status: "SENT" } : m
      )
    );
  }

  return {
    messages,
    createDraft,
    sendMessage,
  };
}
