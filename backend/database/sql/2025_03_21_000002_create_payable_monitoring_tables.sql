-- OASIS Payable Monitoring — Laravel-ready schema
-- Approval and payment status are independent. Payment status is derived from
-- payment history and due dates (may be cached as a controlled derived value).
-- Rejected payables are retained for history and excluded from obligation totals.

CREATE TABLE payable_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  UNIQUE KEY uq_payable_categories_name (name)
);

CREATE TABLE payables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payee_name VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  -- Optional expected / preferred method; source of truth for money is payable_payments
  payment_method VARCHAR(32) NULL COMMENT 'Cash | Check | Bank Transfer | E-Wallet',
  reference_number VARCHAR(128) NOT NULL,
  -- Controlled derived cache optional; application must recompute from payments
  payment_status VARCHAR(16) NULL COMMENT 'Unpaid | Partial | Paid | Overdue',
  approval_status VARCHAR(16) NOT NULL DEFAULT 'Pending',
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL COMMENT 'Soft delete / archive',

  CONSTRAINT fk_payables_category FOREIGN KEY (category_id) REFERENCES payable_categories (id),
  CONSTRAINT fk_payables_approved_by FOREIGN KEY (approved_by) REFERENCES users (id),
  CONSTRAINT fk_payables_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_payables_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_payables_amount_positive CHECK (total_amount > 0),
  CONSTRAINT chk_payables_approval CHECK (
    approval_status IN ('Pending', 'Approved', 'Rejected')
  ),
  CONSTRAINT chk_payables_payment_status CHECK (
    payment_status IS NULL
    OR payment_status IN ('Unpaid', 'Partial', 'Paid', 'Overdue')
  ),
  CONSTRAINT chk_payables_method CHECK (
    payment_method IS NULL
    OR payment_method IN ('Cash', 'Check', 'Bank Transfer', 'E-Wallet')
  ),
  CONSTRAINT chk_payables_rejection CHECK (
    approval_status <> 'Rejected'
    OR (rejection_reason IS NOT NULL AND CHAR_LENGTH(TRIM(rejection_reason)) > 0)
  )
);

CREATE UNIQUE INDEX uq_payables_invoice_payee
  ON payables (invoice_number, payee_name, deleted_at);

CREATE INDEX idx_payables_approval ON payables (approval_status);
CREATE INDEX idx_payables_payment_status ON payables (payment_status);
CREATE INDEX idx_payables_category ON payables (category_id);
CREATE INDEX idx_payables_payee ON payables (payee_name);
CREATE INDEX idx_payables_invoice ON payables (invoice_number);
CREATE INDEX idx_payables_invoice_date ON payables (invoice_date);
CREATE INDEX idx_payables_due_date ON payables (due_date);
CREATE INDEX idx_payables_reference ON payables (reference_number);
CREATE INDEX idx_payables_method ON payables (payment_method);

CREATE TABLE payable_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payable_id BIGINT UNSIGNED NOT NULL,
  payment_date DATE NOT NULL,
  amount_paid DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  reference_number VARCHAR(128) NOT NULL,
  check_id BIGINT UNSIGNED NULL COMMENT 'FK to checks.id — never auto-created',
  remarks TEXT NULL,
  recorded_by BIGINT UNSIGNED NOT NULL,
  is_reversal TINYINT(1) NOT NULL DEFAULT 0,
  reverses_payment_id BIGINT UNSIGNED NULL,
  reversed_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,

  CONSTRAINT fk_payable_payments_payable FOREIGN KEY (payable_id) REFERENCES payables (id),
  CONSTRAINT fk_payable_payments_check FOREIGN KEY (check_id) REFERENCES checks (id),
  CONSTRAINT fk_payable_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id),
  CONSTRAINT fk_payable_payments_reverses FOREIGN KEY (reverses_payment_id) REFERENCES payable_payments (id),
  CONSTRAINT chk_payable_payments_amount_positive CHECK (amount_paid > 0),
  CONSTRAINT chk_payable_payments_method CHECK (
    payment_method IN ('Cash', 'Check', 'Bank Transfer', 'E-Wallet')
  )
);

CREATE INDEX idx_payable_payments_payable ON payable_payments (payable_id);
CREATE INDEX idx_payable_payments_date ON payable_payments (payment_date);
CREATE INDEX idx_payable_payments_method ON payable_payments (payment_method);
CREATE INDEX idx_payable_payments_check ON payable_payments (check_id);
CREATE INDEX idx_payable_payments_reversed ON payable_payments (reversed_at);

CREATE TABLE payable_activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payable_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  previous_approval_status VARCHAR(16) NULL,
  new_approval_status VARCHAR(16) NULL,
  metadata JSON NULL,
  performed_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,

  CONSTRAINT fk_payable_activities_payable FOREIGN KEY (payable_id) REFERENCES payables (id),
  CONSTRAINT fk_payable_activities_user FOREIGN KEY (performed_by) REFERENCES users (id)
);

CREATE INDEX idx_payable_activities_payable ON payable_activities (payable_id);
CREATE INDEX idx_payable_activities_created ON payable_activities (created_at);

-- Seed default categories (run once in seeder / migration)
-- INSERT INTO payable_categories (name, is_active, created_at, updated_at) VALUES
-- ('Utilities', 1, NOW(), NOW()),
-- ('Supplies', 1, NOW(), NOW()),
-- ('Services', 1, NOW(), NOW()),
-- ('Office Expenses', 1, NOW(), NOW()),
-- ('Transportation', 1, NOW(), NOW()),
-- ('Maintenance', 1, NOW(), NOW()),
-- ('Equipment', 1, NOW(), NOW()),
-- ('Rent', 1, NOW(), NOW()),
-- ('Other', 1, NOW(), NOW());
