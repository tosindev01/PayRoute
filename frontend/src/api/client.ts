import axios from 'axios';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
    timeout: 15000,
});

export const getPayments = (params?: Record<string, string>) =>
    api.get('/payments', { params }).then(r => r.data);

export const getPayment = (id: string) =>
    api.get(`/payments/${id}`).then(r => r.data);

export const getAccounts = () =>
    api.get('/accounts').then(r => r.data);

export const getFxQuote = (data: {
    source_currency: string;
    dest_currency: string;
    source_amount: number;
}) => api.post('/payments/quote', data).then(r => r.data);

export const initiatePayment = (data: Record<string, unknown>, idempotencyKey: string) =>
    api.post('/payments', data, {
        headers: { 'Idempotency-Key': idempotencyKey }
    }).then(r => r.data);
