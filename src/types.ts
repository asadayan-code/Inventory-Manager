export type UserRole = 'OWNER' | 'CASHIER';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active?: boolean;
}

export interface Category {
  id: number;
  name: string;
  description: string;
}

export interface Brand {
  id: number;
  name: string;
  description: string;
}

export interface ProductVariant {
  id?: number;
  variant_id?: number;
  product_id?: number;
  product_name?: string;
  category_name?: string;
  brand_name?: string;
  sku: string;
  barcode: string;
  variant_name: string;
  cost_paisa?: number;
  retail_price_paisa: number;
  wholesale_price_paisa?: number;
  min_price_paisa: number;
  reorder_level?: number;
  stock_on_hand: number;
  is_service: boolean;
  is_bundle: boolean;
  is_serialized: boolean;
  warranty_months: number;
  car_compatibility: string;
  image_url?: string;
  bundle_components?: Array<{
    quantity: number;
    sku: string;
    comp_name: string;
    comp_variant: string;
    comp_stock: number;
  }>;
}

export interface CartItem {
  variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode: string;
  quantity: number;
  unit_price_paisa: number;
  min_price_paisa: number;
  cost_paisa?: number;
  discount_paisa: number;
  warranty_months: number;
  is_service: boolean;
  is_bundle: boolean;
  is_serialized: boolean;
  stock_on_hand: number;
  serials: string[];
}

export interface PaymentEntry {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'JAZZCASH' | 'EASYPAISA';
  amount_paisa: number;
}

export interface BillItem {
  id: number;
  bill_id: number;
  product_variant_id: number;
  sku: string;
  name: string;
  variant_name: string;
  quantity: number;
  unit_cost_paisa: number;
  unit_retail_paisa: number;
  unit_min_paisa: number;
  unit_price_paisa: number;
  discount_paisa: number;
  line_total_paisa: number;
  warranty_months: number;
  serial_numbers: string[];
  is_service: boolean;
  is_bundle: boolean;
}

export interface Bill {
  id: number;
  bill_number: string;
  customer_id?: number;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  car_registration?: string;
  car_model?: string;
  cashier_id: number;
  cashier_username: string;
  cashier_name?: string;
  status: 'COMPLETED' | 'HOLD' | 'CANCELLED' | 'RETURNED';
  subtotal_paisa: number;
  discount_paisa: number;
  tax_rate_percent: number;
  tax_paisa: number;
  total_paisa: number;
  paid_paisa: number;
  balance_paisa: number;
  payment_methods_json: string;
  is_quote: boolean;
  quote_validity_date?: string;
  is_advance: boolean;
  notes?: string;
  reprinted_count: number;
  is_duplicate?: boolean;
  total_in_words?: string;
  created_at: string;
  items?: BillItem[];
  payments?: any[];
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  car_registration?: string;
  car_model?: string;
  customer_type: 'RETAIL' | 'WHOLESALE';
  balance_paisa: number;
  notes?: string;
  created_at?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  balance_paisa: number;
  notes?: string;
}

export interface JobCard {
  id: number;
  job_number: string;
  car_make: string;
  car_model: string;
  car_year: string;
  car_registration: string;
  customer_id?: number;
  customer_name: string;
  customer_phone?: string;
  technician_name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BILLED';
  bill_id?: number;
  work_description: string;
  parts_used: Array<{
    variant_id?: number;
    name: string;
    quantity: number;
    price_paisa: number;
  }>;
  labour_charge_paisa: number;
  notes?: string;
  created_at: string;
}

export interface CashRegister {
  id: number;
  opening_time: string;
  closing_time?: string;
  opened_by_user_id: number;
  opened_by_name?: string;
  opening_cash_paisa: number;
  expected_cash_paisa?: number;
  counted_cash_paisa?: number;
  difference_paisa?: number;
  notes?: string;
  status: 'OPEN' | 'CLOSED';
}

export interface Expense {
  id: number;
  category: 'RENT' | 'ELECTRICITY' | 'SALARY' | 'TEA_SNACKS' | 'TRANSPORT' | 'MAINTENANCE' | 'OTHER';
  amount_paisa: number;
  payment_method: string;
  recipient: string;
  recorded_by?: string;
  notes?: string;
  expense_date: string;
  created_at: string;
}
