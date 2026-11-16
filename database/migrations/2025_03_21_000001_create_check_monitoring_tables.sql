-- OASIS Check Monitoring — Laravel-ready schema
-- Provisional uniqueness and status transition rules must be confirmed with OASIS management.

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE checks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  check_number VARCHAR(64) NOT NULL,
  check_type VARCHAR(32) NOT NULL COMMENT 'Received Check | Issued Check',
  check_date DATE NOT NULL,
  date_received_issued DATE NOT NULL,
  payee_name VARCHAR(255) NOT NULL,
  drawer_name VARCHAR(255) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL,
  -- Sensitive: encrypt at rest in Laravel (e.g. encrypted cast); never log plaintext
  account_number VARCHAR(512) NOT NULL,
  check_amount DECIMAL(15, 2) NOT NULL,
  purpose TEXT NOT NULL,
  reference_number VARCHAR(128) NOT NULL,
  due_date DATE NULL,
  deposit_date DATE NULL,
  clearing_date DATE NULL,
  check_status VARCHAR(32) NOT NULL,
  remarks TEXT NULL,
  prepared_by BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL COMMENT 'Soft delete / archive',

  CONSTRAINT fk_checks_prepared_by FOREIGN KEY (prepared_by) REFERENCES users (id),
  CONSTRAINT fk_checks_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_checks_updated_by FOREIGN KEY (updated_by) REFERENCES users (id),
  CONSTRAINT chk_checks_amount_positive CHECK (check_amount > 0),
  CONSTRAINT chk_checks_type CHECK (check_type IN ('Received Check', 'Issued Check')),
  CONSTRAINT chk_checks_status CHECK (
    check_status IN (
      'Pending',
      'Received',
      'Issued',
      'For Deposit',
      'Deposited',
      'For Clearing',
      'Cleared',
      'Bounced',
      'Cancelled',
      'Voided'
    )
  )
);

-- Provisional uniqueness: number + bank + type among non-deleted rows
CREATE UNIQUE INDEX uq_checks_number_bank_type
  ON checks (check_number, bank_name, check_type, deleted_at);

CREATE INDEX idx_checks_status ON checks (check_status);
CREATE INDEX idx_checks_type ON checks (check_type);
CREATE INDEX idx_checks_bank ON checks (bank_name);
CREATE INDEX idx_checks_check_date ON checks (check_date);
CREATE INDEX idx_checks_due_date ON checks (due_date);
CREATE INDEX idx_checks_deposit_date ON checks (deposit_date);
CREATE INDEX idx_checks_clearing_date ON checks (clearing_date);
CREATE INDEX idx_checks_payee ON checks (payee_name);
CREATE INDEX idx_checks_drawer ON checks (drawer_name);
CREATE INDEX idx_checks_reference ON checks (reference_number);
CREATE INDEX idx_checks_prepared_by ON checks (prepared_by);

CREATE TABLE check_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  check_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT 'supporting',
  -- Private object storage key — never a public URL
  storage_key VARCHAR(512) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,

  CONSTRAINT fk_check_attachments_check FOREIGN KEY (check_id) REFERENCES checks (id),
  CONSTRAINT fk_check_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users (id)
);

CREATE INDEX idx_check_attachments_check ON check_attachments (check_id);

CREATE TABLE check_activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  check_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(64) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NULL,
  -- JSON metadata must never include full account numbers
  metadata JSON NULL,
  performed_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,

  CONSTRAINT fk_check_activities_check FOREIGN KEY (check_id) REFERENCES checks (id),
  CONSTRAINT fk_check_activities_user FOREIGN KEY (performed_by) REFERENCES users (id)
);

CREATE INDEX idx_check_activities_check ON check_activities (check_id);
CREATE INDEX idx_check_activities_created ON check_activities (created_at);
