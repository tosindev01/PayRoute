import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getAccounts, getFxQuote, initiatePayment } from '../api/client';

/**
 * Payment Initiation Component
 * 
 * Features:
 * 1. Multi-currency account selection
 * 2. Live FX Quote acquisition with TTL countdown
 * 3. Idempotency key generation per submission
 * 4. Optimistic UI with Success Modal upon broadcast
 */

export function PaymentForm() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        sender_account_id: '',
        recipient_account_id: '',
        source_amount: '',
        source_currency: 'NGN',
        dest_currency: 'USD',
    });
    const [quote, setQuote] = useState<any | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const [successData, setSuccessData] = useState<any | null>(null);
    const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });

    const senderAccounts = accounts?.filter((a: any) => a.currency_code === 'NGN') || [];
    const recipientAccounts = accounts?.filter((a: any) => a.currency_code !== 'NGN') || [];

    const mutation = useMutation({
        mutationFn: ({ data, key }: { data: typeof form; key: string }) =>
            initiatePayment({ ...data, source_amount: parseFloat(data.source_amount) }, key),
        onSuccess: (txn) => {
            setSuccessData(txn);
            // No direct navigate here, we show modal
        },
    });

    const fetchQuote = async () => {
        if (!form.source_amount || parseFloat(form.source_amount) <= 0) return;
        setQuoteLoading(true);
        try {
            const q = await getFxQuote({
                source_currency: form.source_currency,
                dest_currency: form.dest_currency,
                source_amount: parseFloat(form.source_amount),
            });
            setQuote(q);
        } catch (e) {
            console.error(e);
        } finally {
            setQuoteLoading(false);
        }
    };

    useEffect(() => {
        setQuote(null);
        setConfirmed(false);
    }, [form.source_amount, form.dest_currency]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!confirmed || !quote) return;
        const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        mutation.mutate({ data: form, key: idempotencyKey });
    };

    return (
        <div className="max-w-xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 tracking-tight">Initiate Payment</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Fast-Track Bridge</p>
                        </div>
                    </div>
                    <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-md shadow-blue-100">Live</span>
                </div>

                {/* Sender */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Debit Account (Source)</label>
                    <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        value={form.sender_account_id}
                        onChange={e => setForm(f => ({ ...f, sender_account_id: e.target.value }))}
                        required
                    >
                        <option value="">Select sender account...</option>
                        {senderAccounts.map((a: any) => (
                            <option key={a.id} value={a.id}>
                                {a.owner_name} ({Number(a.balance).toLocaleString()} {a.currency_code})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Recipient */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Recipient Account (Destination)</label>
                    <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        value={form.recipient_account_id}
                        onChange={e => {
                            const acct = accounts?.find((a: any) => a.id === e.target.value);
                            setForm(f => ({ ...f, recipient_account_id: e.target.value, dest_currency: acct?.currency_code || f.dest_currency }));
                        }}
                        required
                    >
                        <option value="">Select recipient account...</option>
                        {recipientAccounts.map((a: any) => (
                            <option key={a.id} value={a.id}>
                                {a.owner_name} ({a.currency_code})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Amount */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Amount (NGN)</label>
                    <div className="relative">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                            value={form.source_amount}
                            onChange={e => setForm(f => ({ ...f, source_amount: e.target.value }))}
                            required
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <span className="text-gray-400 font-bold text-xs">NGN</span>
                        </div>
                    </div>
                </div>

                {/* Get Quote Button */}
                <button
                    type="button"
                    onClick={fetchQuote}
                    disabled={quoteLoading || !form.source_amount || !form.recipient_account_id}
                    className="w-full bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold py-2.5 rounded-lg text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                    {quoteLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                            Calculating Exchange Rate...
                        </>
                    ) : 'Request FX Quote'}
                </button>

                {/* Quote Display */}
                {quote && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-blue-700 font-medium">Locked Exchange Rate</span>
                            <span className="font-mono font-bold text-blue-900 bg-white px-2 py-0.5 rounded shadow-sm border border-blue-100">
                                1 NGN = {Number(quote.rate).toFixed(6)} {form.dest_currency}
                            </span>
                        </div>

                        <div className="flex justify-between items-center text-sm pt-1">
                            <span className="text-blue-700 font-medium">Service Fee (0.5%)</span>
                            <span className="font-semibold text-blue-900">{Number(quote.fee_amount).toLocaleString()} NGN</span>
                        </div>

                        <div className="border-t border-blue-200 pt-3 flex justify-between items-end">
                            <div>
                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Recipient Receives</div>
                                <div className="text-2xl font-black text-green-700">
                                    {Number(quote.dest_amount).toLocaleString()} <span className="text-sm font-bold opacity-75">{quote.dest_currency}</span>
                                </div>
                            </div>
                        </div>

                        <div className="text-[10px] text-blue-400 flex items-center gap-1.5 opacity-75">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Quote valid until {new Date(quote.expires_at).toLocaleTimeString()}
                        </div>

                        <label className="flex items-start gap-2.5 pt-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={e => setConfirmed(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs text-blue-800 font-medium leading-relaxed group-hover:text-blue-600 transition-colors">
                                I verify that the accounts selected and the converted amounts are correct. This action will lock funds in the sender's account.
                            </span>
                        </label>
                    </div>
                )}

                {/* Error Messaging */}
                {mutation.isError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex gap-3 text-red-800">
                        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-xs font-semibold">{(mutation.error as any).response?.data?.error || mutation.error.message}</div>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!confirmed || mutation.isPending || !form.sender_account_id || !form.recipient_account_id}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black py-3 rounded-lg shadow-md shadow-blue-200 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
                >
                    {mutation.isPending ? 'Processing Secure Transfer...' : 'Complete Payment Submission'}
                </button>
            </form>

            {/* Success Modal */}
            {successData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="bg-emerald-500 p-8 flex justify-center">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        </div>
                        <div className="p-8 text-center space-y-4">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900">Payment Initiated!</h3>
                                <p className="text-sm text-gray-500 font-medium">Your request for {Number(successData.source_amount).toLocaleString()} {successData.source_currency} has been broadcast to the provider.</p>
                            </div>

                            <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 border border-gray-100">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-gray-400">
                                    <span>Reference</span>
                                    <span className="text-gray-900 font-mono">{successData.reference}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-gray-400">
                                    <span>Recipient</span>
                                    <span className="text-gray-900">{successData.recipient_name || 'Destination Account'}</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-gray-400">
                                    <span>Est. Delivery</span>
                                    <span className="text-emerald-600">~2 mins</span>
                                </div>
                            </div>

                            <div className="pt-2 flex flex-col gap-3">
                                <button
                                    onClick={() => navigate(`/transactions/${successData.id}`)}
                                    className="w-full bg-gray-900 text-white font-black py-3 rounded-xl hover:bg-black transition-colors"
                                >
                                    View Live Tracking
                                </button>
                                <button
                                    onClick={() => setSuccessData(null)}
                                    className="w-full text-gray-500 font-bold py-2 text-sm hover:text-gray-900 transition-colors"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
