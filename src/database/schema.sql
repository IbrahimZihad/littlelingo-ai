-- MySQL 8.4 schema. Applied statement-by-statement by src/database/connection.js.
-- UUIDs are application-generated, so they are fixed-width CHAR rather than VARCHAR.
-- MySQL parses an inline "REFERENCES x" clause but ignores it, so every foreign key
-- is declared as a table constraint instead.
CREATE TABLE IF NOT EXISTS caregivers (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE COLLATE utf8mb4_0900_ai_ci,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS learners (
  id CHAR(36) PRIMARY KEY,
  caregiver_id CHAR(36) NULL,
  level VARCHAR(4) NOT NULL DEFAULT 'L1',
  stars INT NOT NULL DEFAULT 0,
  lessons_completed INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_learners_caregiver (caregiver_id),
  CONSTRAINT fk_learners_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- item_id holds the quiz question id, not the option the child picked, so repeated
-- tries on one question accumulate toward mastery instead of scattering across options.
CREATE TABLE IF NOT EXISTS attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  learner_id CHAR(36) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  skill VARCHAR(32) NOT NULL,
  correct TINYINT NOT NULL,
  session_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attempts_learner_item (learner_id, item_id),
  KEY idx_attempts_learner_session (learner_id, session_id),
  CONSTRAINT fk_attempts_learner FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE,
  CONSTRAINT chk_attempts_correct CHECK (correct IN (0,1))
) ENGINE=InnoDB;

-- The surrogate id is what orders "recently practiced words": MySQL exposes no rowid
-- for a composite-primary-key table.
CREATE TABLE IF NOT EXISTS word_practices (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  learner_id CHAR(36) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_word_practices_learner_item (learner_id, item_id),
  CONSTRAINT fk_word_practices_learner FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  expires_at BIGINT NOT NULL,
  KEY idx_revoked_tokens_expiry (expires_at)
) ENGINE=InnoDB;
