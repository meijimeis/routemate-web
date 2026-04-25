import DashboardLayout from "@/components/layout/DashboardLayout";
import DeliveryAssignment from "@/components/assignment/DeliveryAssignment";

export default function AssignmentPage() {
  return (
    <DashboardLayout>
      <div>
        <h1 className="text-3xl font-bold text-black mb-2">Assign Deliveries</h1>
        <p className="text-gray-600 mb-8">Quickly assign parcels to riders or plan complex routes</p>

        {/* Divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-sm text-gray-600 font-medium">Advanced Route Planning</span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        {/* Advanced Assignment */}
        <section>
          <DeliveryAssignment />
        </section>
      </div>
    </DashboardLayout>
  );
}
