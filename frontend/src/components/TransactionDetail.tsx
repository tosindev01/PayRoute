import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPayment } from '../api/client';
import { StatusBadge } from './StatusBadge';

const ENTRY_COLORS = {
    debit: 'text-rose-600',
    credit: 'text-emerald-600',
};

export function TransactionDetail() {
    const { id } = useParams<{ id: string }>();
    const { data: txn, isLoading, error } = useQuery({
        queryKey: ['payment', id],
        queryFn: () => getPayment(id!),
        refetchInterval: (data: any) =>
            data?.status === 'processing' || data?.status === 'initiated' ? 3000 : false,
    });

    if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
    if (error || !txn) return <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-100 text-center font-bold">Transaction details could not be retrieved.</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    body { background: white !important; }
                    .max-w-4xl { max-width: 100% !important; margin: 0 !important; }
                    .shadow-sm { border: none !important; box-shadow: none !important; }
                    .rounded-2xl { border-radius: 0 !important; border: 1px solid #eee !important; }
                }
            `}</style>

            <div className="flex items-center justify-between no-print">
                <div className="space-y-1">
                    <Link to="/" className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-gray-900 font-mono">{txn.reference}</h1>
                        <StatusBadge status={txn.status} />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Print Receipt
                    </button>
                    <div className="text-right">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Transaction Date</div>
                        <div className="text-sm font-semibold text-gray-800">{new Date(txn.created_at).toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Print Header (Only visible when printing) */}
            <div className="hidden print-only py-8 border-b-2 border-gray-900 mb-8">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter">PayRoute</h1>
                        <p className="text-xs font-bold text-gray-500 uppercase">Transaction Receipt</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-black font-mono">{txn.reference}</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">{new Date(txn.created_at).toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Details */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Payment Summary</h3>
                            <span className="text-[10px] bg-white border border-gray-200 px-2 py-0.5 rounded font-bold text-gray-500">ID: {txn.id.slice(0, 8)}</span>
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-4">
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sender</div>
                                <div className="font-bold text-gray-900 border-l-2 border-blue-500 pl-3">{txn.sender_name}</div>
                                <div className="text-xs text-gray-500 pl-3 mt-0.5">{txn.sender_email}</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Recipient</div>
                                <div className="font-bold text-gray-900 border-l-2 border-indigo-500 pl-3">{txn.recipient_name}</div>
                                <div className="text-xs text-gray-500 pl-3 mt-0.5">{txn.recipient_email}</div>
                            </div>
                            <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Source Amount</div>
                                <div className="text-lg font-black text-blue-900">{Number(txn.source_amount).toLocaleString()} <span className="text-xs">{txn.source_currency}</span></div>
                            </div>
                            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
                                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Recipient Gets</div>
                                <div className="text-lg font-black text-emerald-900">{Number(txn.dest_amount).toLocaleString()} <span className="text-xs">{txn.dest_currency}</span></div>
                            </div>
                            <div className="col-span-2 grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">FX Rate</div>
                                    <div className="text-xs font-mono font-bold text-gray-700 bg-gray-50 px-2 py-1 rounded inline-block">1:{Number(txn.fx_rate).toFixed(6)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Service Fee</div>
                                    <div className="text-xs font-bold text-gray-700">{Number(txn.fee_amount).toLocaleString()} {txn.source_currency}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Provider Ref</div>
                                    <div className="text-xs font-mono font-bold text-gray-700 truncate" title={txn.provider_reference || 'Pending'}>{txn.provider_reference || 'Waiting...'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Ledger Entries */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Financial Ledger (Double-Entry)</h3>
                        </div>
                        <div className="p-6">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-gray-400 font-bold uppercase tracking-widest border-b border-gray-100">
                                        <th className="pb-3 text-left w-1/3">Account</th>
                                        <th className="pb-3 text-left">Type</th>
                                        <th className="pb-3 text-right">Debit/Credit</th>
                                        <th className="pb-3 text-right">Closing Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {txn.ledger_entries?.map((e: any) => (
                                        <tr key={e.id} className="group">
                                            <td className="py-3">
                                                <div className="font-bold text-gray-900">{e.account_name}</div>
                                                <div className="text-[10px] text-gray-400 font-medium group-hover:text-blue-500 transition-colors uppercase">{e.purpose.replace('_', ' ')}</div>
                                            </td>
                                            <td className="py-3">
                                                <span className={`font-black uppercase tracking-tighter text-[10px] px-1.5 py-0.5 rounded ${e.entry_type === 'debit' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                                                    {e.entry_type}
                                                </span>
                                            </td>
                                            <td className={`py-3 text-right font-black font-mono text-sm ${ENTRY_COLORS[e.entry_type as keyof typeof ENTRY_COLORS]}`}>
                                                {e.entry_type === 'debit' ? '−' : '+'}{Number(e.amount).toLocaleString()}
                                            </td>
                                            <td className="py-3 text-right font-bold font-mono text-gray-600">
                                                {Number(e.balance_after).toLocaleString()} <span className="text-[9px] opacity-60">{e.currency_code}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Timeline Sidebar */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-full">
                        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Status Audit Log</h3>
                        </div>
                        <div className="p-6 relative">
                            <div className="absolute left-[31px] top-6 bottom-6 w-px bg-gray-100" />
                            <ol className="space-y-8 relative">
                                {txn.status_history?.map((h: any, idx: number) => (
                                    <li key={h.id} className="flex gap-4">
                                        <div className={`relative z-10 w-4 h-4 rounded-full mt-1.5 ring-4 ring-white ${idx === txn.status_history.length - 1 ? 'bg-blue-600 ring-blue-100 scale-125' : 'bg-gray-300'}`} />
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-xs text-gray-900 uppercase tracking-tight leading-none">{h.to_status}</span>
                                                <span className="text-[9px] font-bold text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded uppercase">{h.triggered_by}</span>
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-400">{new Date(h.created_at).toLocaleString()}</div>
                                            {h.reason && (
                                                <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 mt-2">
                                                    <p className="text-[10px] font-medium text-gray-600 italic leading-relaxed">"{h.reason}"</p>
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
