"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Package, TrendingUp, MapPin, Zap } from "lucide-react";

type Parcel = {
  id: string;
  tracking_code: string;
  address: string;
  weight_kg: number;
  priority: string;
  status: string;
  region: string;
};

export default function SimpleParcelsView() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'assigned' | 'delivered'>('all');
  const [loading, setLoading] = useState(true);

  const fetchParcels = useCallback(async () => {
    try {
      const { getParcels } = await import("@/lib/api");
      const data = await getParcels();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data || []).map((p: any) => ({
        id: p.id,
        tracking_code: p.tracking_code,
        address: p.address,
        weight_kg: p.weight_kg || 0,
        priority: p.priority || 'normal',
        status: p.status || 'unassigned',
        region: p.region || 'unknown',
      }));
      
      setParcels(mapped);
    } catch (err) {
      console.error("Failed to fetch parcels:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  const filteredParcels = parcels.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  const stats = {
    total: parcels.length,
    unassigned: parcels.filter(p => p.status === 'unassigned').length,
    assigned: parcels.filter(p => p.status === 'assigned').length,
    delivered: parcels.filter(p => p.status === 'delivered').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unassigned':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case 'assigned':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'delivered':
        return 'bg-green-50 text-green-800 border-green-200';
      default:
        return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-700';
      case 'medium':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/70 backdrop-blur p-6 shadow">
        <div className="text-center text-gray-600">Loading parcels...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Parcels</h1>
          <p className="text-gray-600 mt-1">Manage and assign parcels to riders</p>
        </div>
        <Link
          href="/assign-parcels"
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium flex items-center gap-2"
        >
          <Zap className="h-5 w-5" />
          Assign Now
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Package, color: 'bg-blue-100', iconColor: 'text-blue-600' },
          { label: 'Unassigned', value: stats.unassigned, icon: MapPin, color: 'bg-yellow-100', iconColor: 'text-yellow-600' },
          { label: 'Assigned', value: stats.assigned, icon: TrendingUp, color: 'bg-blue-100', iconColor: 'text-blue-600' },
          { label: 'Delivered', value: stats.delivered, icon: Package, color: 'bg-green-100', iconColor: 'text-green-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/70 backdrop-blur rounded-xl p-4 shadow">
            <div className="flex items-center gap-3">
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <div>
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white/70 backdrop-blur rounded-2xl p-4 shadow">
        <div className="flex gap-2">
          {(['all', 'unassigned', 'assigned', 'delivered'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg transition capitalize ${
                filter === status
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Parcels List */}
      <div className="bg-white/70 backdrop-blur rounded-2xl shadow overflow-hidden">
        {filteredParcels.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="font-medium">No parcels found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tracking</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Address</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Weight</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Region</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredParcels.map((parcel) => (
                  <tr key={parcel.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{parcel.tracking_code}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{parcel.address}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{parcel.weight_kg} kg</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPriorityColor(parcel.priority)}`}>
                        {parcel.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{parcel.region}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium border ${getStatusColor(parcel.status)}`}>
                        {parcel.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
