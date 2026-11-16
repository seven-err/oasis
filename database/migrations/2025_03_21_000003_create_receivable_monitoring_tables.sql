-- OASIS Receivable Monitoring — Laravel-ready schema
-- Collection status, amount paid, remaining balance, and days overdue are derived
-- from due date + valid receivable_collections (may be cached as controlled values).
-- Customer master data lives in customers; invoice rows keep a historical snapshot.

CREATE TABLE customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(64) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  billing_address TEXT NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL COMMENT 'Soft delete',

  UNIQUE KEY uq_customers_client_id (client_id),
  INDEX idx_customers_name (customer_name),
  INDEX idx_customers_contact (contact_number),
  INDEX idx_customers_email (email_address)
);

CREATE TABLE receivables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(64) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  -- Historical snapshot at invoice time (customer master may change later)
  client_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  contact_number VARCHAR(64) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  billing_address TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference_number VARCHAR(128) NOT NULL,
  total_receivable_amount DECIMAL(15, 2) NOT NULL,
  -- Optional expected / preferred method; money source of truth is collections
  payment_method VARCHAR(32) NULL COMMENT 'Cash | Check | Bank Transfer | E-Wallet',
  -- Controlled derived cache optional; application must recompute from collections
  collection_status VARCHAR(16) NULL COMMENT 'Unpaid | Partial | Paid | Overdue',
  collection_follow_up_date DATE NULL,
  remarks TEXT NULL,
  prepared_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL COMMENT 'Soft delete / archive',

  CONSTRAINT fk_receivables_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_receivables_prepared_by FOREIGN KEY (prepared_by) REFERENCES users (id),
  CONSTRAINT fk_receivables_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_receivables_amount_positive CHECK (total_receivable_amount > 0),
  CONSTRAINT chk_receivables_collection_status CHECK (
    collection_status IS NULL
    OR collection_status IN ('Unpaid', 'Partial', 'Paid', 'Overdue')
  ),
  CONSTRAINT chk_receivables_method CHECK (
    payment_method IS NULL
    OR payment_method IN ('Cash', 'Check', 'Bank Transfer', 'E-Wallet')
  )
);

CREATE UNIQUE INDEX uq_receivables_invoice_customer
  ON receivables (invoice_number, customer_id, deleted_at);

CREATE INDEX idx_receivables_invoice ON receivables (invoice_number);
CREATE INDEX idx_receivables_customer ON receivables (customer_id);
CREATE INDEX idx_receivables_client_id ON receivables (client_id);
CREATE INDEX idx_receivables_customer_name ON receivables (customer_name);
CREATE INDEX idx_receivables_transaction_date ON receivables (transaction_date);
CREATE INDEX idx_receivables_invoice_date ON receivables (invoice_date);
CREATE INDEX idx_receivables_due_date ON receivables (due_date);
CREATE INDEX idx_receivables_reference ON receivables (reference_number);
CREATE INDEX idx_receivables_status ON receivables (collection_status);
CREATE INDEX idx_receivables_method ON receivables (payment_method);
CREATE INDEX idx_receivables_follow_up ON receivables (collection_follow_up_date);
CREATE INDEX idx_receivables_prepared_by ON receivables (prepared_by);

CREATE TABLE receivable_collections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receivable_id BIGINT UNSIGNED NOT NULL,
  collection_date DATE NOT NULL,
  amount_collected DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  payment_reference_number VARCHAR(128) NOT NULL,
  bank_name VARCHAR(128) NULL,
  check_number VARCHAR(64) NULL,
  check_id BIGINT UNSIGNED NULL COMMENT 'FK to checks.id — never auto-created',
  remarks TEXT NULL,
  recorded_by BIGINT UNSIGNED NOT NULL,
  is_reversal TINYINT(1) NOT NULL DEFAULT 0,
  reverses_collection_id BIGINT UNSIGNED NULL,
  reversed_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,

  CONSTRAINT fk_receivable_collections_receivable
    FOREIGN KEY (receivable_id) REFERENCES receivables (id),
  CONSTRAINT fk_receivable_collections_check
    FOREIGN KEY (check_id) REFERENCES checks (id),
  CONSTRAINT fk_receivable_collections_recorded_by
    FOREIGN KEY (recorded_by) REFERENCES users (id),
  CONSTRAINT fk_receivable_collections_reverses
    FOREIGN KEY (reverses_collection_id) REFERENCES receivable_collections (id),
  CONSTRAINT chk_receivable_collections_amount_positive CHECK (amount_collected > 0),
  CONSTRAINT chk_receivable_collections_method CHECK (
    payment_method IN ('Cash', 'Check', 'Bank Transfer', 'E-Wallet')
  )
);

CREATE INDEX idx_receivable_collections_receivable ON receivable_collections (receivable_id);
CREATE INDEX idx_receivable_collections_date ON receivable_collections (collection_date);
CREATE INDEX idx_receivable_collections_method ON receivable_collections (payment_method);
CREATE INDEX idx_receivable_collections_payment_ref ON receivable_collections (payment_reference_number);
CREATE INDEX idx_receivable_collections_bank ON receivable_collections (bank_name);
CREATE INDEX idx_receivable_collections_check ON receivable_collections (check_id);
CREATE INDEX idx_receivable_collections_reversed ON receivable_collections (reversed_at);

CREATE TABLE collection_follow_ups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receivable_id BIGINT UNSIGNED NOT NULL,
  follow_up_date DATE NOT NULL,
  follow_up_notes TEXT NOT NULL,
  follow_up_result VARCHAR(255) NULL,
  next_follow_up_date DATE NULL,
  followed_up_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,

  CONSTRAINT fk_collection_follow_ups_receivable
    FOREIGN KEY (receivable_id) REFERENCES receivables (id),
  CONSTRAINT fk_collection_follow_ups_user
    FOREIGN KEY (followed_up_by) REFERENCES users (id)
);

CREATE INDEX idx_collection_follow_ups_receivable ON collection_follow_ups (receivable_id);
CREATE INDEX idx_collection_follow_ups_date ON collection_follow_ups (follow_up_date);
CREATE INDEX idx_collection_follow_ups_next ON collection_follow_ups (next_follow_up_date);

CREATE TABLE receivable_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receivable_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL COMMENT 'Private storage key — never a public URL',
  file_type VARCHAR(128) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,

  CONSTRAINT fk_receivable_attachments_receivable
    FOREIGN KEY (receivable_id) REFERENCES receivables (id),
  CONSTRAINT fk_receivable_attachments_user
    FOREIGN KEY (uploaded_by) REFERENCES users (id)
);

CREATE INDEX idx_receivable_attachments_receivable ON receivable_attachments (receivable_id);

CREATE TABLE receivable_activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receivable_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  metadata JSON NULL,
  performed_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,

  CONSTRAINT fk_receivable_activities_receivable
    FOREIGN KEY (receivable_id) REFERENCES receivables (id),
  CONSTRAINT fk_receivable_activities_user
    FOREIGN KEY (performed_by) REFERENCES users (id)
);

CREATE INDEX idx_receivable_activities_receivable ON receivable_activities (receivable_id);
CREATE INDEX idx_receivable_activities_created ON receivable_activities (created_at);
