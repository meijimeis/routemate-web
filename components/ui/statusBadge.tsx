type StatusBadgeProps = {
  status: "Available" | "Offline" | "Busy";
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    Available: "bg-green-100 text-green-700",
    Busy: "bg-yellow-100 text-yellow-700",
    Offline: "bg-gray-200 text-gray-700",
  };

  return (
    <span
      className={`px-3 py-1 text-xs rounded-full font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}
