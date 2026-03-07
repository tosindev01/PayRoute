import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function FxTicker() {
    const { data: rates, isLoading } = useQuery({
        queryKey: ['fx-rates'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/fx/rates`);
            return res.data;
        },
        refetchInterval: 5000, // Update every 5 seconds
    });

    if (isLoading) return null;

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 w-full md:w-64 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Live FX Rates</h3>
                <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Live</span>
                </div>
            </div>

            <div className="space-y-3">
                {rates?.map((r: any) => (
                    <div key={r.pair} className="flex items-center justify-between group">
                        <div className="flex flex-col">
                            <span className="text-xs font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{r.pair}</span>
                            <span className="text-[10px] text-gray-400 font-medium">Spot Rate</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-xs font-mono font-bold text-gray-800">
                                {Number(r.rate).toFixed(6)}
                            </span>
                            <div className={`flex items-center gap-0.5 text-[10px] font-bold ${r.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {r.trend === 'up' ? '▲' : '▼'} {r.change}%
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="pt-2 border-t border-gray-50">
                <p className="text-[9px] text-gray-400 leading-tight">
                    * Rates are simulated for demonstration. Fees are applied at point of transaction.
                </p>
            </div>
        </div>
    );
}
