import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPayments } from '../api/client';
import { StatusBadge } from './StatusBadge';

const STATUSES = ['all', 'initiated', 'processing', 'completed', 'failed', 'reversed'];

export function TransactionList() {
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);

    const { data, isLoading, error } = useQuery({
        queryKey: ['payments', status, page],
        queryFn: () => getPayments({ status, page: String(page), limit: '20' }),
        refetchInterval: 10000, // Poll every 10s for status updates
    });

    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
    );

    if (error) return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            Failed to load transactions. Please try again.
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex border-b border-gray-100 pb-1 gap-2 flex-wrap">
                {STATUSES.map(s => (
                    <button
                        key={s}
                        onClick={() => { setStatus(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors
              ${status === s
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                {['Reference', 'Sender', 'Recipient', 'Amount', 'FX Rate', 'Status', 'Created', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data?.data?.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                                        No transactions found
                                    </td>
                                </tr>
                            )}
                            {data?.data?.map((txn: any) => (
                                <tr key={txn.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <Link to={`/transactions/${txn.id}`} className="font-mono text-blue-600 hover:text-blue-800 font-medium">
                                            {txn.reference}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-gray-900 font-medium">{txn.sender_name}</div>
                                        <div className="text-gray-500 text-xs">{txn.source_currency} Account</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-gray-900 font-medium">{txn.recipient_name}</div>
                                        <div className="text-gray-500 text-xs">{txn.dest_currency} Account</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-gray-900 font-medium">
                                            {Number(txn.source_amount).toLocaleString()} {txn.source_currency}
                                        </div>
                                        <div className="text-gray-400 text-xs italic">
                                            → {Number(txn.dest_amount).toLocaleString()} {txn.dest_currency}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                        {Number(txn.fx_rate).toFixed(6)}
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={txn.status} /></td>
                                    <td className="px-4 py-3 text-gray-400 text-xs">
                                        {new Date(txn.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <Link
                                                to={`/transactions/${txn.id}`}
                                                className="text-blue-600 hover:text-blue-800 font-bold text-[10px] uppercase tracking-widest bg-blue-50 px-2 py-1 rounded transition-colors"
                                            >
                                                View
                                            </Link>
                                            <button
                                                onClick={() => {
                                                    const win = window.open(`/transactions/${txn.id}`, '_blank');
                                                    if (win) {
                                                        win.onload = () => {
                                                            setTimeout(() => {
                                                                win.print();
                                                            }, 1000);
                                                        };
                                                    }
                                                }}
                                                className="text-gray-600 hover:text-gray-900 font-bold text-[10px] uppercase tracking-widest bg-gray-50 px-2 py-1 rounded transition-colors border border-gray-100"
                                            >
                                                Print
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {data?.pagination && (
                    <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500 bg-gray-50">
                        <span>
                            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.pagination.total)} of {data.pagination.total}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 rounded border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
                                disabled={page >= data.pagination.pages}
                                className="px-3 py-1 rounded border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
