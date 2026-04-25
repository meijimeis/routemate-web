"use client";


import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Package,
  Download,
  Route,
  Bell,
  Wallet,
  Truck,
  BarChart3,
  Settings,
} from "lucide-react";


const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Parcels", href: "/parcels", icon: Package },
  { label: "Acquire", href: "/parcel-acquisition", icon: Download },
  { label: "Plan Route", href: "/plan-route", icon: Route },
  { label: "Notification", href: "/notifications", icon: Bell },
  { label: "Finance", href: "/finance", icon: Wallet },
  { label: "Driver", href: "/drivers", icon: Truck },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
];


export default function Sidebar() {
  const pathname = usePathname();

  const isDashboardRoute = pathname === "/" || pathname.startsWith("/dashboard");


  return (
    <aside className="h-full w-full bg-gradient-to-b from-[#7A5DFB] via-[#6F52F2] to-[#684CEB] flex flex-col items-center py-2">
     
      {/* LOGO */}
      <Link href="/" className="mb-5 mt-1">
        <Image
          src="/images/logo.png"
          alt="RouteMate Logo"
          width={52}
          height={52}
          priority
          className="object-contain"
        />
      </Link>


      {/* NAV ITEMS */}
      <nav className="flex flex-col gap-3 flex-1 w-full px-1">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive = href === "/dashboard" ? isDashboardRoute : pathname.startsWith(href);


          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center gap-1 py-1.5 transition ${
                isActive ? "" : "hover:opacity-90"
              }`}
            >
              <Icon
                size={17}
                className={`transition ${
                  isActive
                    ? "text-white"
                    : "text-white/55"
                }`}
              />
              <span
                className={`text-[11px] font-medium transition ${
                  isActive
                    ? "text-white"
                    : "text-white/55"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>


      {/* SUPPORT / SETTINGS */}
      <button 
        title="Settings"
        className="mb-2 flex flex-col items-center gap-1 p-2 transition text-white/45 hover:text-white"
      >
        <Settings size={15} />
        <span className="text-[11px] font-medium">Support</span>
      </button>
    </aside>
  );
}


