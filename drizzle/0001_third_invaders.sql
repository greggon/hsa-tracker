PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`service_date` text NOT NULL,
	`amount_cents` integer,
	`provider` text,
	`reimbursed_at` integer,
	`reimbursed_amount_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "user_id", "service_date", "amount_cents", "provider", "reimbursed_at", "reimbursed_amount_cents", "created_at", "updated_at", "deleted_at") SELECT "id", "user_id", "service_date", "amount_cents", "provider", "reimbursed_at", "reimbursed_amount_cents", "created_at", "updated_at", "deleted_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_expenses_outstanding` ON `expenses` (`user_id`,`reimbursed_at`,`deleted_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `hsa_opened_on` text;