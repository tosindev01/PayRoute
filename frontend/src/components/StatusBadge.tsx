const STATUS_CONFIG = {
    initiated: { label: 'Initiated', bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
    processing: { label: 'Processing', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400 animate-pulse' },
    completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
    failed: { label: 'Failed', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
    reversed: { label: 'Reversed', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
};

export function StatusBadge({ status }: { status: string }) {
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.initiated;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}
