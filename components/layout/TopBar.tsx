"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Menu } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type RiderMessagePopup = {
  id: string;
  message: string;
  createdAt: string;
};

export default function Topbar() {
  const router = useRouter();
  const [userInitial, setUserInitial] = useState("U");
  const [isRiderSession, setIsRiderSession] = useState(false);
  const [riderMessagePopups, setRiderMessagePopups] = useState<RiderMessagePopup[]>([]);
  const popupTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadUserInitial = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) return;

        let nextInitial = (session.user.email?.trim()?.[0] || "U").toUpperCase();

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile?.full_name?.trim()) {
          nextInitial = profile.full_name.trim().charAt(0).toUpperCase();
        }

        if (mounted) setUserInitial(nextInitial);
      } catch {
        if (mounted) setUserInitial("U");
      }
    };

    loadUserInitial();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToRiderMessages = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || cancelled) return;

      const { data: rider } = await supabase
        .from("riders")
        .select("id")
        .eq("profile_id", session.user.id)
        .maybeSingle();

      if (!rider?.id || cancelled) return;

      setIsRiderSession(true);

      realtimeChannel = supabase
        .channel(`rider-supervisor-messages-${rider.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `rider_id=eq.${rider.id}`,
          },
          (payload) => {
            const row = payload.new as {
              id?: string;
              message?: string | null;
              metadata?: unknown;
            };

            const metadata =
              row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};

            const metadataChannel =
              typeof metadata.channel === "string" ? metadata.channel.toLowerCase() : "";

            const metadataAlertTypeRaw =
              typeof metadata.alertType === "string"
                ? metadata.alertType
                : typeof metadata.riderAlertType === "string"
                ? metadata.riderAlertType
                : "";

            const metadataAlertType = metadataAlertTypeRaw.toUpperCase();

            const isSupervisorMessage =
              metadataChannel === "supervisor_message" || metadataAlertType === "SUPERVISOR_MESSAGE";

            if (!isSupervisorMessage) return;

            const popupId =
              typeof row.id === "string" && row.id.length > 0
                ? row.id
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

            const popupMessage =
              typeof row.message === "string" && row.message.trim().length > 0
                ? row.message.trim()
                : "You received a new message from your supervisor.";

            setRiderMessagePopups((prev) => {
              if (prev.some((item) => item.id === popupId)) return prev;

              return [
                {
                  id: popupId,
                  message: popupMessage,
                  createdAt: new Date().toISOString(),
                },
                ...prev,
              ].slice(0, 3);
            });

            const timeoutId = window.setTimeout(() => {
              setRiderMessagePopups((prev) => prev.filter((item) => item.id !== popupId));
            }, 10000);

            popupTimeoutsRef.current.push(timeoutId);
          }
        )
        .subscribe();
    };

    void subscribeToRiderMessages();

    return () => {
      cancelled = true;

      popupTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      popupTimeoutsRef.current = [];

      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="w-full h-full bg-gradient-to-r from-[#7A5DFB] via-[#6F52F2] to-[#674BEA] px-4 md:px-6 flex items-end">

      <div className="ml-auto flex items-center gap-3 pb-2">
        <Bell className="w-4 h-4 text-white/80 cursor-pointer hover:text-white" />

        <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white text-xs font-semibold">
          {userInitial}
        </div>

        <button
          onClick={handleLogout}
          className="text-[15px] text-white/95 hover:text-white transition"
        >
          Sign Out
        </button>

        <Menu className="w-4 h-4 text-white/80 cursor-pointer hover:text-white" />
      </div>

      {isRiderSession && riderMessagePopups.length > 0 ? (
        <div className="fixed right-4 top-[84px] z-[1100] flex w-[320px] flex-col gap-2">
          {riderMessagePopups.map((popup) => (
            <button
              key={popup.id}
              onClick={() => router.push("/notifications")}
              className="rounded-xl border border-[#D9DDF0] bg-white px-3 py-2 text-left shadow-[0_6px_16px_rgba(17,24,39,0.12)] transition hover:bg-[#F8F9FF]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6F52F2]">
                Supervisor Message
              </p>
              <p className="mt-1 text-xs text-[#2E334F] whitespace-pre-wrap break-words">{popup.message}</p>
              <p className="mt-1 text-[10px] text-[#70758D]">Open Notifications</p>
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

