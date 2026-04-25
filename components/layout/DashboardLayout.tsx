"use client";

import SideBar from "./SideBar";
import TopBar from "./TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#ECECF3]">
      {/* Sidebar */}
      <aside className="w-[80px] flex-shrink-0">
        <SideBar />
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Bar */}
        <div className="h-[72px] flex-shrink-0">
          <TopBar />
        </div>

        {/* Page Content */}
        <main className="flex min-h-0 flex-1 flex-col overflow-auto p-2.5 md:p-3">
          {children}
        </main>
      </div>
    </div>
  );
}
