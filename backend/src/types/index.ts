export type TransactionStatus = 'initiated' | 'processing' | 'completed' | 'failed' | 'reversed';

export interface Account {
    id: string;
    owner_name: string;
    owner_email: string;
    currency_code: string;
    balance: string;
    locked_balance: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface FxQuote {
    id: string;
    source_currency: string;
    dest_currency: string;
    rate: string;
    inverse_rate: string;
    source_amount: string;
    dest_amount: string;
    fee_amount: string;
    expires_at: string;
}

export interface Transaction {
    id: string;
    reference: string;
    sender_account_id: string;
    recipient_account_id: string;
    source_currency: string;
    dest_currency: string;
    source_amount: string;
    dest_amount: string;
    fee_amount: string;
    fx_rate: string;
    fx_quote_id: string;
    status: TransactionStatus;
    provider_reference: string | null;
    idempotency_key: string;
    metadata: Record<string, unknown>;
    initiated_at: string;
    processing_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
    reversed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface LedgerEntry {
    id: string;
    transaction_id: string;
    account_id: string;
    entry_type: 'debit' | 'credit';
    purpose: string;
    amount: string;
    currency_code: string;
    balance_before: string;
    balance_after: string;
    notes: string | null;
    created_at: string;
}

export interface WebhookEvent {
    id: string;
    provider: string;
    event_id: string | null;
    raw_headers: Record<string, string>;
    raw_body: string;
    signature_valid: boolean;
    processed: boolean;
    processed_at: string | null;
    processing_error: string | null;
    transaction_id: string | null;
    created_at: string;
}

export const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
    initiated: ['processing'],
    processing: ['completed', 'failed'],
    failed: ['reversed'],
    completed: ['reversed'],
    reversed: [],
};
