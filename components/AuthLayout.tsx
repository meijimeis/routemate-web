"use client";

import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT — PURPLE CARD */}
      <div className="hidden lg:flex w-1/2 bg-indigo-600 text-white items-center justify-center">
        <div className="max-w-md text-center px-10">
          <h1 className="text-3xl font-bold mb-2">
            Welcome to the Delivery Platform
          </h1>
          <p className="text-indigo-100 mb-10">
            Intelligent Route Optimization for Delivery Riders
          </p>

            <Image
    src="/images/scooter.png"
    alt="Delivery rider"
    width={280}
    height={280}
    className="scale-130"
  />


          <p className="mt-10 text-lg font-semibold">
            Seamless Delivery
          </p>
          <p className="text-sm text-indigo-100 mt-2">
            Effortlessly deliver parcels, anytime, anywhere.
          </p>
        </div>
      </div>

      {/* RIGHT — FORM AREA */}
      <div className="w-full lg:w-1/2 flex items-center justify-center">
        <div className="w-full max-w-md px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
